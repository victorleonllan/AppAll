// Spec 194 — copia en TypeScript de las dos reglas de W-323 (sonopolisWeb/libs/contrasena.js). Sin imports, para probarlo con node.

/** A qué campo del formulario de cuenta pertenece un error. `null` = error de la cuenta, no de un campo. */
export type CampoAuth = 'email' | 'password' | null;

/** `true` si el correo tiene forma válida; si no, el mensaje para mostrar bajo el campo. */
export function validarCorreo(v: string | null | undefined): true | string {
  const correo = (v ?? '').trim();
  if (!correo) return 'Falta el correo';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)
    ? true
    : 'Ingresa un correo válido, por ejemplo nombre@gmail.com';
}

/** El campo al que va un error de Supabase Auth, por `error.code`. */
export function campoDeErrorAuth(error: { code?: string } | null | undefined): CampoAuth {
  switch (error?.code) {
    case 'email_address_invalid':
      return 'email';
    case 'weak_password':
    case 'invalid_credentials':
    case 'same_password':
      return 'password';
    default:
      return null;
  }
}
