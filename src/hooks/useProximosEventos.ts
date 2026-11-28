import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { inicioDeHoyLocal } from '../lib/fechaCartelera';
import { mapEventoFromDB } from '../context/EventosContext';
import type { Evento } from '../types';
import type { TipoTenant } from './useTenantCrm';

/** Borradores y cancelados se descartan en JS: se piden de más para poder cortar a `limite`. */
const CANDIDATOS_EXTRA = 10;

const MENSAJE_ERROR = 'No se pudieron cargar los próximos eventos.';

/**
 * Spec 193 — la pertenencia de una banda a un evento: la del muro (`muro_evento_es_de`:
 * quien lo creó, la cuenta como banda principal `musico_id` o el músico detrás de una
 * ficha) más las bandas adicionales de `event_artists`, por cuenta o por ficha.
 * Devuelve el filtro para `.or()` sobre `events`.
 */
async function filtroDeBanda(id: string): Promise<string> {
  const fichas = await supabase.from('artists').select('id').eq('profile_id', id);
  if (fichas.error) throw fichas.error;
  const idsFichas: string[] = (fichas.data ?? []).map((f: any) => f.id);

  const condicionesFilas = [`musico_id.eq.${id}`];
  if (idsFichas.length > 0) condicionesFilas.push(`artist_id.in.(${idsFichas.join(',')})`);
  const filas = await supabase.from('event_artists').select('event_id').or(condicionesFilas.join(','));
  if (filas.error) throw filas.error;
  const idsEventos = [...new Set<string>((filas.data ?? []).map((f: any) => f.event_id))];

  const condiciones = [`created_by.eq.${id}`, `musico_id.eq.${id}`];
  if (idsFichas.length > 0) condiciones.push(`artist_id.in.(${idsFichas.join(',')})`);
  if (idsEventos.length > 0) condiciones.push(`id.in.(${idsEventos.join(',')})`);
  return condiciones.join(',');
}

/** Port de `getProximosEventos` de sonopolisWeb/libs/data/muro.js (W-316 + W-348). */
async function leerProximosEventos(tipo: TipoTenant, id: string, limite: number): Promise<Evento[]> {
  let consulta = supabase
    .from('events')
    .select('*')
    // Desde la medianoche: un evento de hoy que ya empezó sigue en la lista.
    .gte('comienza_at', inicioDeHoyLocal())
    .not('visible_en_cartelera', 'is', false);

  consulta = tipo === 'venue' ? consulta.eq('venue_id', id) : consulta.or(await filtroDeBanda(id));

  const { data, error } = await consulta
    .order('comienza_at', { ascending: true })
    .limit(limite + CANDIDATOS_EXTRA);
  if (error) throw error;

  return (data ?? [])
    .filter((e: any) => e.status !== 'draft' && e.status !== 'cancelled')
    .slice(0, limite)
    .map(mapEventoFromDB);
}

/**
 * Spec 193 — hasta `limite` próximos eventos de un local (`venue`) o banda (`musician`),
 * del más cercano al más lejano. Funciona sin sesión (llave anónima).
 *
 * Un error deja `eventos: null`, no `[]`: «sin eventos» cuando no se pudo leer sería
 * falso (misma regla que `useMuro`). Sin `id` no consulta y devuelve `eventos: []`.
 */
export function useProximosEventos(
  tipo: TipoTenant,
  id: string | null | undefined,
  limite: number
): {
  eventos: Evento[] | null;      // null = cargando o error de lectura
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
} {
  const [eventos, setEventos] = useState<Evento[] | null>(id ? null : []);
  const [cargando, setCargando] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);
  // Cada lectura toma un número; solo la última escribe el estado.
  const lectura = useRef(0);

  const recargar = useCallback(async () => {
    const turno = ++lectura.current;
    if (!id) {
      setEventos([]);
      setCargando(false);
      setError(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const leidos = await leerProximosEventos(tipo, id, limite);
      if (turno !== lectura.current) return;
      setEventos(leidos);
    } catch (e: any) {
      if (turno !== lectura.current) return;
      console.error('[useProximosEventos] no se pudieron leer los eventos:', e?.message ?? e);
      setEventos(null);
      setError(MENSAJE_ERROR);
    } finally {
      if (turno === lectura.current) setCargando(false);
    }
  }, [tipo, id, limite]);

  useEffect(() => {
    // Al cambiar de ficha se suelta la lista anterior; `recargar` a mano no la borra.
    setEventos(id ? null : []);
    recargar();
  }, [id, recargar]);

  return { eventos, cargando, error, recargar };
}
