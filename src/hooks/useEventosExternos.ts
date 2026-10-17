import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { inicioDeHoyLocal } from '../lib/fechaCartelera';
import { EventoExterno } from '../types';

/** Mapeo dentro del hook: es la única puerta a `external_events` en la app. */
function mapEventoExternoFromDB(db: any): EventoExterno {
  return {
    id: db.id,
    sourceSlug: db.source_slug,
    fuenteNombre: db.event_sources?.nombre ?? db.source_slug,
    sourceUrl: db.source_url,
    titulo: db.titulo,
    comienzaAt: db.comienza_at,
    venueNombre: db.venue_nombre ?? null,
    comuna: db.comuna ?? null,
    pais: db.pais,
    imagen: db.imagen ?? null,
    genero: db.genero ?? null,
  };
}

/**
 * Spec 119 — eventos scrapeados del país activo, misma consulta que
 * `getEventosExternos` de la web (`libs/data/externalEvents.js:28`): publicados,
 * sin duplicado interno, no desaparecidos y desde la medianoche de hoy.
 *
 * Sin mock: si falla, lista vacía y el error expuesto. Degradar a vacío es lo
 * mismo que hace la web (`page.js:44`): la cartelera se ve con menos eventos, no rota.
 */
export function useEventosExternos(pais: string) {
  const [externos, setExternos] = useState<EventoExterno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('external_events')
        .select('*, event_sources(nombre)')
        .eq('status', 'publicado')
        .is('duplicado_de_event_id', null)
        .is('desaparecido_at', null)
        .gte('comienza_at', inicioDeHoyLocal())
        .eq('pais', pais)
        .order('comienza_at', { ascending: true });
      if (error) throw error;
      setExternos((data ?? []).map(mapEventoExternoFromDB));
    } catch (e: any) {
      console.error('[useEventosExternos]', e);
      setExternos([]);
      setError(e?.message ?? 'No se pudieron cargar los eventos externos');
    } finally {
      setLoading(false);
    }
  }, [pais]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  return { externos, loading, error, refrescar };
}
