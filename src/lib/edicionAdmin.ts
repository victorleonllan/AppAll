import type { EventRole } from '../types';

/**
 * Spec 197 — quién edita qué. Puro (solo `import type`: se prueba con `node`). Port de
 * sonopolisWeb/libs/edicionAdmin.js (W-351) más la regla de permisos del evento.
 *
 * Es guarda de NAVEGACIÓN: la base vuelve a decidir con las policies y el guardia de
 * columnas de W-350.
 */

export interface EventoPermisos {
  rol: EventRole | null;
  esOwner: boolean;
  puedeEditar: boolean;
  puedeInvitar: boolean;
  puedeBorrar: boolean;
  esAdmin: boolean; // la sesión es admin de Sonópolis (tenga o no rol en el evento)
  comoAdmin: boolean; // edita SOLO por ser admin: no es del equipo ni lo creó
}

/**
 * `duenoId`: para un perfil, el mismo `objetivoId`; para un local, su `owner_id` (puede
 * ser null: un local sin dueño también lo edita solo el admin).
 */
export function decidirEdicion({
  userId, rol, esAdmin, rolDueno, objetivoId, duenoId,
}: {
  userId: string | null | undefined;
  rol: string | null;
  esAdmin: boolean;
  rolDueno: 'musician' | 'local';
  objetivoId?: string | null;
  duenoId?: string | null;
}): { permitido: boolean; comoAdmin: boolean } {
  if (!objetivoId || (duenoId != null && duenoId === userId)) {
    return { permitido: rol === rolDueno, comoAdmin: false };
  }
  const admin = Boolean(esAdmin);
  return { permitido: admin, comoAdmin: admin };
}

/** Gate de «Ajustar portada» y de mover el pin: el dueño o el admin. */
export function puedeEditarComoDueno({
  userId, duenoId, esAdmin,
}: {
  userId: string | null | undefined;
  duenoId: string | null | undefined;
  esAdmin: boolean;
}): boolean {
  return Boolean(userId) && (userId === duenoId || Boolean(esAdmin));
}

/**
 * Permisos sobre un evento: primero el equipo, después el creador (modelo previo al spec
 * 033) y al final el admin, que edita (`can_edit_event`, spec 078) pero no invita ni
 * borra: `events_delete` es solo del owner y el equipo es del dueño.
 */
export function permisosDeEvento({
  colaboracion, esCreador, esAdmin,
}: {
  colaboracion: { role: EventRole; canDelete: boolean } | null;
  esCreador: boolean;
  esAdmin: boolean;
}): EventoPermisos {
  if (colaboracion) {
    const esOwner = colaboracion.role === 'owner';
    return {
      rol: colaboracion.role,
      esOwner,
      puedeEditar: true, // cualquier rol del equipo (owner/admin/editor) edita
      puedeInvitar: esOwner || colaboracion.role === 'admin',
      puedeBorrar: esOwner || colaboracion.canDelete,
      esAdmin,
      comoAdmin: false,
    };
  }
  if (esCreador) {
    return {
      rol: 'owner',
      esOwner: true,
      puedeEditar: true,
      puedeInvitar: true,
      puedeBorrar: true,
      esAdmin,
      comoAdmin: false,
    };
  }
  return {
    rol: null,
    esOwner: false,
    puedeEditar: esAdmin,
    puedeInvitar: false,
    puedeBorrar: false,
    esAdmin,
    comoAdmin: esAdmin,
  };
}
