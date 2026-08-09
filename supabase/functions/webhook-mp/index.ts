import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // MP notifica de dos formas: query string (?topic=&id=) y POST con cuerpo
    // { type, data: { id } }. En webhooks v2 el POST es el camino habitual.
    const url = new URL(req.url);
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
      preferenceId = pago.preference_id ?? pago.order?.id ?? null;
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
    return new Response('OK', { status: 200 });
  } catch (err) {
    // 500 a propósito: MP reintenta lo que no devuelve 2xx. Devolver 200 aquí
    // dejaba el pago cobrado y el ticket en pending para siempre.
    console.error('webhook error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
