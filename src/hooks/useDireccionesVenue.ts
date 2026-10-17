import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface DireccionVenue {
  id: string;
  venueId: string;
  address: string;
  comuna: string | null;
  ciudad: string | null;
  lat: number | null;
  lng: number | null;
  activa: boolean;
  createdAt: string;
}

export interface DatosDireccion {
  address: string;
  comuna?: string | null;
  ciudad?: string | null;
}

export const MAXIMO_DIRECCIONES = 3;

// numeric llega como texto o número según el driver.
function aNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// Mismo mapeo que mapDireccionVenueFromDB de la web (libs/mappers.js:266-278).
function mapDireccionVenue(row: any): DireccionVenue {
  return {
    id: row.id,
    venueId: row.venue_id,
    address: row.address,
    comuna: row.comuna ?? null,
    ciudad: row.ciudad ?? null,
    lat: aNumero(row.lat),
    lng: aNumero(row.lng),
    activa: row.activa === true,
    createdAt: row.created_at,
  };
}

export async function getDireccionesVenue(venueId: string): Promise<DireccionVenue[]> {
  const { data, error } = await supabase
    .from('venue_addresses')
    .select('*')
    .eq('venue_id', venueId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapDireccionVenue);
}

/**
 * Spec 133 — la primera dirección nace activa sola; desde la segunda, activar
 * es un paso aparte (igual que la web, venueAddresses.js:17-22). El tope de 3
 * lo pone el trigger venue_addresses_limite y su mensaje se relanza tal cual.
 * No manda lat/lng: los llena la geocodificación aparte (W-027).
 */
export async function crearDireccion(venueId: string, datos: DatosDireccion): Promise<DireccionVenue> {
  const address = datos.address.trim();
  if (!address) throw new Error('Escribe la dirección.');

  const existentes = await getDireccionesVenue(venueId);
  const { data, error } = await supabase
    .from('venue_addresses')
    .insert({
      venue_id: venueId,
      address,
      comuna: datos.comuna ?? null,
      ciudad: datos.ciudad ?? null,
      activa: existentes.length === 0,
    })
    .select()
    .single();
  if (error) throw error;
  return mapDireccionVenue(data);
}

/**
 * La RPC es security invoker: si quien llama no es el dueño, RLS filtra los
 * update de adentro y la RPC termina sin error sin haber cambiado nada. Por
 * eso se relee y se comprueba que la fila quedó activa.
 */
export async function activarDireccion(venueId: string, direccionId: string): Promise<void> {
  const { error } = await supabase.rpc('activar_direccion_venue', { p_direccion_id: direccionId });
  if (error) throw error;

  const direcciones = await getDireccionesVenue(venueId);
  const activada = direcciones.find((d) => d.id === direccionId);
  if (!activada?.activa) {
    throw new Error('No se pudo activar la dirección. Solo el dueño del local puede cambiarla.');
  }
}

/**
 * La activa no se borra: el trigger de sync no corre en delete, así que
 * venues.address quedaría apuntando a una fila borrada. Un delete filtrado
 * por RLS borra cero filas sin error, por eso se pide .select('id').
 */
export async function eliminarDireccion(direccion: { id: string; activa: boolean }): Promise<void> {
  if (direccion.activa) {
    throw new Error('No puedes borrar la dirección activa. Activa otra primero.');
  }

  const { data, error } = await supabase
    .from('venue_addresses')
    .delete()
    .eq('id', direccion.id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No se pudo borrar la dirección.');
}

interface DireccionesVenueState {
  direcciones: DireccionVenue[];
  cargando: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
  crear: (datos: DatosDireccion) => Promise<void>;
  activar: (direccionId: string) => Promise<void>;
  eliminar: (direccion: DireccionVenue) => Promise<void>;
  puedeAgregar: boolean;
}

/**
 * Spec 133 — no refresca VenuesContext a propósito: crear la primera dirección
 * o activar otra cambia venues.address por el trigger, y quien usa el hook
 * llama useVenues().refresh() después (spec 134). Así no se acopla al contexto
 * que tocan los specs 095 y 115. Los errores se lanzan; el hook no alerta.
 */
export function useDireccionesVenue(venueId: string | undefined): DireccionesVenueState {
  const [direcciones, setDirecciones] = useState<DireccionVenue[]>([]);
  const [cargando, setCargando] = useState(Boolean(venueId));
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    if (!venueId) {
      setDirecciones([]);
      setError(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      setDirecciones(await getDireccionesVenue(venueId));
    } catch (err: any) {
      setError(err?.message ?? 'No se pudieron cargar las direcciones');
    } finally {
      setCargando(false);
    }
  }, [venueId]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  const crear = useCallback(
    async (datos: DatosDireccion) => {
      if (!venueId) throw new Error('Falta el local.');
      await crearDireccion(venueId, datos);
      await refrescar();
    },
    [venueId, refrescar]
  );

  const activar = useCallback(
    async (direccionId: string) => {
      if (!venueId) throw new Error('Falta el local.');
      await activarDireccion(venueId, direccionId);
      await refrescar();
    },
    [venueId, refrescar]
  );

  const eliminar = useCallback(
    async (direccion: DireccionVenue) => {
      await eliminarDireccion(direccion);
      await refrescar();
    },
    [refrescar]
  );

  return {
    direcciones,
    cargando,
    error,
    refrescar,
    crear,
    activar,
    eliminar,
    puedeAgregar: direcciones.length < MAXIMO_DIRECCIONES,
  };
}
