import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Deploy web de Sonópolis. Las back_urls deben ser HTTPS: MP las valida al crear la
// preferencia y con auto_return activo un scheme nativo hace que la rechace.
const APP_WEB_URL = Deno.env.get('APP_WEB_URL') ?? 'https://sonopolis.org';

// La app web llama a esta function desde otro origen. Sin esto el navegador
// bloquea el preflight y la petición nunca sale.
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

// Spec 022, problema 2. Valor de partida, no una decisión de negocio cerrada
// — ver la nota del spec si Victor quiere otro número.
const MAX_CANTIDAD_POR_COMPRA = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { evento_id, user_id, cantidad } = await req.json();

    // Validar usuario
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== user_id) {
      return json({ error: 'unauthorized', detail: 'Sesión inválida o user_id no coincide' }, 401);
    }

    // Spec 022, problema 2. Sin esto, cantidad: 0/negativa confunde a MP y
    // cantidad: 999999 crea una preferencia real cobrable por esa cantidad.
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CANTIDAD_POR_COMPRA) {
      return json({
        error: 'cantidad_invalida',
        detail: `cantidad debe ser un entero entre 1 y ${MAX_CANTIDAD_POR_COMPRA}`,
      }, 400);
    }

    // Info del evento
    const { data: evento, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', evento_id)
      .single();

    if (error || !evento) {
      return json({ error: 'evento_no_encontrado', evento_id }, 404);
    }

    // Cuánto se cobra ahora mismo (spec 065): general, puerta, o la preventa vigente
    // — la decide precio_vigente_de() en Postgres, esta function no sabe nada de
    // tipo_precio ni de event_preventas, solo relaya el número.
    const { data: cotizacion, error: cotizError } = await supabase
      .rpc('precio_vigente_de', { p_evento_id: evento_id })
      .single();

    if (cotizError || !cotizacion) {
      console.error('precio_vigente_de falló:', cotizError);
      return json({ error: 'precio_no_disponible', detail: cotizError?.message }, 500);
    }

    // Crear preferencia en MP
    const preference = {
      items: [{
        id: evento.id,
        title: `Entrada: ${evento.artist_name} - ${evento.venue_name}`,
        quantity: cantidad,
        unit_price: cotizacion.monto,
        currency_id: 'CLP',
      }],
      payer: { email: user.email },
      back_urls: {
        success: `${APP_WEB_URL}/?compra=success`,
        failure: `${APP_WEB_URL}/?compra=failure`,
        pending: `${APP_WEB_URL}/?compra=pending`,
      },
      auto_return: 'approved',
      notification_url: `${SUPABASE_URL}/functions/v1/webhook-mp`,
      external_reference: `${evento_id}|${user_id}`,
    };

    const mpRes = await fetch(
      'https://api.mercadopago.com/checkout/preferences',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preference),
      }
    );

    if (!mpRes.ok) {
      const errorText = await mpRes.text();
      console.error('MP API error:', mpRes.status, errorText);
      // El detalle viaja al cliente: sin esto el próximo fallo vuelve a ser invisible.
      return json({ error: 'mp_preference_failed', status: mpRes.status, detail: errorText }, 502);
    }

    const mpData = await mpRes.json();

    // Spec 022, problema 3. Reserva cantidad + aforo dentro de una función
    // SECURITY DEFINER que bloquea la fila del evento antes de contar (mismo
    // patrón que event_folio_counters, spec 036). No hay policy de INSERT en
    // tickets: ésta es la única vía de escritura real, incluso por RPC directo.
    const { data: ticket, error: ticketError } = await supabase
      .rpc('reservar_ticket_pending', {
        p_evento_id: evento_id,
        p_cantidad: cantidad,
        p_preference_id: mpData.id,
      })
      .single();

    if (ticketError) {
      const sinCupo = ticketError.message?.includes('sin_cupo');
      console.error('reservar_ticket_pending falló:', ticketError);
      return json({
        error: sinCupo ? 'sin_cupo' : 'ticket_insert_failed',
        detail: ticketError.message,
      }, sinCupo ? 409 : 500);
    }

    return json({
      preference_id: mpData.id,
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      ticket_id: ticket.id,
    }, 200);
  } catch (err) {
    console.error('create-preference error:', err);
    return json({ error: 'internal', detail: String(err) }, 500);
  }
});