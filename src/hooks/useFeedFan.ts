import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { mapEventoFromDB } from '../context/EventosContext';
import { musicoAutorDelEvento } from '../lib/cuentaEsBanda';
import { ItemFeed, PerfilMusico, VenueSeguido } from '../types';

interface FeedFanState {
  feed: ItemFeed[];
  loading: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
}

/**
 * Spec 123 — eventos publicados de los músicos y locales que sigo. Hermano de
 * la sección «Feed» de app/(private)/fan/page.js (W-194).
 *
 * Recibe las listas de `useSeguidos` en vez de volver a pedirlas. Al revés
 * que la web (que trae todos los eventos y filtra en memoria), consulta solo
 * los eventos de quien sigo: no hay servidor que cargue la cartelera entera.
 *
 * Spec 188 (W-348) — un músico está en un evento como banda principal
 * (`events.musico_id`), como banda adicional (`event_artists.musico_id`) o como
 * creador, y el autor sale en ese orden; al final el local. `events.artist_id` no
 * se mira: es una ficha de banda sin cuenta y nadie la sigue.
 */
export function useFeedFan(musicos: PerfilMusico[], venues: VenueSeguido[]): FeedFanState {
  // Los ids unidos y no los arreglos: un arreglo nuevo en cada render volvería
  // a consultar en cada render.
  const claveMusicos = musicos.map((m) => m.id).join(',');
  const claveVenues = venues.map((v) => v.id).join(',');
  const [feed, setFeed] = useState<ItemFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const idsMusicos = claveMusicos ? claveMusicos.split(',') : [];
    const idsVenues = claveVenues ? claveVenues.split(',') : [];
    if (idsMusicos.length === 0 && idsVenues.length === 0) {
      setFeed([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Solo las cuentas seguidas: eventId → músicos adicionales, en su orden.
      const adicionales = new Map<string, string[]>();
      if (idsMusicos.length > 0) {
        const { data, error: err } = await supabase
          .from('event_artists')
          .select('event_id, musico_id')
          .in('musico_id', idsMusicos)
          .order('orden', { ascending: true });
        if (err) throw err;
        for (const fila of (data ?? []) as any[]) {
          adicionales.set(fila.event_id, [...(adicionales.get(fila.event_id) ?? []), fila.musico_id]);
        }
      }

      const eventIds = [...adicionales.keys()];
      const clausulas = [
        idsMusicos.length > 0 ? `musico_id.in.(${idsMusicos.join(',')})` : null,
        idsMusicos.length > 0 ? `created_by.in.(${idsMusicos.join(',')})` : null,
        idsVenues.length > 0 ? `venue_id.in.(${idsVenues.join(',')})` : null,
        eventIds.length > 0 ? `id.in.(${eventIds.join(',')})` : null,
      ].filter((c): c is string => c !== null);

      const { data, error: err } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .or(clausulas.join(','))
        .order('created_at', { ascending: false })
        .limit(50);
      if (err) throw err;

      const musicoPorId = new Map(musicos.map((m) => [m.id, m]));
      const venuePorId = new Map(venues.map((v) => [v.id, v]));
      const seguidos = new Set(musicoPorId.keys());
      const items: ItemFeed[] = [];
      for (const evento of (data ?? []).map(mapEventoFromDB)) {
        // Con músico y local seguidos en el mismo evento gana el músico:
        // «publicó» se lee más personal que «programó» (criterio de la web).
        const autorId = musicoAutorDelEvento(evento, adicionales.get(evento.id) ?? [], seguidos);
        const musico = autorId ? musicoPorId.get(autorId) : undefined;
        if (musico) {
          items.push({ evento, autor: { tipo: 'musico', id: musico.id, nombre: musico.nombre } });
          continue;
        }
        const venue = venuePorId.get(evento.venueId);
        if (venue) items.push({ evento, autor: { tipo: 'venue', id: venue.id, nombre: venue.name } });
      }
      items.sort((a, b) => (b.evento.createdAt ?? '').localeCompare(a.evento.createdAt ?? ''));
      setFeed(items);
    } catch (err: any) {
      console.error('[useFeedFan]', err);
      setFeed([]);
      setError(err?.message ?? 'No se pudo cargar el feed');
    } finally {
      setLoading(false);
    }
    // `musicos` y `venues` se leen solo para nombres; la consulta depende de los ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveMusicos, claveVenues]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { feed, loading, error, refrescar: cargar };
}
