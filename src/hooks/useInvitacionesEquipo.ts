import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { llamarApiWeb } from '../lib/apiWeb';

/** Mismo criterio que `PanelEquipo.js` de la web: no valida en serio (eso lo hace el
 * CHECK de la base, spec 052), solo decide cuándo ofrecer «invitar por correo». */
export const PARECE_CORREO = /\S+@\S+\.\S+/;

export type RolInvitacion = 'admin' | 'editor';

export interface InvitacionPendiente {
  id: string;
  email: string;
  role: RolInvitacion;
  createdAt: string;
}

interface InvitacionesEquipoState {
  pendientes: InvitacionPendiente[];
  emailsEquipo: Record<string, string | null>;
  errorEmails: string | null;
  cargando: boolean;
  recargar: () => Promise<void>;
  invitarPorCorreo: (email: string, rol: RolInvitacion) => Promise<{ emailError: string | null }>;
  revocar: (id: string) => Promise<void>;
}

/**
 * Spec 135 — invitaciones por correo al equipo de un evento (spec 052). Crear la
 * invitación y mandar el correo va por la ruta de la web, que tiene la llave de
 * Resend; leer y revocar las pendientes va directo contra la tabla, con su RLS.
 */
export function useInvitacionesEquipo(
  eventoId: string | null | undefined,
  { esOwner, puedeInvitar }: { esOwner: boolean; puedeInvitar: boolean }
): InvitacionesEquipoState {
  const [pendientes, setPendientes] = useState<InvitacionPendiente[]>([]);
  const [emailsEquipo, setEmailsEquipo] = useState<Record<string, string | null>>({});
  const [errorEmails, setErrorEmails] = useState<string | null>(null);
  const [cargando, setCargando] = useState(Boolean(eventoId));

  const cargarPendientes = useCallback(async () => {
    if (!eventoId || !puedeInvitar) {
      setPendientes([]);
      return;
    }
    // RLS `eci_select`: solo quien puede invitar ve las invitaciones del evento.
    const { data, error } = await supabase
      .from('event_collaborator_invites')
      .select('id, email, role, created_at')
      .eq('event_id', eventoId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    setPendientes(
      (data ?? []).map((r: any) => ({ id: r.id, email: r.email, role: r.role, createdAt: r.created_at }))
    );
  }, [eventoId, puedeInvitar]);

  // Los correos salen de `auth.users`, que solo lee la web con service role. Si la
  // ruta falla el equipo se muestra igual, sin correos: no es motivo para esconderlo.
  const cargarEmails = useCallback(async () => {
    if (!eventoId || !esOwner) {
      setEmailsEquipo({});
      setErrorEmails(null);
      return;
    }
    try {
      const r = await llamarApiWeb<{ emails: Record<string, string | null> }>(
        `/api/eventos/${eventoId}/equipo-emails`
      );
      setEmailsEquipo(r.emails ?? {});
      setErrorEmails(null);
    } catch (e: any) {
      console.error('[useInvitacionesEquipo] equipo-emails:', e?.message);
      setEmailsEquipo({});
      setErrorEmails(e?.message ?? 'No se pudieron cargar los correos del equipo');
    }
  }, [eventoId, esOwner]);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      await Promise.all([cargarPendientes(), cargarEmails()]);
    } catch (e) {
      console.error('[useInvitacionesEquipo] invitaciones pendientes:', e);
      throw e;
    } finally {
      setCargando(false);
    }
  }, [cargarPendientes, cargarEmails]);

  useEffect(() => {
    // El error de la carga inicial ya quedó en consola; quien quiera mostrarlo
    // llama a `recargar()` y lo recibe.
    recargar().catch(() => undefined);
  }, [recargar]);

  /** La ruta responde `200 { ok, emailError }` cuando la invitación quedó creada
   * pero Resend falló: no es un error, es un aviso de que el correo no salió. */
  const invitarPorCorreo = useCallback(async (email: string, rol: RolInvitacion) => {
    if (!eventoId) throw new Error('Falta el evento');
    const r = await llamarApiWeb<{ ok: boolean; emailError?: string | null }>(
      `/api/eventos/${eventoId}/invitar-email`,
      { metodo: 'POST', cuerpo: { email: email.trim().toLowerCase(), role: rol } }
    );
    await cargarPendientes();
    return { emailError: r.emailError ?? null };
  }, [eventoId, cargarPendientes]);

  // RLS `eci_update_revoke`. No se borra: queda el registro de que existió.
  const revocar = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('event_collaborator_invites')
      .update({ status: 'revoked' })
      .eq('id', id);
    if (error) throw error;
    setPendientes((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { pendientes, emailsEquipo, errorEmails, cargando, recargar, invitarPorCorreo, revocar };
}
