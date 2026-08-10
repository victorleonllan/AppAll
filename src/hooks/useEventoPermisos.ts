import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { EventRole } from '../types';

export interface EventoPermisos {
  rol: EventRole | null;
  esOwner: boolean;
  puedeEditar: boolean;
  puedeInvitar: boolean;
  puedeBorrar: boolean;
}

const SIN_PERMISOS: EventoPermisos = {
  rol: null, esOwner: false, puedeEditar: false, puedeInvitar: false, puedeBorrar: false,
};

/**
 * Spec 033 — permisos de un usuario sobre un evento, derivados de
 * `misColaboraciones` (ya cargado en EventosContext, sin round-trip extra).
 *
 * `puedeBorrar` cubre tanto borrar como cancelar: en la base es el mismo
 * campo `can_delete` (ver migración 20260810080442), y `owner` lo trae
 * implícito por el CHECK `event_collaborators_owner_can_delete`.
 */
export function useEventoPermisos(eventoId: string | undefined): EventoPermisos {
  const { user } = useAuth();
  const { misColaboraciones, eventos } = useEventos();

  return useMemo(() => {
    if (!eventoId || !user) return SIN_PERMISOS;

    const colaboracion = misColaboraciones.find((c) => c.eventId === eventoId);
    if (colaboracion) {
      const esOwner = colaboracion.role === 'owner';
      return {
        rol: colaboracion.role,
        esOwner,
        puedeEditar: true, // cualquier rol del equipo (owner/admin/editor) edita
        puedeInvitar: esOwner || colaboracion.role === 'admin',
        puedeBorrar: esOwner || colaboracion.canDelete,
      };
    }

    // Sin fila en event_collaborators: o la migración del spec 033 todavía no
    // se aplicó, o de verdad no soy del equipo. Fallback al modelo viejo
    // (created_by) para no romper la app mientras se despliega — igual que
    // EventosContext cae a mock cuando la tabla `events` no responde.
    const evento = eventos.find((e) => e.id === eventoId);
    const esCreador = Boolean(evento && evento.createdBy === user.id);
    return {
      rol: esCreador ? 'owner' : null,
      esOwner: esCreador,
      puedeEditar: esCreador,
      puedeInvitar: esCreador,
      puedeBorrar: esCreador,
    };
  }, [eventoId, user, misColaboraciones, eventos]);
}
