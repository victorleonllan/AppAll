import { ErrorApiWeb, llamarApiWeb } from './apiWeb';
import { supabase } from './supabase';

/**
 * Spec 190 — invitar a una banda a Sonópolis (W-304). Crear la invitación y mandar el
 * correo van en una sola llamada a la ruta de la web, que es quien tiene la llave de
 * Resend. Quién puede invitar lo decide Postgres; sus errores ya vienen en español.
 */

export type EstadoInvitacionSonopolis = 'pending' | 'accepted' | 'revoked';

export interface InvitacionSonopolis {
  id: string;
  correo: string;
  nombre: string;
  artistId: string | null; // la ficha invitada (sin ficha: invitación desde el panel)
  eventId: string | null;
  token: string;
  estado: EstadoInvitacionSonopolis;
  creadaAt: string;
  enviadaAt: string | null;
  aceptadaAt: string | null;
}

export interface ResultadoInvitacion {
  ok: true;
  token: string;
  emailError?: string;
}

/** Crea o reenvía (mismo correo = mismo token). Si Resend falla, `emailError` y la
 * invitación vale igual. */
export function enviarInvitacionSonopolis(datos: {
  email: string;
  nombre?: string | null;
  artistId?: string | null;
  eventId?: string | null;
}): Promise<ResultadoInvitacion> {
  return llamarApiWeb<ResultadoInvitacion>('/api/invitaciones-sonopolis', {
    metodo: 'POST',
    cuerpo: {
      email: datos.email.trim(),
      nombre: datos.nombre || null,
      artistId: datos.artistId || null,
      eventId: datos.eventId || null,
    },
  });
}

/** Revoca la invitación. */
export async function cancelarInvitacionSonopolis(token: string): Promise<void> {
  await llamarApiWeb('/api/invitaciones-sonopolis', { metodo: 'DELETE', cuerpo: { token } });
}

function mapInvitacion(r: any): InvitacionSonopolis {
  return {
    id: r.id,
    correo: r.email,
    nombre: r.nombre,
    artistId: r.artist_id ?? null,
    eventId: r.event_id ?? null,
    token: r.token,
    estado: r.status as EstadoInvitacionSonopolis,
    creadaAt: r.created_at,
    enviadaAt: r.sent_at ?? null,
    aceptadaAt: r.accepted_at ?? null,
  };
}

/** Las invitaciones que hizo la sesión (RLS `sonopolis_invites_select_own`: solo las
 * propias), sin las revocadas, recientes primero. */
export async function getMisInvitacionesSonopolis(opciones?: {
  eventId?: string | null;
  limite?: number;
}): Promise<InvitacionSonopolis[]> {
  let consulta = supabase
    .from('sonopolis_invites')
    .select('*')
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })
    .limit(opciones?.limite ?? 50);
  if (opciones?.eventId) consulta = consulta.eq('event_id', opciones.eventId);
  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []).map(mapInvitacion);
}

/** Texto para mostrar bajo el campo cuando una llamada de invitación falla. */
export function mensajeErrorInvitacion(err: unknown): string {
  const status = err instanceof ErrorApiWeb ? err.status : null;
  if (status === 401 || (err instanceof ErrorApiWeb && err.codigo === 'no_autenticado')) {
    return 'Inicia sesión para invitar.';
  }
  if ((status !== null && status >= 500) || err instanceof TypeError) {
    return 'No se pudo conectar con Sonópolis. Intenta de nuevo.';
  }
  const mensaje = (err as { message?: unknown } | null | undefined)?.message;
  // `HTTP <status>` es el relleno de `llamarApiWeb` cuando la ruta no trae mensaje.
  if (typeof mensaje !== 'string' || !mensaje || /^HTTP \d+$/.test(mensaje)) {
    return 'No se pudo completar';
  }
  return mensaje;
}

export const ESTADO_INVITACION: Record<EstadoInvitacionSonopolis, string> = {
  pending: 'Pendiente',
  accepted: 'Ya entró',
  revoked: 'Cancelada',
};
