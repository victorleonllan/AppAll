import { supabase } from './supabase';

export type RolElegible = 'fan' | 'musician' | 'local';

// Spec 128 — `set_my_role` (spec 046) escribe profiles.role y
// raw_user_meta_data.role, pero el JWT del cliente sigue sin rol hasta el
// próximo refresh. Por eso se refresca acá: el TOKEN_REFRESHED lo recoge
// AuthContext y `role` cambia solo. Devuelve el mensaje de error, o null.
export async function elegirMiRol(rol: RolElegible): Promise<string | null> {
  const { error } = await supabase.rpc('set_my_role', { p_role: rol });
  if (error) {
    if (error.message?.includes('no_autenticado')) return 'Tu sesión se cerró. Entra de nuevo.';
    return error.message;
  }

  const { error: errorRefresh } = await supabase.auth.refreshSession();
  if (errorRefresh) {
    return 'Tu rol quedó guardado, pero no pudimos actualizar la sesión. Cierra sesión y vuelve a entrar.';
  }

  return null;
}
