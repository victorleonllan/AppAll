import { supabase } from './supabase';

/**
 * Spec 152 — el admin de Sonópolis en la app. Port de sonopolisWeb/libs/admin.js
 * y de las llamadas de admin de libs/data/pagos.js. Todo corre con la sesión del
 * admin, sin service role: las policies y los RPC ya lo reconocen.
 */

/**
 * Guarda de NAVEGACIÓN, no de seguridad: la de seguridad es `es_admin_sonopolis()`
 * (spec 077) dentro de las policies y los RPC. `platform_admins_select_self`
 * (spec 074) deja ver a cada sesión solo su propia fila, así que un `maybeSingle()`
 * alcanza y no filtra quiénes son los demás admins.
 */
export async function esAdmin(): Promise<boolean> {
  const { data, error } = await supabase
    .from('platform_admins')
    .select('user_id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** La fórmula la calcula Postgres a propósito: es el mismo número que congela el
 * cierre (`cerrar_evento`). */
export async function getMontoATransferir(eventoId: string): Promise<number> {
  const { data, error } = await supabase.rpc('monto_a_transferir', { p_event: eventoId });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Specs 102/103 — las guardas (admin, ya pasó, datos bancarios si hay plata) viven
 * en el RPC y su mensaje ya viene en español. No devuelve el evento: quien llama
 * recarga su lista. */
export async function cerrarEvento(eventoId: string): Promise<void> {
  const { error } = await supabase.rpc('cerrar_evento', { p_event: eventoId });
  if (error) throw error;
}
