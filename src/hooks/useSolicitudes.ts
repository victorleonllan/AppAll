import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export type EstadoSolicitud = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface SolicitudBolo {
  id: string;
  createdBy: string;
  musicianId: string;
  venueId: string;
  venueNombre: string | null;
  musicoNombre: string | null;
  proposedAt: string | null;
  genre: string | null;
  note: string | null;
  status: EstadoSolicitud;
  respondedAt: string | null;
  createdAt: string;
  propuseYo: boolean; // createdBy === yo: decide qué botones ve cada punta
}

export interface DatosNuevaSolicitud {
  musicianId: string;
  venueId: string;
  proposedAt?: string | null;
  genre?: string | null;
  note?: string | null;
}

interface SolicitudesState {
  solicitudes: SolicitudBolo[];
  cargando: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
  crear: (datos: DatosNuevaSolicitud) => Promise<void>;
  responder: (id: string, status: 'accepted' | 'declined') => Promise<void>;
  cancelar: (id: string) => Promise<void>;
}

/**
 * Spec 131 — solicitudes de bolo músico ↔ local (`booking_requests`, spec 051).
 * Hermano de libs/data/booking.js de la web (W-031, W-055). Quién puede ver,
 * responder o cancelar lo deciden las policies (is_booking_party,
 * is_booking_recipient); acá no se replica, solo se respeta.
 *
 * Diferencia con la web: cada update pide .select('id') y falla si vuelve
 * vacío. Cuando la USING de la policy no deja pasar la fila (ya no está
 * pending), PostgREST no da error sino cero filas — algo que parece guardado
 * y no lo está, el mismo tipo de error que costó el spec 030.
 */
export function useSolicitudes(): SolicitudesState {
  const { user } = useAuth();
  const userId = user?.id;
  const [solicitudes, setSolicitudes] = useState<SolicitudBolo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) {
      setSolicitudes([]);
      setError(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      // Sin filtro: RLS (is_booking_party) ya trae solo las filas donde soy
      // parte. El embed profiles(nombre) no es ambiguo porque created_by
      // apunta a auth.users, no a profiles.
      const { data, error: err } = await supabase
        .from('booking_requests')
        .select('*, venues(name), profiles(nombre)')
        .order('created_at', { ascending: false });
      if (err) throw err;

      const mapeadas: SolicitudBolo[] = ((data ?? []) as any[]).map((db) => ({
        id: db.id,
        createdBy: db.created_by,
        musicianId: db.musician_id,
        venueId: db.venue_id,
        venueNombre: db.venues?.name ?? null,
        musicoNombre: db.profiles?.nombre ?? null,
        proposedAt: db.proposed_at ?? null,
        genre: db.genre ?? null,
        note: db.note ?? null,
        status: db.status as EstadoSolicitud,
        respondedAt: db.responded_at ?? null,
        createdAt: db.created_at,
        propuseYo: db.created_by === userId,
      }));
      setSolicitudes(mapeadas);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudieron cargar las solicitudes');
    } finally {
      setCargando(false);
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Quién va en cada columna lo decide quien llama: el músico se pone a sí
  // mismo como musicianId; el local pone su propio venueId.
  const crear = useCallback(
    async (datos: DatosNuevaSolicitud) => {
      if (!userId) throw new Error('Inicia sesión para enviar una solicitud.');
      const { error: err } = await supabase.from('booking_requests').insert({
        created_by: userId,
        musician_id: datos.musicianId,
        venue_id: datos.venueId,
        proposed_at: datos.proposedAt ?? null,
        genre: datos.genre ?? null,
        note: datos.note ?? null,
      });
      if (err) throw err;
      await cargar();
    },
    [userId, cargar],
  );

  const responder = useCallback(
    async (id: string, status: 'accepted' | 'declined') => {
      if (status !== 'accepted' && status !== 'declined') {
        throw new Error('Respuesta inválida');
      }
      const { data, error: err } = await supabase
        .from('booking_requests')
        .update({ status })
        .eq('id', id)
        .select('id');
      if (err) throw err;
      if (!data || data.length === 0) throw new Error('La solicitud ya no está pendiente.');
      await cargar();
    },
    [cargar],
  );

  const cancelar = useCallback(
    async (id: string) => {
      const { data, error: err } = await supabase
        .from('booking_requests')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select('id');
      if (err) throw err;
      if (!data || data.length === 0) throw new Error('La solicitud ya no está pendiente.');
      await cargar();
    },
    [cargar],
  );

  return { solicitudes, cargando, error, refrescar: cargar, crear, responder, cancelar };
}

/**
 * Ids de la contraparte con solicitud viva (`pending`). Pura, copia de
 * contrapartesConSolicitudViva de booking.js (W-055). `lado` dice qué id
 * extraer: desde el músico la contraparte es el local (`venue`), desde el
 * local es el músico (`musician`).
 *
 * Solo `pending` bloquea: una rechazada no es un veto permanente y una
 * aceptada tampoco (un local que ya te programó es el más probable de volver
 * a hacerlo). Guarda de pantalla, no de integridad: booking_requests no tiene
 * índice único (W-PENDIENTES #18).
 */
export function contrapartesConSolicitudViva(
  solicitudes: SolicitudBolo[],
  lado: 'venue' | 'musician',
): Set<string> {
  return new Set(
    (solicitudes ?? [])
      .filter((s) => s.status === 'pending')
      .map((s) => (lado === 'venue' ? s.venueId : s.musicianId)),
  );
}
