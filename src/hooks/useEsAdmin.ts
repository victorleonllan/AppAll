import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { esAdmin as consultarEsAdmin } from '../lib/admin';

interface EsAdminState {
  esAdmin: boolean;
  cargando: boolean;
  error: string | null;
}

/**
 * Spec 152 — si la sesión es admin de Sonópolis, para mostrar la entrada al back
 * office. Se vuelve a preguntar cuando cambia `user.id`: cerrar sesión y entrar con
 * otra cuenta no hereda la respuesta anterior. Ante un error, `esAdmin = false`:
 * con la duda no se muestra la entrada.
 */
export function useEsAdmin(): EsAdminState {
  const { user } = useAuth();
  const userId = user?.id;
  const [esAdmin, setEsAdmin] = useState(false);
  const [cargando, setCargando] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setEsAdmin(false);
      setCargando(false);
      setError(null);
      return;
    }
    // Una respuesta que llega después de cambiar de cuenta no pisa la nueva.
    let vigente = true;
    setCargando(true);
    setError(null);
    consultarEsAdmin()
      .then((r) => {
        if (vigente) setEsAdmin(r);
      })
      .catch((e: any) => {
        if (!vigente) return;
        setEsAdmin(false);
        setError(e?.message ?? 'No se pudo saber si la cuenta es admin');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [userId]);

  return { esAdmin, cargando, error };
}
