import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cuentaMP } from '../_shared/cuentasMP.ts';

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

// Spec 088. Los mismos 30 minutos que `ticket_reserva_ttl()` en Postgres: a esa
// hora el aforo deja de contar este ticket, así que el link de pago tiene que
// morir con él. Si no, alguien paga a los 45 min una entrada ya revendida —
// sobreventa, que es el error caro. Los dos números son uno solo a propósito:
// al cambiar este hay que cambiar la función SQL, y al revés.
const RESERVA_TTL_MINUTOS = 30;

// MP espera `yyyy-MM-dd'T'HH:mm:ss.SSSZ` con offset explícito. `toISOString()`
// termina en 'Z' y la API lo rechaza según la versión del endpoint: se manda el
// mismo instante con el offset escrito.
function vencimientoMP(minutos: number): string {
  return new Date(Date.now() + minutos * 60 * 1000)
    .toISOString()
    .replace('Z', '+00:00');
}

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

    // Spec 101. Antes de crear nada en MP: si el país no vende, no hay preferencia
    // cobrable esperando un ticket que nunca va a existir. `_reservar_ticket_shared`
    // (spec 100) también lo valida, pero ahí ya sería tarde para MP.
    if (!cotizacion.se_vende) {
      return json({ error: 'pais_sin_cobro', pais: evento.pais }, 409);
    }

    // Una cuenta de Mercado Pago por país (spec 101): `throw` si faltan los
    // secrets, nunca cobrar con la cuenta de otro país.
    let cuenta;
    try {
      cuenta = cuentaMP(evento.pais);
    } catch (err) {
      console.error('cuentaMP falló:', err);
      return json({ error: 'cuenta_mp_no_configurada', pais: evento.pais }, 500);
    }

    // Bug encontrado 2-sep-2026: GET /v1/payments/{id} ya no trae `preference_id`
    // como campo propio (MP lo movió/quitó al migrar a la Orders API por dentro).
    // webhook-mp no tenía con qué encontrar el ticket — nunca se completó uno real.
    // Fix: generamos nuestra propia referencia ANTES de llamar a MP, se la mandamos
    // en `metadata` (MP la devuelve tal cual en el pago) y es lo que guardamos en
    // tickets.preference_id — deja de depender de un campo que MP dejó de mandar.
    const ticketRef = crypto.randomUUID();

    // Crear preferencia en MP
    const preference = {
      items: [{
        id: evento.id,
        title: `Entrada: ${evento.artist_name} - ${evento.venue_name}`,
        quantity: cantidad,
        unit_price: cotizacion.monto,
        currency_id: cotizacion.moneda,
      }],
      payer: { email: user.email },
      back_urls: {
        // Spec W076 (3-sep-2026) ya resolvió dónde ve el fan sus entradas —
        // el pago aprobado vuelve directo ahí, no a la home.
        // `ref` (spec 072): la pestaña que MP devuelve puede pedirle la
        // confirmación a confirm-payment por su cuenta, en vez de depender de
        // que la otra pestaña siga abierta haciendo polling.
        success: `${APP_WEB_URL}/mis-entradas?compra=success&ref=${ticketRef}`,
        failure: `${APP_WEB_URL}/?compra=failure`,
        pending: `${APP_WEB_URL}/?compra=pending`,
      },
      // Spec 072. Fuera efectivo (`ticket`) y transferencia por cajero (`atm`):
      // MP los aprueba horas o días después del checkout, y la reconciliación
      // hoy corre una vez al día (límite del plan Hobby de Vercel), así que ese
      // comprador se quedaría sin entrada hasta la corrida siguiente. Quedan
      // tarjeta y saldo de MP, que se aprueban en el acto.
      // REVERTIR cuando el cron pase a correr cada pocos minutos.
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
      },
      auto_return: 'approved',
      // Spec 088. El checkout caduca a la misma hora que la reserva. Seguro
      // hoy porque el spec 072 ya excluyó efectivo y cajero, los únicos medios
      // que MP aprueba horas después: lo que queda (tarjeta, saldo) aprueba en
      // el acto. Si se revierte aquella exclusión, revisar este plazo ANTES —
      // un pago en efectivo aprobado al día siguiente caería sobre una reserva
      // ya vencida y su lugar podría estar vendido.
      expires: true,
      expiration_date_to: vencimientoMP(RESERVA_TTL_MINUTOS),
      // `?cuenta=` (spec 101): webhook-mp lo lee para saber con qué secreto
      // validar la firma y con qué token preguntarle a MP. Sin el parámetro
      // (preferencias creadas antes de este spec) cae a CL.
      notification_url: `${SUPABASE_URL}/functions/v1/webhook-mp?cuenta=${cuenta.pais}`,
      external_reference: `${evento_id}|${user_id}`,
      metadata: { ticket_ref: ticketRef },
    };

    const mpRes = await fetch(
      'https://api.mercadopago.com/checkout/preferences',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cuenta.token}`,
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
        p_preference_id: ticketRef,
      })
      .single();

    if (ticketError) {
      const sinCupo = ticketError.message?.includes('sin_cupo');
      const paisSinCobro = ticketError.message?.includes('pais_sin_cobro');
      console.error('reservar_ticket_pending falló:', ticketError);
      return json({
        error: sinCupo ? 'sin_cupo' : paisSinCobro ? 'pais_sin_cobro' : 'ticket_insert_failed',
        detail: ticketError.message,
      }, sinCupo || paisSinCobro ? 409 : 500);
    }

    // Spec 101. El evento pudo cambiar de país entre el chequeo de arriba y esta
    // llamada (dos consultas separadas, sin lock entre ellas). No se cancela a
    // mano: el ticket queda `pending` y caduca solo a los 30 minutos (spec 088),
    // igual que el checkout de MP.
    if (ticket.pais_cobro !== cuenta.pais) {
      console.error('cuenta_inconsistente: ticket', ticket.id, 'pais_cobro', ticket.pais_cobro, 'vs cuenta', cuenta.pais);
      return json({ error: 'cuenta_inconsistente' }, 500);
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