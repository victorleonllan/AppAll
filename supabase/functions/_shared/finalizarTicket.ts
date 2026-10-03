// Spec 105, Decisión 5 — un solo cierre para los dos caminos de Flow.
//
// webhook-flow y la rama de Flow de confirm-payment terminan igual: comparar el
// cobro con la reserva, cambiar el estado sin pisar al otro camino, emitir las
// entradas y avisar a la web para el correo. Pasar el camino de Mercado Pago a este
// helper queda fuera (toca lo que hoy cobra): ver PENDIENTES.md.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Ver confirm-payment: misma env var, mismo motivo (spec W-123).
const WEB_ORIGIN = Deno.env.get('WEB_ORIGIN') ?? 'sonopolis.org';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export interface TicketAFinalizar {
  id: string;
  status: string;
  monto: number;
  moneda: string;
}

export interface Cobro {
  nuevoEstado: 'completed' | 'cancelled';
  paymentId: string;
  monto: number;
  moneda: string;
}

export interface ResultadoFinalizar {
  status: string;
  detail?: string;
  // true solo cuando falló algo que un reintento puede arreglar (el UPDATE o
  // issue_ticket_items): webhook-flow responde 500 para que Flow vuelva a avisar.
  reintentar?: boolean;
}

// Copiado de confirm-payment (spec W-123). No se espera: el pago ya está
// confirmado y las entradas emitidas. El candado `entrada_enviada_at` (W-122)
// evita el correo doble cuando el webhook y la confirmación corren a la vez.
function mandarCorreoDeEntrada(ticketId: string) {
  const url = `https://${WEB_ORIGIN}/api/entradas/enviar-confirmacion`;
  const p = fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': SUPABASE_SERVICE_ROLE_KEY },
    body: JSON.stringify({ ticket_id: ticketId }),
  })
    .then((r) => console.log(`correo de entrada ${ticketId}: HTTP ${r.status}`))
    .catch((e) => console.error(`correo de entrada ${ticketId} falló`, e));

  // @ts-ignore EdgeRuntime es global en Supabase Edge Functions
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(p);
}

export async function finalizarTicket(
  supabase: SupabaseClient,
  ticket: TicketAFinalizar,
  cobro: Cobro,
): Promise<ResultadoFinalizar> {
  // 1. Guarda barata contra cobrar un monto y entregar otro. `monto_no_coincide`
  // no es `sin_pago_encontrado_aun`, así que reconciliar-pagos tampoco lo cancela:
  // queda pending y a la vista para revisarlo a mano.
  if (cobro.nuevoEstado === 'completed' &&
      (cobro.monto !== ticket.monto || cobro.moneda !== ticket.moneda)) {
    console.error('finalizarTicket: monto_no_coincide', ticket.id,
      { cobrado: [cobro.monto, cobro.moneda], reservado: [ticket.monto, ticket.moneda] });
    return { status: 'pending', detail: 'monto_no_coincide' };
  }

  // 2. La guarda de `pending` evita pisar lo que el otro camino ya resolvió.
  // webhook-mp no la tiene, y por eso puede revivir un ticket cancelado.
  const { data: actualizados, error: updateError } = await supabase
    .from('tickets')
    .update({ status: cobro.nuevoEstado, payment_id: cobro.paymentId })
    .eq('id', ticket.id)
    .eq('status', 'pending')
    .select('id');

  if (updateError) {
    console.error('finalizarTicket: error actualizando ticket', ticket.id, updateError);
    return { status: ticket.status, detail: 'update_fallido', reintentar: true };
  }

  // Sin fila actualizada, el ticket ya no estaba pending (lo resolvió el otro
  // camino, quizá recién): se relee y se responde lo que es. Si está completed
  // (p. ej. un intento anterior que falló al emitir), se sigue a la emisión:
  // issue_ticket_items es idempotente y así el reintento de Flow sirve.
  let estadoFinal: string = cobro.nuevoEstado;
  if ((actualizados ?? []).length === 0) {
    const { data: actual } = await supabase
      .from('tickets').select('status').eq('id', ticket.id).maybeSingle();
    estadoFinal = actual?.status ?? ticket.status;
  }

  // 3. Emisión y correo, solo si el ticket está completed.
  if (estadoFinal === 'completed') {
    const { data: emitidas, error: emitErr } = await supabase.rpc('issue_ticket_items', {
      p_ticket: ticket.id,
    });
    if (emitErr) {
      console.error('finalizarTicket: issue_ticket_items falló', ticket.id, emitErr);
      // El ticket queda completed — no se revierte. Un reintento puede emitir.
      return { status: 'completed', detail: 'emision_pendiente', reintentar: true };
    }
    console.log(`finalizarTicket: ticket ${ticket.id} → completed, ${emitidas} entradas emitidas`);
    mandarCorreoDeEntrada(ticket.id);
  }

  return { status: estadoFinal };
}
