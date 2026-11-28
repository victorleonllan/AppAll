import { llamarApiWeb } from './apiWeb';
import { supabase } from './supabase';

/**
 * Spec 135 — invitación al dueño real de un local (W-230). Port de la parte pública
 * de sonopolisWeb/libs/data/invitacionesLocal.js. Quién puede reclamar y con qué
 * correo lo decide Postgres; los errores de la base ya vienen en español y se tiran
 * tal cual.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mismo regex que `invitacion/[token]/page.js`: un token que no es UUID ni se
 * consulta (el RPC tiraría un error de tipo en vez de «no existe»). */
export function esTokenInvitacion(token: string | null | undefined): boolean {
  return UUID.test(token ?? '');
}

export type EstadoInvitacionLocal = 'pending' | 'accepted' | 'revoked';

export interface InvitacionLocalPublica {
  nombreLocal: string;
  tipo: string;
  direccion: string | null;
  comuna: string | null;
  imagen: string | null;
  pais: string;
  correo: string;
  estado: EstadoInvitacionLocal;
}

/** `null` si el token no existe. Funciona sin sesión (`grant` a `anon`). */
export async function getInvitacionLocalPublica(token: string): Promise<InvitacionLocalPublica | null> {
  const { data, error } = await supabase
    .rpc('invitacion_local_publica', { p_token: token })
    .maybeSingle();
  if (error) throw error;
  const r: any = data;
  if (!r) return null;
  return {
    nombreLocal: r.venue_name,
    tipo: r.venue_type,
    direccion: r.address ?? null,
    comuna: r.comuna ?? null,
    imagen: r.image ?? null,
    pais: r.pais,
    correo: r.email,
    estado: r.status as EstadoInvitacionLocal,
  };
}

/**
 * Para quien ya tiene la sesión abierta con el correo invitado. Si funcionó, refresca
 * la sesión: la función cambia `user_metadata.role` a `local` en la base
 * (`_aplicar_invitacion_local`), pero el JWT de la app trae el rol viejo hasta
 * refrescarlo, y `AuthContext` decide las pestañas con ese rol.
 */
export async function reclamarInvitacionLocal(token: string): Promise<void> {
  const { error } = await supabase.rpc('reclamar_invitacion_local', { p_token: token });
  if (error) throw new Error(error.message);
  const { error: errorRefresh } = await supabase.auth.refreshSession();
  if (errorRefresh) throw new Error(errorRefresh.message);
}

/** `scope: 'local'` cierra esta sesión y no las de la persona en otros dispositivos
 * (para entrar con el correo invitado sin sacarla de su cuenta en todas partes). */
export async function cerrarSesionSoloAqui(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw new Error(error.message);
}

/** Spec 190 (W-337) — el músico invita al dueño real del local que registró al crear su evento.
 * El permiso lo decide `invitar_dueno_local` en Postgres; el error llega en español (se muestra
 * con `mensajeErrorInvitacion`). Si Resend falla, `emailError` y la invitación vale igual. */
export function invitarDuenoLocalDelEvento(datos: {
  venueId: string;
  email: string;
}): Promise<{ ok: true; token: string; emailError?: string }> {
  return llamarApiWeb('/api/invitaciones-local', {
    metodo: 'POST',
    cuerpo: { venueId: datos.venueId, email: datos.email.trim() },
  });
}
