import { useCallback, useEffect, useMemo, useState } from 'react';
import { ORDEN_REDES, Red } from '../lib/redes/catalogo';
import {
  ConexionRed,
  desconectarRed,
  getConexionesRedes,
  mensajeRedes,
  TenantType,
} from '../lib/redes/api';

interface ConexionesRedesState {
  cargando: boolean;
  error: string | null;
  disponibles: Red[];
  conexiones: ConexionRed[];
  /** Conectadas, activas y disponibles, en `ORDEN_REDES`: lo que el redactor ofrece. */
  activas: ConexionRed[];
  recargar: () => Promise<void>;
  desconectar: (red: Red) => Promise<void>;
}

/**
 * Spec 150 — las cuentas de redes conectadas del tenant. Nombre distinto de
 * `useConexiones`, que son las conexiones entre músicos (spec 131).
 *
 * Con `habilitado = false` (la pantalla no lo habilita sin Pro) o sin `tenantType` no
 * llama a nada.
 */
export function useConexionesRedes(
  tenantType: TenantType | null,
  habilitado: boolean
): ConexionesRedesState {
  const activo = habilitado && tenantType != null;
  const [cargando, setCargando] = useState(activo);
  const [error, setError] = useState<string | null>(null);
  const [disponibles, setDisponibles] = useState<Red[]>([]);
  const [conexiones, setConexiones] = useState<ConexionRed[]>([]);

  const recargar = useCallback(async () => {
    if (!activo || !tenantType) {
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const r = await getConexionesRedes(tenantType);
      setDisponibles(r.disponibles);
      setConexiones(r.conexiones);
      setError(null);
    } catch (e) {
      setError(mensajeRedes(e));
    } finally {
      setCargando(false);
    }
  }, [activo, tenantType]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /** El error se tira para que la pantalla lo muestre. */
  const desconectar = useCallback(
    async (red: Red) => {
      if (!tenantType) return;
      await desconectarRed(tenantType, red);
      await recargar();
    },
    [tenantType, recargar]
  );

  const activas = useMemo(
    () =>
      ORDEN_REDES.filter((red) => disponibles.includes(red))
        .map((red) => conexiones.find((c) => c.red === red && c.estado === 'activa'))
        .filter((c): c is ConexionRed => Boolean(c)),
    [disponibles, conexiones]
  );

  return { cargando, error, disponibles, conexiones, activas, recargar, desconectar };
}
