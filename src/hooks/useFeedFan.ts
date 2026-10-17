import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { mapEventoFromDB } from '../context/EventosContext';
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
 * El autor sale como en `cuentasDelEvento` de la web: primero la cuenta que
 * reclamó el registro de banda (`artists.profile_id`), después `created_by`,
 * al final el local. Nunca `events.artist_id` contra el id del músico: desde
 * el spec 061 apunta a `artists`, no a `profiles` (bug del W-195).
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
      const perfilPorArtista = new Map<string, string>();
      if (idsMusicos.length > 0) {
        const { data, error: err } = await supabase
          .from('artists')
          .select('id, profile_id')
          .in('profile_id', idsMusicos);
        if (err) throw err;
        for (const a of (data ?? []) as any[]) perfilPorArtista.set(a.id, a.profile_id);
      }

      const artistIds = [...perfilPorArtista.keys()];
      const clausulas = [
        artistIds.length > 0 ? `artist_id.in.(${artistIds.join(',')})` : null,
        idsMusicos.length > 0 ? `created_by.in.(${idsMusicos.join(',')})` : null,
        idsVenues.length > 0 ? `venue_id.in.(${idsVenues.join(',')})` : null,
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
      const items: ItemFeed[] = [];
      for (const evento of (data ?? []).map(mapEventoFromDB)) {
        // Con músico y local seguidos en el mismo evento gana el músico:
        // «publicó» se lee más personal que «programó» (criterio de la web).
        const reclamado = evento.artistId ? perfilPorArtista.get(evento.artistId) : undefined;
        const musico =
          (reclamado ? musicoPorId.get(reclamado) : undefined) ?? musicoPorId.get(evento.createdBy);
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
