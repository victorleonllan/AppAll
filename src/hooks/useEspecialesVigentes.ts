import { useCallback, useEffect, useState } from 'react';
import { EspecialVigente, getEspecialesVigentes } from '../lib/especiales';

/**
 * Spec 164 — packs que el fan puede comprar ahora (`especiales_vigentes_de`, W-253).
 *
 * `null` mientras carga, y no `[]`: la auto-compra tras el enlace mágico (spec 166)
 * tiene que esperar a saber si el pack pedido sigue a la venta. `[]` sin packs, si
 * falló (`getEspecialesVigentes` nunca lanza) o con `eventoId` null (no consulta).
 * `recargar` sube un contador que vuelve a correr el efecto.
 */
export function useEspecialesVigentes(eventoId: string | null): {
  especiales: EspecialVigente[] | null;
  recargar: () => void;
} {
  const [especiales, setEspeciales] = useState<EspecialVigente[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!eventoId) {
      setEspeciales([]);
      return;
    }
    // Patrón de cancelación de usePrecioVigente: una respuesta vieja no pisa la nueva.
    let cancelado = false;
    setEspeciales(null);
    (async () => {
      const lista = await getEspecialesVigentes(eventoId);
      if (!cancelado) setEspeciales(lista);
    })();
    return () => {
      cancelado = true;
    };
  }, [eventoId, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return { especiales, recargar };
}
