import { useCallback, useEffect, useRef, useState } from 'react';
import type { Red } from '../lib/redes/catalogo';
import {
  cancelarPublicacionRed,
  esSinPro,
  getPublicacionesRedes,
  mensajeRedes,
  PublicacionRed,
  reintentarDestinoRed,
  TenantType,
} from '../lib/redes/api';

const CADA_MS = 10_000;

interface PublicacionesRedesState {
  publicaciones: PublicacionRed[] | null;
  error: string | null;
  /** La ruta respondió 402: el Pro venció con la pantalla abierta. */
  sinPro: boolean;
  ocupado: boolean;
  recargar: () => Promise<void>;
  cancelar: (id: string) => Promise<void>;
  reintentar: (id: string, red: Red) => Promise<void>;
}

/** Algo que el cron está por tomar o publicando: vale volver a leer. */
function enCurso(p: PublicacionRed): boolean {
  if (p.estado === 'publicando') return true;
  return (
    p.estado === 'programada' &&
    Boolean(p.programadaPara) &&
    new Date(p.programadaPara!).getTime() <= Date.now()
  );
}

/**
 * Spec 150 — el historial de publicaciones en redes del tenant. Es donde el tenant se
 * entera de que algo falló a la hora programada, así que se recarga solo cada 10 s
 * mientras haya algo en curso (como `ListaPublicaciones.js` de la web). Con
 * `enFoco = false` no programa el siguiente intento; al volver a `true`, recarga una vez.
 *
 * `publicar` no está acá: el redactor (spec 157) llama a `crearPublicacionRed` y no
 * necesita el historial cargado.
 */
export function usePublicacionesRedes(
  tenantType: TenantType | null,
  habilitado: boolean,
  enFoco: boolean
): PublicacionesRedesState {
  const activo = habilitado && tenantType != null;
  const [publicaciones, setPublicaciones] = useState<PublicacionRed[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinPro, setSinPro] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const recargar = useCallback(async () => {
    if (!activo || !tenantType) return;
    try {
      const lista = await getPublicacionesRedes(tenantType);
      setPublicaciones(lista);
      setError(null);
      setSinPro(false);
    } catch (e) {
      if (esSinPro(e)) setSinPro(true);
      else setError(mensajeRedes(e));
    }
  }, [activo, tenantType]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Al volver a la pantalla, una recarga: lo que pasó mientras no se miraba.
  const enFocoAntes = useRef(enFoco);
  useEffect(() => {
    if (enFoco && !enFocoAntes.current) recargar();
    enFocoAntes.current = enFoco;
  }, [enFoco, recargar]);

  useEffect(() => {
    if (!enFoco || !publicaciones?.some(enCurso)) return;
    const t = setTimeout(recargar, CADA_MS);
    return () => clearTimeout(t);
  }, [publicaciones, enFoco, recargar]);

  // Reemplaza en la lista la publicación que devolvió la API. El error se tira para
  // que la pantalla lo muestre; un 402 además pasa a `sinPro`.
  const accion = useCallback(async (llamada: () => Promise<PublicacionRed>) => {
    setOcupado(true);
    try {
      const actualizada = await llamada();
      setPublicaciones((lista) =>
        lista ? lista.map((p) => (p.id === actualizada.id ? actualizada : p)) : lista
      );
    } catch (e) {
      if (esSinPro(e)) setSinPro(true);
      throw e;
    } finally {
      setOcupado(false);
    }
  }, []);

  const cancelar = useCallback(
    async (id: string) => {
      if (!tenantType) return;
      await accion(() => cancelarPublicacionRed(tenantType, id));
    },
    [tenantType, accion]
  );

  const reintentar = useCallback(
    async (id: string, red: Red) => {
      if (!tenantType) return;
      await accion(() => reintentarDestinoRed(tenantType, id, red));
    },
    [tenantType, accion]
  );

  return { publicaciones, error, sinPro, ocupado, recargar, cancelar, reintentar };
}
