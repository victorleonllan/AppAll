import { useCallback, useEffect, useState } from 'react';
import { getCobrosPro, TipoTenant } from '../lib/adminPro';
import { SuscripcionConCobros } from '../lib/cobrosPro';

interface CobrosProState {
  suscripciones: SuscripcionConCobros[];
  cargando: boolean;
  error: string | null;
  recargar: () => void;
}

/**
 * Spec 168 — admin. Los cobros de Pro del tenant, leídos en vivo de Mercado Pago
 * (`cobros-pro`, spec 163), para la ficha del spec 170. Sin caché: cada apertura
 * pregunta a Mercado Pago, como la web.
 *
 * Un error deja el mensaje en `error` y conserva la lista anterior (spec 115).
 */
export function useCobrosPro(tipo: TipoTenant, id: string): CobrosProState {
  const [suscripciones, setSuscripciones] = useState<SuscripcionConCobros[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  useEffect(() => {
    // Una respuesta que llega después de cambiar de tenant no pisa la nueva.
    let vigente = true;
    setCargando(true);
    setError(null);
    getCobrosPro(tipo, id)
      .then((lista) => {
        if (vigente) setSuscripciones(lista);
      })
      .catch((e: any) => {
        if (vigente) setError(e?.message ?? 'No se pudieron leer los cobros de Pro');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [tipo, id, vuelta]);

  return { suscripciones, cargando, error, recargar };
}
