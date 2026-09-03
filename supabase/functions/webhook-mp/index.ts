import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;
const MERCADOPAGO_WEBHOOK_SECRET = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function hmacSha256Hex(secret: string, mensaje: string): Promise<string> {
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
function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Spec 022, problema 1. MP manda X-Signature: ts=...,v1=<hmac>. El manifest se
// arma con data.id (del query string, no del body), x-request-id y ts — si
// data.id o x-request-id no vienen, esa línea se omite del manifest.
async function firmaValida(req: Request, url: URL): Promise<boolean> {
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
  const esperado = await hmacSha256Hex(MERCADOPAGO_WEBHOOK_SECRET, manifest);
  // DEBUG TEMPORAL (2-sep-2026) — quitar una vez resuelto el 401. No loguea el secret.
  console.log('firmaValida debug', {
    xSignatureRaw: xSignature,
    xRequestId,
    dataId,
    manifest,
    v1Recibido: v1,
    esperado,
    coincide: igualesEnTiempoConstante(esperado, v1),
  });
  return igualesEnTiempoConstante(esperado, v1);
}

// Estado de MP → estado del ticket. 'paid'/'approved' son de Mercado Pago;
// los valores de la derecha son TicketStatus (src/types/index.ts).
const ESTADO_MP: Record<string, 'completed' | 'cancelled' | 'refunded'> = {
  approved: 'completed',
  paid: 'completed',
  rejected: 'cancelled',
  cancelled: 'cancelled',
  refunded: 'refunded',
  charged_back: 'refunded',
};
// pending, in_process y authorized no aparecen: el ticket se queda en 'pending'.

async function mpGet(path: string) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`MP ${path} → ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

serve(async (req) => {
  const url = new URL(req.url);

  // Spec 022, problema 1. 401 y no 500: una firma inválida no es un error
  // transitorio que valga la pena reintentar, es una notificación que no
  // confiamos en procesar. MP no reintenta sobre 401.
  if (!(await firmaValida(req, url))) {
    console.error('Firma x-signature inválida, notificación rechazada', { url: req.url });
    return new Response('Invalid signature', { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // MP notifica de dos formas: query string (?topic=&id=) y POST con cuerpo
    // { type, data: { id } }. En webhooks v2 el POST es el camino habitual.
    // `url` ya se parseó arriba, antes de validar la firma.
    let topic = url.searchParams.get('topic') ?? url.searchParams.get('type');
    let id = url.searchParams.get('id') ?? url.searchParams.get('data.id');

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      if (body) {
        topic = body.type ?? body.topic ?? topic;
        id = body.data?.id?.toString() ?? body.id?.toString() ?? id;
      }
    }

    if (!topic || !id) {
      console.log('Notificación sin topic/id, se ignora');
      return new Response('OK', { status: 200 });
    }

    let preferenceId: string | null = null;
    let paymentId: string | null = null;
    let estadoMp: string | null = null;

    if (topic === 'payment') {
      const pago = await mpGet(`/v1/payments/${id}`);
      // Bug encontrado 2-sep-2026: `pago.preference_id` ya no existe en la
      // respuesta actual de MP (verificado contra un pago real) y `pago.order.id`
      // es un id de otro concepto (Orders API) que nunca coincide con el
      // preference_id que guardamos — el UPDATE de abajo nunca encontraba el
      // ticket y ningún pago real se marcó completed. Fix: create-preference
      // manda `metadata.ticket_ref` (una referencia propia, no depende de campos
      // que MP puede dejar de mandar) y acá la leemos primero. Los fallbacks
      // quedan solo por si algún pago viejo, previo a este fix, sí trae alguno.
      preferenceId = pago.metadata?.ticket_ref ?? pago.preference_id ?? pago.order?.id ?? null;
      paymentId = pago.id?.toString() ?? id;
      estadoMp = pago.status;
    } else if (topic === 'merchant_order') {
      const order = await mpGet(`/merchant_orders/${id}`);
      preferenceId = order.preference_id ?? null;
      // El pago vive dentro de la orden; el id de la orden NO es el del pago.
      paymentId = order.payments?.[0]?.id?.toString() ?? null;
      estadoMp = order.order_status;
    } else {
      // Tópico que no nos interesa (plan, subscription…). Reintentar no sirve.
      console.log('Tópico ignorado:', topic);
      return new Response('OK', { status: 200 });
    }

    const nuevoEstado = estadoMp ? ESTADO_MP[estadoMp] : undefined;

    if (!nuevoEstado) {
      console.log(`Pago en estado "${estadoMp}", el ticket sigue pending`);
      return new Response('OK', { status: 200 });
    }

    if (!preferenceId) {
      console.error('No se pudo determinar preference_id', { topic, id });
      return new Response('Missing preference_id', { status: 500 });
    }

    const { error, data } = await supabase
      .from('tickets')
      .update({ status: nuevoEstado, payment_id: paymentId })
      .eq('preference_id', preferenceId)
      .select('id');

    if (error) {
      console.error('Error actualizando ticket:', error);
      return new Response('DB update failed', { status: 500 });
    }

    console.log(`Tickets actualizados: ${data?.length ?? 0} → ${nuevoEstado}`);

    // Emitir las entradas es parte de confirmar el pago, no un paso posterior
    // opcional (spec 037). issue_ticket_items es SECURITY DEFINER con el EXECUTE
    // revocado a anon/authenticated (spec 036); solo el service role de acá puede
    // llamarla.
    if (nuevoEstado === 'completed' && data) {
      for (const t of data) {
        const { data: emitidas, error: emitErr } = await supabase.rpc(
          'issue_ticket_items',
          { p_ticket: t.id },
        );

        if (emitErr) {
          // El pago SÍ está confirmado y el ticket ya quedó 'completed'. No
          // revertimos: devolvemos 500 para que MP reintente la notificación, y
          // la reentrada completa lo que falte (issue_ticket_items emite
          // cantidad - ya_emitidas, no vuelve a emitir de cero).
          console.error('issue_ticket_items falló', t.id, emitErr);
          return new Response('emision_fallida', { status: 500 });
        }
        console.log(`Ticket ${t.id}: ${emitidas} entradas emitidas`);
      }
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    // 500 a propósito: MP reintenta lo que no devuelve 2xx. Devolver 200 aquí
    // dejaba el pago cobrado y el ticket en pending para siempre.
    console.error('webhook error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
