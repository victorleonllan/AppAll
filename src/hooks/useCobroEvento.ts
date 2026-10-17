import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getPayout, mapPayoutFromDB, Payout } from '../lib/datosPago';

interface CobroEventoState {
  cargando: boolean;
  error: string | null;
  payout: Payout | null;
  monto: number;
  moneda: string | null;
  showTermino: boolean;
  cancelado: boolean;
  recargar: () => Promise<void>;
  reclamar: () => Promise<Payout>;
}

/**
 * Spec 135 — lo que el owner ve para cobrar su evento: la cuenta cargada, cuánto se
 * le va a transferir y si ya puede pedirlo.
 *
 * Con `habilitado = false` no consulta nada: `monto_a_transferir` es SECURITY
 * DEFINER sin guarda de dueño (spec 074), así que la pantalla lo habilita solo para
 * el owner.
 */
export function useCobroEvento(eventoId: string | null | undefined, habilitado: boolean): CobroEventoState {
  const [payout, setPayout] = useState<Payout | null>(null);
  const [monto, setMonto] = useState(0);
  const [moneda, setMoneda] = useState<string | null>(null);
  const [showTermino, setShowTermino] = useState(false);
  const [cancelado, setCancelado] = useState(false);
  const [cargando, setCargando] = useState(Boolean(eventoId && habilitado));
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!eventoId || !habilitado) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const [p, montoRes, eventoRes] = await Promise.all([
        getPayout(eventoId),
        supabase.rpc('monto_a_transferir', { p_event: eventoId }),
        supabase.from('events').select('moneda, comienza_at, status').eq('id', eventoId).single(),
      ]);
      if (montoRes.error) throw montoRes.error;
      if (eventoRes.error) throw eventoRes.error;
      const ev: any = eventoRes.data;
      setPayout(p);
      setMonto(Number(montoRes.data ?? 0));
      setMoneda(ev.moneda ?? null);
      setShowTermino(ev.comienza_at != null && new Date(ev.comienza_at).getTime() < Date.now());
      setCancelado(ev.status === 'cancelled');
    } catch (e: any) {
      console.error('[useCobroEvento]', e);
      setError(e?.message ?? 'No se pudo cargar el cobro del evento');
    } finally {
      setCargando(false);
    }
  }, [eventoId, habilitado]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /** Las guardas (owner, show terminado, datos bancarios) viven en el RPC (spec 075)
   * y no se repiten acá: su mensaje sube tal cual. */
  const reclamar = useCallback(async () => {
    if (!eventoId) throw new Error('Falta el evento');
    const { data, error } = await supabase.rpc('reclamar_pago_evento', { p_event: eventoId });
    if (error) throw error;
    const actualizado = mapPayoutFromDB(data);
    setPayout(actualizado);
    return actualizado;
  }, [eventoId]);

  return { cargando, error, payout, monto, moneda, showTermino, cancelado, recargar, reclamar };
}
