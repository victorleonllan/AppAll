import { supabase } from './supabase';
import { URL_WEB } from '../constants/web';

/**
 * Spec 135 — lo que necesita una llave de servidor (mandar correos con Resend, leer
 * correos de `auth.users`) vive en rutas de la web. La app las llama con el
 * `access_token` de su sesión (`Authorization: Bearer`, W-246).
 *
 * El dominio va sin `www`: `https://www.sonopolis.org` responde 307 hacia la raíz, y
 * una petición con preflight de CORS no sigue redirecciones, así que en el build web
 * de Expo la llamada se rompería.
 */
const BASE_WEB = process.env.EXPO_PUBLIC_WEB_URL || URL_WEB;

/** `codigo` es el `error` que devolvió la ruta (`sin_email`, `no_encontrado`…) o
 * `HTTP <status>` si no trajo uno. El mensaje es el mismo código. */
export class ErrorApiWeb extends Error {
  status: number;
  codigo: string;

  constructor(status: number, codigo: string) {
    super(codigo);
    this.name = 'ErrorApiWeb';
    this.status = status;
    this.codigo = codigo;
  }
}

export async function llamarApiWeb<T>(
  ruta: string,
  opciones?: { metodo?: 'GET' | 'POST'; cuerpo?: unknown }
): Promise<T> {
  // El token nunca va a un console.*: con él se actúa como esa persona.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ErrorApiWeb(401, 'no_autenticado');

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const conCuerpo = opciones?.cuerpo !== undefined;
  if (conCuerpo) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_WEB}${ruta}`, {
    method: opciones?.metodo ?? 'GET',
    headers,
    body: conCuerpo ? JSON.stringify(opciones?.cuerpo) : undefined,
  });

  let body: any = {};
  try {
    body = await res.json();
  } catch {
    // Cuerpo vacío o no JSON (una página de error del proxy): se trata como {}
    // y el código sale del status.
    body = {};
  }
  if (!res.ok) throw new ErrorApiWeb(res.status, body?.error ?? `HTTP ${res.status}`);
  return body as T;
}
