// Spec 105 — una cuenta de Flow por país, y el cliente HTTP de su API.
//
// Mismo patrón que cuentasMP.ts (spec 101): qué país cobra con qué pasarela vive en
// la base (`pasarelas_cobro`, spec 104); acá solo están los secretos, que no pueden
// vivir en la base. Flow Chile y Flow México son comercios distintos (el mexicano
// pide alta en el SAT y deposita en una cuenta mexicana), así que una cuenta por país.
const SECRETOS: Record<string, { apiKey?: string; secretKey?: string }> = {
  CL: { apiKey: Deno.env.get('FLOW_API_KEY_CL'), secretKey: Deno.env.get('FLOW_SECRET_KEY_CL') },
  MX: { apiKey: Deno.env.get('FLOW_API_KEY_MX'), secretKey: Deno.env.get('FLOW_SECRET_KEY_MX') },
};

// Un solo secret para todo el proyecto: apuntarlo a https://sandbox.flow.cl/api
// prueba los dos países sin tocar código.
const FLOW_API_URL = Deno.env.get('FLOW_API_URL') ?? 'https://www.flow.cl/api';

export interface CuentaFlow {
  pais: string;
  apiKey: string;
  secretKey: string;
}

// `throw` y no un fallback a otro país: cobrar con la cuenta equivocada es el
// error que el spec 101 cerró para Mercado Pago.
export function cuentaFlow(pais: string): CuentaFlow {
  const c = SECRETOS[pais];
  if (!c?.apiKey || !c?.secretKey) {
    throw new Error(`cuenta_flow_no_configurada: ${pais}`);
  }
  return { pais, apiKey: c.apiKey, secretKey: c.secretKey };
}

// Firma `s` de Flow (developers.flow.cl/api, "Cómo firmar"): parámetros ordenados
// por nombre, concatenados como nombre + valor sin separador, HMAC-SHA256 con la
// secretKey, en hexadecimal. `s` nunca entra en lo que se firma.
export async function firmar(params: Record<string, string>, secretKey: string): Promise<string> {
  const mensaje = Object.keys(params)
    .filter((k) => k !== 's')
    .sort()
    .map((k) => k + params[k])
    .join('');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(mensaje));
  return Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function firmados(cuenta: CuentaFlow, params: Record<string, string>) {
  const conKey = { ...params, apiKey: cuenta.apiKey };
  return new URLSearchParams({ ...conKey, s: await firmar(conKey, cuenta.secretKey) });
}

// Lanza con el cuerpo de la respuesta: tirarlo es el bug que costó caro en el
// spec 021 (un 400 de la pasarela sin saber por qué).
async function leer(res: Response, path: string) {
  const texto = await res.text();
  if (!res.ok) {
    throw new Error(`Flow ${path} → ${res.status}: ${texto}`);
  }
  return JSON.parse(texto);
}

export async function flowGet(cuenta: CuentaFlow, path: string, params: Record<string, string>) {
  const qs = await firmados(cuenta, params);
  return leer(await fetch(`${FLOW_API_URL}${path}?${qs}`), path);
}

export async function flowPost(cuenta: CuentaFlow, path: string, params: Record<string, string>) {
  const body = await firmados(cuenta, params);
  return leer(await fetch(`${FLOW_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }), path);
}

// Estado de Flow → estado del ticket. 1 pendiente de pago · 2 pagada ·
// 3 rechazada · 4 anulada (developers.flow.cl, "Estado de orden"). Con `null` el
// ticket sigue `pending`.
export const ESTADO_FLOW: Record<number, 'completed' | 'cancelled' | null> = {
  1: null,
  2: 'completed',
  3: 'cancelled',
  4: 'cancelled',
};
