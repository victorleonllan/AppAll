import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PrecioVigente } from '../types';

/**
 * Spec 119 — precio que se cobra hoy (preventa abierta o precio base), del RPC
 * `precio_vigente_de` (spec 100). Con `eventoId === null` no consulta: quien llama
 * decide cuándo vale la pena el viaje a Postgres.
 *
 * Si falla, `vigente: null` y el componente cae al precio base: una preventa que
 * no se pudo cotizar no rompe la tarjeta (mismo criterio que `page.js` de la web).
 */
export function usePrecioVigente(eventoId: string | null) {
  const [vigente, setVigente] = useState<PrecioVigente | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventoId) {
      setVigente(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelado = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error } = await supabase
          .rpc('precio_vigente_de', { p_evento_id: eventoId })
          .single();
        if (error) throw error;
        const db: any = data;
        if (!cancelado) {
          setVigente({
            precio: db.precio,
            monto: db.monto,
            preventaId: db.preventa_id ?? null,
            preventaNombre: db.preventa_nombre ?? null,
            restantes: db.restantes ?? null,
            cierraAt: db.cierra_at ?? null,
            moneda: db.moneda ?? null,
            seVende: db.se_vende,
          });
        }
      } catch (e: any) {
        console.error('[usePrecioVigente]', e);
        if (!cancelado) {
          setVigente(null);
          setError(e?.message ?? 'No se pudo cotizar el precio');
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [eventoId]);

  return { vigente, loading, error };
}
