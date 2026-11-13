import { useCallback, useEffect, useState } from 'react';
import {
  BorradorEspecial,
  CambiosEspecial,
  TicketEspecial,
  actualizarEspecial,
  crearEspecial,
  listarEspeciales,
} from '../lib/especiales';

/**
 * Spec 164 — packs 2x1 a 5x1 de un evento para el modo en vivo del formulario
 * (spec 165). Equivale a `usePreventas`: lista, crea, actualiza y cierra. Sin
 * `eventoId` (evento nuevo) no consulta: esos packs viven en el formulario y se crean
 * con `crearEspecialesDeBorrador`.
 */
interface EspecialesState {
  especiales: TicketEspecial[];
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  crear: (b: BorradorEspecial) => Promise<TicketEspecial>;
  actualizar: (id: string, cambios: CambiosEspecial) => Promise<TicketEspecial>;
  cerrar: (id: string) => Promise<TicketEspecial>;
}

export function useEspeciales(eventoId: string | null | undefined): EspecialesState {
  const [especiales, setEspeciales] = useState<TicketEspecial[]>([]);
  const [cargando, setCargando] = useState(Boolean(eventoId));
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!eventoId) {
      setEspeciales([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      // Ordenada por created_at ascendente, como la web.
      setEspeciales(await listarEspeciales(eventoId));
    } catch (e: any) {
      console.error('[useEspeciales]', e);
      setError(e?.message ?? 'No se pudieron cargar los packs');
    } finally {
      setCargando(false);
    }
  }, [eventoId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Las tres escrituras actualizan el estado local con la fila que devuelve la base y
  // relanzan el error: quien edita necesita saber que no se guardó.
  const crear = useCallback(async (b: BorradorEspecial) => {
    if (!eventoId) throw new Error('El evento todavía no existe');
    const nuevo = await crearEspecial(eventoId, b);
    setEspeciales((prev) => [...prev, nuevo]);
    return nuevo;
  }, [eventoId]);

  const actualizar = useCallback(async (id: string, cambios: CambiosEspecial) => {
    const actualizado = await actualizarEspecial(id, cambios);
    setEspeciales((prev) => prev.map((e) => (e.id === id ? actualizado : e)));
    return actualizado;
  }, []);

  /** Deja de venderse aunque le quede cupo; nunca borra (ON DELETE RESTRICT). */
  const cerrar = useCallback((id: string) => actualizar(id, { activa: false }), [actualizar]);

  return { especiales, cargando, error, recargar, crear, actualizar, cerrar };
}
