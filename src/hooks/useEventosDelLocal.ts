import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { EventoStatus } from '../types';

export interface EventoDelLocal {
  id: string; artista: string; fecha: string; hora: string;
  comienzaAt: string; status: EventoStatus; imagen: string | null;
}

interface EventosDelLocalState {
  cargando: boolean;
  error: string | null;
  eventos: EventoDelLocal[];
  refrescar: () => Promise<void>;
}

/**
 * Spec 127 — próximas fechas de UN local, solo lectura y solo para su ficha.
 * Hook aparte y no EventosContext, mismo precedente que useEntradasEvento (039).
 * «Próximas» se decide por `comienza_at` (spec 045): `fecha` es texto libre.
 */
export function useEventosDelLocal(venueId: string | undefined): EventosDelLocalState {
  const [eventos, setEventos] = useState<EventoDelLocal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!venueId) return;
    setCargando(true);
    setError(null);
    try {
      // 12 h hacia atrás: el show de esta noche sigue visible mientras ocurre
      // (mismo margen que el spec 125). El gte descarta los comienza_at NULL.
      // `draft` fuera aunque RLS ya lo esconda: el dueño que mira su local no
      // debe ver sus borradores como fechas públicas.
      const { data, error: err } = await supabase
        .from('events')
        .select('id, artist_name, fecha, hora, comienza_at, status, imagen')
        .eq('venue_id', venueId)
        .in('status', ['published', 'cancelled'])
        .gte('comienza_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
        .order('comienza_at', { ascending: true })
        .limit(20);
      if (err) throw err;
      setEventos(
        ((data ?? []) as any[]).map((e) => ({
          id: e.id,
          artista: e.artist_name ?? '',
          fecha: e.fecha ?? '',
          hora: e.hora ?? '',
          comienzaAt: e.comienza_at,
          status: e.status,
          imagen: e.imagen ?? null,
        }))
      );
    } catch (e: any) {
      setError(e?.message ?? 'No se pudieron cargar las fechas del local');
    } finally {
      setCargando(false);
    }
  }, [venueId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { cargando, error, eventos, refrescar: cargar };
}
