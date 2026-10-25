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

// Spec W-259 (sonopolisWeb). Misma regla que `public.correos_validos` (W-258): el CHECK
// de la base es la guarda real; esto solo responde 409 antes de reservar.
const CORREO_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// `destinatarios` del body → lista normalizada (trim + minúsculas, sin vacíos), `null` si no
// viene o queda vacía, o `'invalido'` si no es un arreglo de strings.
function normalizarDestinatarios(valor: unknown): string[] | null | 'invalido' {
  if (valor === undefined || valor === null) return null;
  if (!Array.isArray(valor) || valor.some((c) => typeof c !== 'string')) return 'invalido';
  const lista = (valor as string[]).map((c) => c.trim().toLowerCase()).filter((c) => c !== '');
  return lista.length > 0 ? lista : null;
}

// Válida solo con un pack y para las entradas 2..N: la primera es del comprador.
function destinatariosValidos(lista: string[], entradas: number | null): boolean {
  return entradas !== null &&
    lista.length <= entradas - 1 &&
    lista.every((c) => c.length <= 254 && CORREO_RE.test(c));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // Spec W-253: `especialId` opcional. Con él, `cantidad` son PACKS del ticket especial.
    // Spec W-259: `destinatarios` opcional, correos de las entradas 2..N de un pack.
    const {
      evento_id, user_id, cantidad, origen, especialId, destinatarios: destinatariosBody,
    } = await req.json();

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

    // Spec 117. La app nativa pide su propio retorno con `origen: 'app'`. Un valor
    // desconocido se rechaza en vez de caer a la web: si no, la app recibiría
    // back_urls de la web en silencio y el síntoma («después de pagar, la app no
    // vuelve») quedaría lejísimos de la causa. La web no manda `origen`.
    if (origen !== undefined && origen !== 'app') {
      return json({ error: 'origen_invalido', detail: "origen debe ser 'app' u omitirse" }, 400);
    }
    const desdeApp = origen === 'app';

    // Info del evento
    const { data: evento, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', evento_id)
      .single();

    if (error || !evento) {
      return json({ error: 'evento_no_encontrado', evento_id }, 404);
    }

    // Spec W-253. Ticket especial (pack NxN): se lee antes de hablar con MP porque su monto
    // y su multiplicador definen el ítem. Todos los errores de abajo se repiten en
    // `_reservar_ticket_shared`, que es la guarda real; esto solo evita crear una
    // preferencia de MP que la reserva después rechazaría.
    let especial: { id: string; nombre: string; multiplicador: number; monto: number } | null = null;
    if (especialId !== undefined && especialId !== null) {
      if (typeof especialId !== 'string') {
        return json({ error: 'especial_invalido', detail: 'especialId debe ser un uuid' }, 409);
      }
      const { data: esp } = await supabase
        .from('event_tickets_especiales')
        .select('id, event_id, nombre, multiplicador, monto, activa')
        .eq('id', especialId)
        .maybeSingle();
      // Un uuid mal formado hace fallar la consulta (esp = null): también es inválido.
      if (!esp || esp.event_id !== evento_id) {
        return json({ error: 'especial_invalido', especial_id: especialId }, 409);
      }
      if (!esp.activa) {
        return json({ error: 'especial_cerrado', especial_id: especialId }, 409);
      }
      // El tope por compra se mide en entradas, no en packs.
      const entradas = cantidad * esp.multiplicador;
      if (entradas > MAX_CANTIDAD_POR_COMPRA) {
        return json({
          error: 'cantidad_invalida',
          detail: `${entradas} entradas superan el tope de ${MAX_CANTIDAD_POR_COMPRA} por compra`,
        }, 400);
      }
      especial = esp;
    }

    // Spec W-259 (sonopolisWeb). Antes de reservar: un 409 acá no deja ticket ni cupo tomado.
    const destinatarios = normalizarDestinatarios(destinatariosBody);
    if (destinatarios === 'invalido' ||
        (destinatarios && !destinatariosValidos(destinatarios, especial ? cantidad * especial.multiplicador : null))) {
      return json({ error: 'destinatarios_invalidos' }, 409);
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

    // Spec 105, Decisión 6. Mercado Pago activo para el país (`pasarelas_cobro`,
    // spec 104). Sin esto, el día que un país cobre solo con Flow, la app nativa
    // (que siempre llama acá) crearía una preferencia que después la reserva rechaza.
    const { data: pasarelaMP } = await supabase
      .from('pasarelas_cobro')
      .select('pasarela')
      .eq('pais', evento.pais)
      .eq('pasarela', 'mercadopago')
      .eq('activo', true)
      .maybeSingle();

    if (!pasarelaMP) {
      return json({ error: 'pasarela_inactiva', pais: evento.pais, pasarela: 'mercadopago' }, 409);
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

    // Spec 117. Página puente HTTPS de la web (W-245) que reabre la app: MP no
    // acepta `appall://` como back_url con auto_return activo. `compra` y no
    // `status` porque MP agrega su propio `status` al volver.
    const volverApp = `${APP_WEB_URL}/app/volver`;

    // Crear preferencia en MP
    const preference = {
      items: [{
        id: evento.id,
        // Spec W-253: con un pack, quantity son packs y unit_price el monto del pack.
        title: especial
          ? `${evento.artist_name} - ${evento.venue_name} · ${especial.nombre} (${especial.multiplicador}x1)`
          : `Entrada: ${evento.artist_name} - ${evento.venue_name}`,
        quantity: cantidad,
        unit_price: especial ? especial.monto : cotizacion.monto,
        currency_id: cotizacion.moneda,
      }],
      payer: { email: user.email },
      back_urls: desdeApp
        ? {
          success: `${volverApp}?compra=success&ref=${ticketRef}`,
          failure: `${volverApp}?compra=failure&ref=${ticketRef}`,
          pending: `${volverApp}?compra=pending&ref=${ticketRef}`,
        }
        : {
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
        // Spec 105: explícito, en vez de depender del DEFAULT del spec 104.
        p_pasarela: 'mercadopago',
        // Spec W-253: solo se manda con un pack. Sin él la llamada queda idéntica a la de
        // antes, así que el deploy no depende de que la migración ya esté aplicada.
        ...(especial ? { p_especial_id: especial.id } : {}),
      })
      .single();

    if (ticketError) {
      const msg = ticketError.message ?? '';
      const sinCupo = msg.includes('sin_cupo');
      const paisSinCobro = msg.includes('pais_sin_cobro');
      // Spec W-253: los códigos del ticket especial viajan tal cual a la web.
      const codigoEspecial = ['especial_invalido', 'especial_cerrado', 'especial_agotado']
        .find((c) => msg.includes(c));
      const cantidadInvalida = msg.includes('cantidad_invalida');
      console.error('reservar_ticket_pending falló:', ticketError);
      const codigo = sinCupo ? 'sin_cupo' : paisSinCobro ? 'pais_sin_cobro'
        : codigoEspecial ?? (cantidadInvalida ? 'cantidad_invalida' : null);
      return json({
        error: codigo ?? 'ticket_insert_failed',
        detail: ticketError.message,
      }, !codigo ? 500 : cantidadInvalida && !codigoEspecial ? 400 : 409);
    }

    // Spec W-259 (sonopolisWeb). Los correos de las entradas extra se guardan aparte de la
    // reserva para no cambiar la firma de `_reservar_ticket_shared` (ver el spec). Cliente
    // solo con service role: `supabase` lleva el JWT del comprador y `tickets` no tiene
    // policy de UPDATE, así que con él el UPDATE no tocaría ninguna fila, sin error.
    if (destinatarios) {
      // `.single()` sin tipo deja `ticket` como unknown; acá solo hace falta el id.
      const ticketId = (ticket as { id: string }).id;
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: guardado, error: destErr } = await admin
        .from('tickets')
        .update({ destinatarios_extra: destinatarios })
        .eq('id', ticketId)
        .select('id')
        .maybeSingle();
      if (destErr || !guardado) {
        // Sin la lista no se reserva: el cupo del pack se devuelve en el acto.
        // La preferencia de MP queda viva, pero sin ticket pendiente webhook-mp no emite nada:
        // el mismo caso que un ticket vencido (spec 088).
        console.error('No se pudieron guardar los destinatarios del ticket', ticketId, destErr);
        const { error: cancelErr } = await admin
          .from('tickets')
          .update({ status: 'cancelled' })
          .eq('id', ticketId)
          .eq('status', 'pending');
        if (cancelErr) {
          console.error('No se pudo cancelar el ticket tras fallar los destinatarios:', ticketId, cancelErr);
        }
        return json({ error: 'destinatarios_no_guardados', detail: destErr?.message }, 500);
      }
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
      // Spec 117. La app lo usa para reconocer su propio retorno (spec 118).
      ticket_ref: ticketRef,
    }, 200);
  } catch (err) {
    console.error('create-preference error:', err);
    return json({ error: 'internal', detail: String(err) }, 500);
  }
});