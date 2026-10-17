import { supabase } from './supabase';

// Spec 128 — copia en TypeScript de sonopolisWeb/libs/contrasena.js (W-227/W-228),
// mismos textos.
//
// La regla es copia de la de Supabase (Auth → Policies) al 6-oct-2026:
// password_min_length = 6 y password_required_characters = minúscula, mayúscula,
// número y símbolo. La app no puede leerla de Supabase: SI SE CAMBIA EN EL PANEL,
// HAY QUE CAMBIARLA AQUÍ Y EN LA WEB. Solo cuentan letras sin acento (Supabase no
// acepta ñ ni á como minúscula).
export const REGLA_CONTRASENA: { texto: string; falta: string; cumple: (p: string) => boolean }[] = [
  { texto: 'Al menos 6 caracteres', falta: '6 caracteres', cumple: (p) => p.length >= 6 },
  { texto: 'Una minúscula', falta: 'una minúscula', cumple: (p) => /[a-z]/.test(p) },
  { texto: 'Una mayúscula', falta: 'una mayúscula', cumple: (p) => /[A-Z]/.test(p) },
  { texto: 'Un número', falta: 'un número', cumple: (p) => /[0-9]/.test(p) },
  {
    texto: 'Un símbolo (por ejemplo ! ? # . -)',
    falta: 'un símbolo',
    cumple: (p) => /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/.test(p),
  },
];

export const faltaEnContrasena = (p: string = ''): string[] =>
  REGLA_CONTRASENA.filter((r) => !r.cumple(p)).map((r) => r.falta);

export const MENSAJE_CUENTA_EXISTENTE =
  'Ya hay una cuenta con este correo. Si la creaste al comprar una entrada, no tiene contraseña: entra con un enlace por correo. Si tiene contraseña, entra con ella o con Google.';

/**
 * Los errores de Supabase Auth en español, por `error.code`. Lo que no tiene
 * traducción viaja tal cual: descartar el detalle de un fallo ya costó caro.
 */
export function mensajeDeErrorAuth(
  error: { code?: string; message?: string } | null,
  password: string = ''
): string {
  switch (error?.code) {
    case 'weak_password': {
      const falta = faltaEnContrasena(password);
      return falta.length
        ? `A la contraseña le falta: ${falta.join(', ')}`
        : 'La contraseña es demasiado débil';
    }
    case 'invalid_credentials':
      return 'Correo o contraseña incorrectos';
    case 'email_not_confirmed':
      return 'Todavía no confirmas tu correo: abre el enlace que te mandamos';
    case 'user_already_exists':
      return MENSAJE_CUENTA_EXISTENTE;
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar';
    case 'email_address_invalid':
      return 'Ese correo no es válido';
    case 'same_password':
      return 'Esa ya es tu contraseña. Elige una distinta';
    // Distinto de la web: la app no tiene la página de vuelta del enlace.
    case 'reauthentication_needed':
      return 'Por seguridad, cierra sesión y vuelve a entrar antes de cambiarla.';
    default:
      return error?.message ?? 'Algo falló. Intenta de nuevo';
  }
}

export async function cambiarContrasena(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  return { error };
}
