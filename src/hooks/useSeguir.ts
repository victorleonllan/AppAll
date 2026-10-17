import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { dejarDeSeguir, seguir, sigoA } from '../lib/follows';
import { TipoSeguible } from '../types';

interface SeguirState {
  siguiendo: boolean;
  cargando: boolean;
  error: string | null;
  haySesion: boolean;
  alternar: () => Promise<boolean>;
}

/**
 * Spec 123 — estado de un botón «Seguir». Hermano de BotonSeguir.js de la web.
 *
 * No optimista: `siguiendo` cambia solo después de que la base responde. Si
 * la RLS rechaza (p. ej. seguir como músico a quien no tiene role =
 * 'musician'), el botón no miente. Sin sesión no consulta y `alternar()`
 * devuelve false: la pantalla decide qué ofrecer.
 */
export function useSeguir(tipo: TipoSeguible, targetId: string): SeguirState {
  const { user } = useAuth();
  const userId = user?.id;
  const [siguiendo, setSiguiendo] = useState(false);
  const [cargando, setCargando] = useState(userId !== undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setSiguiendo(false);
      setError(null);
      setCargando(false);
      return;
    }
    let vigente = true;
    setCargando(true);
    setError(null);
    sigoA(tipo, userId, targetId)
      .then((sigo) => {
        if (vigente) setSiguiendo(sigo);
      })
      .catch((err) => {
        if (!vigente) return;
        console.error('[useSeguir]', err);
        setError(err?.message ?? 'No se pudo saber si lo sigues');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    // Si cambia el objetivo antes de que llegue la respuesta, la vieja se descarta.
    return () => {
      vigente = false;
    };
  }, [tipo, targetId, userId]);

  const alternar = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    setCargando(true);
    setError(null);
    try {
      if (siguiendo) {
        await dejarDeSeguir(tipo, userId, targetId);
        setSiguiendo(false);
      } else {
        await seguir(tipo, userId, targetId);
        setSiguiendo(true);
      }
      return true;
    } catch (err: any) {
      console.error('[useSeguir]', err);
      setError(err?.message ?? 'No se pudo actualizar');
      return false;
    } finally {
      setCargando(false);
    }
  }, [tipo, targetId, userId, siguiendo]);

  return { siguiendo, cargando, error, haySesion: !!userId, alternar };
}
