import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { TipoTenant } from '../lib/adminPro';
import { MiSuscripcionPro } from '../lib/pro';
import { getMiSuscripcionPro } from '../lib/proSuscripcion';

interface MiSuscripcionProState {
  suscripcion: MiSuscripcionPro | null;
  cargando: boolean;
  error: string | null;
  recargar: () => void;
}

/**
 * Spec 168 — la suscripción a Pro del tenant, para la tarjeta del dueño (spec 169).
 * `id` nulo (sin local, perfil de muestra) → sin consulta: un hook no puede ir dentro
 * de un `if`. Recarga si cambia la sesión, porque otra cuenta puede no ser la dueña.
 *
 * Un error deja `suscripcion = null` y el mensaje en `error`: la tarjeta vuelve a la
 * vista de hoy en vez de mostrar una renovación que no pudo confirmar (como
 * `cargarSuscripcionPro` de la web).
 */
export function useMiSuscripcionPro(tipo: TipoTenant, id: string | null): MiSuscripcionProState {
  const { user } = useAuth();
  const userId = user?.id;
  const [suscripcion, setSuscripcion] = useState<MiSuscripcionPro | null>(null);
  const [cargando, setCargando] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  useEffect(() => {
    if (!id) {
      setSuscripcion(null);
      setCargando(false);
      setError(null);
      return;
    }
    // Una respuesta que llega después de cambiar tenant o sesión no pisa la nueva.
    let vigente = true;
    setCargando(true);
    setError(null);
    getMiSuscripcionPro(tipo, id)
      .then((s) => {
        if (vigente) setSuscripcion(s);
      })
      .catch((e: any) => {
        if (!vigente) return;
        setSuscripcion(null);
        setError(e?.message ?? 'No se pudo leer tu suscripción');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [tipo, id, userId, vuelta]);

  return { suscripcion, cargando, error, recargar };
}
