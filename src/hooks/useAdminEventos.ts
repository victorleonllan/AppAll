import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mapEventoFromDB } from '../context/EventosContext';
import { getMontoATransferir } from '../lib/admin';
import { Evento } from '../types';

/** `montoATransferir` y no `monto`: `Evento.monto` ya es el precio de la entrada. */
export type EventoAdmin = Evento & { cerradoAt: string | null; montoATransferir?: number };

interface AdminEventosState {
  cargando: boolean;
  error: string | null;
  proximos: EventoAdmin[];
  porCerrar: EventoAdmin[];
  cerrados: EventoAdmin[];
  hayPasados: boolean;
  recargar: () => Promise<void>;
}

/**
 * Spec 152 — lo mismo que `/admin/eventos` de la web. Consulta propia y no
 * `useEventos()`: el contexto no mapea `closed_at`, y sumarlo ahí es tocar un
 * archivo de todos. Con la sesión del admin la RLS devuelve también los borradores
 * ajenos (spec 078); acá no se filtran.
 *
 * Un error deja el mensaje en `error` y conserva las listas de la carga anterior,
 * como `EventosContext` (spec 115).
 */
export function useAdminEventos(): AdminEventosState {
  const [proximos, setProximos] = useState<EventoAdmin[]>([]);
  const [porCerrar, setPorCerrar] = useState<EventoAdmin[]>([]);
  const [cerrados, setCerrados] = useState<EventoAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('events')
        .select('*')
        .order('comienza_at', { ascending: true, nullsFirst: false });
      if (err) throw err;
      const eventos: EventoAdmin[] = ((data ?? []) as any[]).map((db) => ({
        ...mapEventoFromDB(db),
        cerradoAt: db.closed_at ?? null,
      }));

      // Sin `comienzaAt` cuenta como próximo: entre los pasados nadie lo buscaría.
      const ahora = Date.now();
      const esProximo = (e: EventoAdmin) => !e.comienzaAt || new Date(e.comienzaAt).getTime() >= ahora;
      const pasados = eventos.filter((e) => !esProximo(e)).reverse();

      // W-172/W-175: el monto decide qué dice el botón («Pagado y cerrado» o
      // «Cerrar evento»). Solo para los por cerrar, cancelados incluidos.
      const sinCerrar = await Promise.all(
        pasados
          .filter((e) => !e.cerradoAt)
          .map(async (e) => ({ ...e, montoATransferir: await getMontoATransferir(e.id) }))
      );

      setProximos(eventos.filter(esProximo));
      setPorCerrar(sinCerrar);
      setCerrados(pasados.filter((e) => e.cerradoAt));
    } catch (e: any) {
      setError(e?.message ?? 'No se pudieron cargar los eventos');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Para el texto del vacío: «Todavía no pasó ningún evento.» contra «Todos los
  // eventos pasados están cerrados.».
  const hayPasados = porCerrar.length + cerrados.length > 0;

  return { cargando, error, proximos, porCerrar, cerrados, hayPasados, recargar };
}
