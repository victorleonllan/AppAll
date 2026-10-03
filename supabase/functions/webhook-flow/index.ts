import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cuentaFlow, ESTADO_FLOW, flowGet } from '../_shared/flow.ts';
import { finalizarTicket } from '../_shared/finalizarTicket.ts';

// Spec 105, Decisión 3. Flow avisa con un POST form-urlencoded que solo trae
// `token`, sin firma. La garantía es otra: el estado se le pide a Flow con nuestra
// secretKey. Un token inventado devuelve error en getStatus, y uno real solo puede
// confirmar lo que Flow dice. Por eso este webhook sí confirma en producción, a
// diferencia de webhook-mp (firma que nunca coincide, Problema 7).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const url = new URL(req.url);

  // 1. `?cuenta=` lo pone create-payment-flow en urlConfirmation: toda orden de
  // Flow nace con él. Sin él (o con un país sin secrets) no hay con qué preguntar.
  let cuenta;
  try {
    cuenta = cuentaFlow(url.searchParams.get('cuenta') ?? '');
  } catch (err) {
    console.error('webhook-flow: cuenta inválida', url.search, err);
    return new Response('cuenta_invalida', { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  const token = form?.get('token')?.toString();
  if (!token) {
    console.error('webhook-flow: POST sin token');
    return new Response('token_requerido', { status: 400 });
  }

  // 2. Preguntarle a Flow. Si falla (red, 5xx, token inválido), 500: Flow
  // reintenta y puede salir bien.
  let estado;
  try {
    estado = await flowGet(cuenta, '/payment/getStatus', { token });
  } catch (err) {
    console.error('webhook-flow: getStatus falló', err);
    return new Response('flow_status_failed', { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 3. El ticket por nuestra referencia (commerceOrder = tickets.preference_id).
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('id, status, monto, moneda')
      .eq('preference_id', estado.commerceOrder)
      .maybeSingle();

    if (ticketError) {
      console.error('webhook-flow: error buscando ticket', ticketError);
      return new Response('db_error', { status: 500 });
    }
    if (!ticket) {
      // Nada que Flow pueda reintentar con éxito: 200 y queda en el log.
      console.error('webhook-flow: sin ticket para commerceOrder', estado.commerceOrder, 'flowOrder', estado.flowOrder);
      return new Response('OK', { status: 200 });
    }

    const nuevoEstado = ESTADO_FLOW[estado.status];
    if (!nuevoEstado) {
      // 1 = pendiente de pago (o un estado desconocido): el ticket sigue pending.
      console.log(`webhook-flow: orden ${estado.flowOrder} en estado ${estado.status}, ticket ${ticket.id} sigue`);
      return new Response('OK', { status: 200 });
    }

    // 4. Mismo cierre que la rama de Flow de confirm-payment.
    const resultado = await finalizarTicket(supabase, ticket, {
      nuevoEstado,
      paymentId: String(estado.flowOrder),
      monto: Number(estado.amount),
      moneda: estado.currency,
    });

    // 5. 500 solo si un reintento puede arreglarlo (UPDATE o issue_ticket_items).
    if (resultado.reintentar) {
      return new Response(resultado.detail ?? 'reintentar', { status: 500 });
    }
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('webhook-flow error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
