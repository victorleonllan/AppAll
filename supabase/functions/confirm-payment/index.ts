import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Spec 022-addendum (2-sep-2026). El webhook-mp no confirma pagos: la firma
// x-signature nunca coincide contra tráfico real (raíz aún sin diagnosticar
// del lado de Mercado Pago, ver como-testear-una-compra.md Problema 7 en el
// vault). Mientras eso no se resuelva, esta function es un CAMINO PARALELO,
// no un reemplazo: la pantalla de confirmación (`/compra/confirmacion`) la
// llama en cada tick de su polling para verificar el pago directo contra la
// API de MP con nuestro propio access token — no depende de que MP nos avise,
// nosotros preguntamos. Si el webhook se arregla más adelante, ambos caminos
// conviven sin conflicto: los dos hacen el mismo UPDATE idempotente.

const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// Mismo mapeo que webhook-mp — no se comparte archivo entre dos Edge
// Functions de Supabase sin un paso de build extra, así que se duplica a
// propósito. Si uno cambia, cambiar el otro.
const ESTADO_MP: Record<string, 'completed' | 'cancelled' | 'refunded'> = {
  approved: 'completed',
  paid: 'completed',
  rejected: 'cancelled',
  cancelled: 'cancelled',
  refunded: 'refunded',
  charged_back: 'refunded',
};

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // `ticket_ref` (spec 072) es el `metadata.ticket_ref` que create-preference
    // genera ANTES de hablar con MP y guarda en tickets.preference_id — la única
    // referencia del ticket que existe antes que el ticket, y por eso la única
    // que puede viajar en la back_url de Mercado Pago. `ticket_id` sigue siendo
    // el camino del polling de /compra/confirmacion, que sí lo tiene.
    const { ticket_id, ticket_ref } = await req.json();
    if (!ticket_id && !ticket_ref) {
      return json({ error: 'ticket_id_o_ticket_ref_requerido' }, 400);
    }

    // Service role: esta function solo puede CONFIRMAR contra datos reales de
    // MP, nunca inventar un estado — no hay policy de UPDATE que un cliente
    // pueda explotar llamando a esto con un ticket_id ajeno, porque el nuevo
    // estado depende de lo que MP responda, no de lo que pida quien llama.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const consulta = supabase
      .from('tickets')
      .select('id, evento_id, user_id, status, preference_id');

    const { data: ticket, error: ticketError } = await (
      ticket_id ? consulta.eq('id', ticket_id) : consulta.eq('preference_id', ticket_ref)
    ).maybeSingle();

    if (ticketError || !ticket) {
      return json({ error: 'ticket_no_encontrado' }, 404);
    }

    // Ya resuelto (por el webhook, o por una llamada anterior a esta misma
    // function) — nada que hacer, y no vale la pena gastar la consulta a MP.
    if (ticket.status !== 'pending') {
      return json({ status: ticket.status }, 200);
    }

    if (!ticket.user_id) {
      // Guest checkout sin user_id todavía no tiene external_reference que
      // buscar acá — fuera de alcance de este parche puntual.
      return json({ status: 'pending', detail: 'guest_no_soportado_aun' }, 200);
    }

    const externalReference = `${ticket.evento_id}|${ticket.user_id}`;
    const busqueda = await mpGet(
      `/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc`,
    );

    // Puede haber más de un intento de pago para el mismo evento+usuario
    // (reintentos, compras distintas) — el que corresponde a ESTE ticket es
    // el que trae nuestro propio ticket_ref en metadata (ver create-preference,
    // fix 2-sep-2026), nunca el más reciente a secas.
    const pago = (busqueda.results ?? []).find(
      (p: any) => p.metadata?.ticket_ref === ticket.preference_id,
    );

    if (!pago) {
      return json({ status: 'pending', detail: 'sin_pago_encontrado_aun' }, 200);
    }

    const nuevoEstado = ESTADO_MP[pago.status];
    if (!nuevoEstado) {
      // pending / in_process / authorized del lado de MP — el ticket sigue
      // pending, no es un error.
      return json({ status: 'pending', mpStatus: pago.status }, 200);
    }

    const { error: updateError } = await supabase
      .from('tickets')
      .update({ status: nuevoEstado, payment_id: pago.id?.toString() })
      .eq('id', ticket.id)
      .eq('status', 'pending'); // no pisar un estado que el webhook ya haya puesto mientras tanto

    if (updateError) {
      console.error('confirm-payment: error actualizando ticket', updateError);
      return json({ error: 'update_fallido', detail: updateError.message }, 500);
    }

    if (nuevoEstado === 'completed') {
      const { data: emitidas, error: emitErr } = await supabase.rpc('issue_ticket_items', {
        p_ticket: ticket.id,
      });
      if (emitErr) {
        console.error('confirm-payment: issue_ticket_items falló', ticket.id, emitErr);
        // El ticket ya quedó completed — no revertir. El próximo poll (o el
        // webhook, si algún día llega) puede reintentar la emisión.
        return json({ status: 'completed', detail: 'emision_pendiente' }, 200);
      }
      console.log(`confirm-payment: ticket ${ticket.id} → completed, ${emitidas} entradas emitidas`);
    }

    return json({ status: nuevoEstado }, 200);
  } catch (err) {
    console.error('confirm-payment error:', err);
    return json({ error: 'internal', detail: String(err) }, 500);
  }
});
