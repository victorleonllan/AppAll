import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cuentaFlow, flowPost } from '../_shared/flow.ts';

// Spec 105, Decisión 2. El hermano de create-preference para Flow: misma entrada,
// mismas validaciones, pero al revés — primero se reserva y después se cobra.
// El monto que se cobra sale de la reserva, la única fuente de verdad del precio
// (preventa, cupo, cantidad). Con el orden de MP, un fallo de la reserva deja un
// link de pago vivo para un ticket que no existe; con este, un fallo de Flow deja
// un ticket reservado, y se libera en el acto (paso 6).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Ver create-preference: el deploy web de Sonópolis, que recibe la vuelta del pago.
const APP_WEB_URL = Deno.env.get('APP_WEB_URL') ?? 'https://sonopolis.org';

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

// Mismo tope que create-preference (spec 022, problema 2).
const MAX_CANTIDAD_POR_COMPRA = 10;

// Spec 105. Los mismos 30 minutos que `ticket_reserva_ttl()` en Postgres (spec 088)
// y que RESERVA_TTL_MINUTOS en create-preference: a esa hora el aforo deja de
// contar el ticket, así que la orden de Flow tiene que morir con él. Si no, alguien
// paga a los 45 minutos una entrada ya revendida. Al cambiar uno, cambiar los tres.
// También cierra la orden antes de que un voucher en efectivo (paymentMethod 9) se
// pague horas después — verificarlo en sandbox es una V de PENDIENTES.md.
const TIMEOUT_ORDEN_SEGUNDOS = 30 * 60;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { evento_id, user_id, cantidad } = await req.json();

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== user_id) {
      return json({ error: 'unauthorized', detail: 'Sesión inválida o user_id no coincide' }, 401);
    }

    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CANTIDAD_POR_COMPRA) {
      return json({
        error: 'cantidad_invalida',
        detail: `cantidad debe ser un entero entre 1 y ${MAX_CANTIDAD_POR_COMPRA}`,
      }, 400);
    }

    const { data: evento, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', evento_id)
      .single();

    if (error || !evento) {
      return json({ error: 'evento_no_encontrado', evento_id }, 404);
    }

    const { data: cotizacion, error: cotizError } = await supabase
      .rpc('precio_vigente_de', { p_evento_id: evento_id })
      .single<{ se_vende: boolean }>();

    if (cotizError || !cotizacion) {
      console.error('precio_vigente_de falló:', cotizError);
      return json({ error: 'precio_no_disponible', detail: cotizError?.message }, 500);
    }

    if (!cotizacion.se_vende) {
      return json({ error: 'pais_sin_cobro', pais: evento.pais }, 409);
    }

    // 1. Flow activo para el país (spec 104). La reserva también lo valida, pero
    // acá se corta antes de reservar, con un error que la web sabe traducir.
    const { data: pasarela } = await supabase
      .from('pasarelas_cobro')
      .select('pasarela')
      .eq('pais', evento.pais)
      .eq('pasarela', 'flow')
      .eq('activo', true)
      .maybeSingle();

    if (!pasarela) {
      return json({ error: 'pasarela_inactiva', pais: evento.pais, pasarela: 'flow' }, 409);
    }

    // 2. Una cuenta de Flow por país: nunca cobrar con la de otro.
    let cuenta;
    try {
      cuenta = cuentaFlow(evento.pais);
    } catch (err) {
      console.error('cuentaFlow falló:', err);
      return json({ error: 'cuenta_flow_no_configurada', pais: evento.pais }, 500);
    }

    // 3. Referencia propia, generada antes de hablar con Flow (como ticket_ref en
    // create-preference, spec 072). Va a tickets.preference_id y a Flow como
    // commerceOrder: con ella confirm-payment busca el pago sin token.
    const ticketRef = crypto.randomUUID();

    // 4. Reserva.
    const { data: ticket, error: ticketError } = await supabase
      .rpc('reservar_ticket_pending', {
        p_evento_id: evento_id,
        p_cantidad: cantidad,
        p_preference_id: ticketRef,
        p_pasarela: 'flow',
      })
      .single<{ id: string; monto: number; moneda: string }>();

    if (ticketError) {
      const msg = ticketError.message ?? '';
      const codigo = msg.includes('sin_cupo') ? 'sin_cupo'
        : msg.includes('pais_sin_cobro') ? 'pais_sin_cobro'
        : msg.includes('pasarela_inactiva') ? 'pasarela_inactiva'
        : null;
      console.error('reservar_ticket_pending falló:', ticketError);
      return json({ error: codigo ?? 'ticket_insert_failed', detail: msg }, codigo ? 409 : 500);
    }

    // 5. Cobro en Flow, por el monto y la moneda que calculó la reserva.
    const subject = `Entrada: ${evento.artist_name} - ${evento.venue_name}` +
      (cantidad > 1 ? ` ×${cantidad}` : '');

    let orden;
    try {
      orden = await flowPost(cuenta, '/payment/create', {
        commerceOrder: ticketRef,
        subject,
        currency: ticket.moneda,
        amount: String(ticket.monto),
        email: user.email ?? '',
        paymentMethod: '9',
        // `?cuenta=`: webhook-flow lo lee para saber con qué cuenta preguntarle
        // a Flow por este token.
        urlConfirmation: `${SUPABASE_URL}/functions/v1/webhook-flow?cuenta=${cuenta.pais}`,
        urlReturn: `${APP_WEB_URL}/api/flow/retorno?ref=${ticketRef}`,
        timeout: String(TIMEOUT_ORDEN_SEGUNDOS),
        optional: JSON.stringify({ ticket_id: ticket.id }),
      });
    } catch (err) {
      // 6. Flow no creó la orden: el cupo se devuelve en el acto, sin esperar
      // los 30 minutos de la reserva. `.eq('status','pending')` para no pisar
      // nada que haya cambiado mientras tanto.
      // Cliente aparte, solo con service role: `supabase` lleva el JWT del
      // comprador (lo necesita la reserva para auth.uid()), y `tickets` no tiene
      // policy de UPDATE — con él, este UPDATE no tocaría ninguna fila, sin error.
      console.error('Flow payment/create falló:', err);
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error: cancelErr } = await admin
        .from('tickets')
        .update({ status: 'cancelled' })
        .eq('id', ticket.id)
        .eq('status', 'pending');
      if (cancelErr) {
        console.error('No se pudo cancelar el ticket tras el fallo de Flow:', ticket.id, cancelErr);
      }
      return json({ error: 'flow_create_failed', detail: String(err) }, 502);
    }

    // 7. El comprador paga en url + ?token=.
    return json({
      checkout_url: `${orden.url}?token=${orden.token}`,
      ticket_id: ticket.id,
      pasarela: 'flow',
    }, 200);
  } catch (err) {
    console.error('create-payment-flow error:', err);
    return json({ error: 'internal', detail: String(err) }, 500);
  }
});
