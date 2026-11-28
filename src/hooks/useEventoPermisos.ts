import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { permisosDeEvento, type EventoPermisos } from '../lib/edicionAdmin';
import { useEsAdmin } from './useEsAdmin';

export type { EventoPermisos } from '../lib/edicionAdmin';

const SIN_PERMISOS: EventoPermisos = {
  rol: null, esOwner: false, puedeEditar: false, puedeInvitar: false, puedeBorrar: false,
  esAdmin: false, comoAdmin: false,
};

/**
 * Spec 033 — permisos de un usuario sobre un evento, derivados de
 * `misColaboraciones` (ya cargado en EventosContext, sin round-trip extra).
 * Spec 197 — la regla vive en `permisosDeEvento` y reconoce al admin de Sonópolis.
 *
 * `puedeBorrar` cubre tanto borrar como cancelar: en la base es el mismo
 * campo `can_delete` (ver migración 20260810080442), y `owner` lo trae
 * implícito por el CHECK `event_collaborators_owner_can_delete`.
 */
export function useEventoPermisos(eventoId: string | undefined): EventoPermisos {
  const { user } = useAuth();
  const { misColaboraciones, eventos } = useEventos();
  const { esAdmin, cargando } = useEsAdmin();
  // Mientras carga no se abre nada (spec 152): al cambiar de cuenta, `esAdmin` todavía
  // trae la respuesta de la anterior.
  const admin = esAdmin && !cargando;

  return useMemo(() => {
    if (!eventoId || !user) return SIN_PERMISOS;

    const colaboracion = misColaboraciones.find((c) => c.eventId === eventoId) ?? null;
    // Sin fila en event_collaborators: o la migración del spec 033 todavía no
    // se aplicó, o de verdad no soy del equipo. `created_by` es el fallback al
    // modelo viejo, para no romper la app mientras se despliega.
    const evento = eventos.find((e) => e.id === eventoId);
    return permisosDeEvento({
      colaboracion,
      esCreador: Boolean(evento && evento.createdBy === user.id),
      esAdmin: admin,
    });
  }, [eventoId, user, misColaboraciones, eventos, admin]);
}
