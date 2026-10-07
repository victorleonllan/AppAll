// Spec 109 — verificación de la firma x-signature de Mercado Pago (spec 022),
// compartida por las funciones nuevas.
//
// Copia tal cual de webhook-mp/index.ts: webhook-mp NO importa de acá a propósito.
// Es la que confirma las entradas pagadas, y cambiarla para ahorrar 40 líneas
// duplicadas no vale el riesgo. La duplicación queda anotada en PENDIENTES.md.

export async function hmacSha256Hex(secret: string, mensaje: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(mensaje));
  return Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Comparación en tiempo constante: con === , un atacante puede medir cuántos
// caracteres acertó por cuánto tardó la respuesta. No es teórico para un XOR
// de 64 caracteres hexadecimales corriendo miles de veces.
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Spec 022, problema 1. MP manda X-Signature: ts=...,v1=<hmac>. El manifest se
// arma con data.id (del query string, no del body), x-request-id y ts — si
// data.id o x-request-id no vienen, esa línea se omite del manifest.
export async function firmaValida(req: Request, url: URL, webhookSecret: string): Promise<boolean> {
  const xSignature = req.headers.get('x-signature') ?? '';
  const xRequestId = req.headers.get('x-request-id') ?? '';
  const dataId = (url.searchParams.get('data.id') ?? '').toLowerCase();

  let ts = '', v1 = '';
  for (const parte of xSignature.split(',')) {
    const [k, v] = parte.split('=');
    if (k?.trim() === 'ts') ts = (v ?? '').trim();
    if (k?.trim() === 'v1') v1 = (v ?? '').trim();
  }
  if (!ts || !v1) return false;

  const partes: string[] = [];
  if (dataId) partes.push(`id:${dataId}`);
  if (xRequestId) partes.push(`request-id:${xRequestId}`);
  partes.push(`ts:${ts}`);

  const manifest = partes.join(';') + ';';
  const esperado = await hmacSha256Hex(webhookSecret, manifest);
  // Sin log del manifest ni del hash esperado: sería un oráculo de firma para
  // cualquiera con acceso a los logs (ver webhook-mp, 2-sep-2026).
  return igualesEnTiempoConstante(esperado, v1);
}
