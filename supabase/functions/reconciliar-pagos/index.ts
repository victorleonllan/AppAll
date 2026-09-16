import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Spec 072 (4-sep-2026). Red de seguridad de la confirmación de pagos.
//
// Hasta acá, un ticket sólo pasaba a `completed` si el comprador dejaba abierta
// la pestaña de /compra/confirmacion mientras su polling llamaba a
// `confirm-payment` (spec 070) — `webhook-mp` no confirma nada desde que la
// firma x-signature dejó de coincidir. Si cerraba la pestaña, nadie volvía a
// preguntarle a Mercado Pago nunca más: pago cobrado, ticket `pending` para
// siempre. En sandbox es un ticket colgado; con dinero real es una entrada no
// entregada.
//
// Esta function barre los `pending` recientes y los confirma. NO reimplementa
// la confirmación: llama a `confirm-payment`, que ya está verificada contra un
// pago real. Un solo lugar donde la lógica puede estar mal.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-admin-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// Ventana por defecto. 7 días cubre de sobra un pago que MP haya aprobado
// tarde; más atrás no vale la pena: si un ticket lleva una semana `pending`,
// o no se pagó nunca o hay que mirarlo a mano.
const DIAS_POR_DEFECTO = 7;

// Tope de tickets por corrida. Cada uno es una llamada a la API de MP; sin
// esto, una corrida sobre una base grande se va de tiempo y muere a la mitad
// sin dejar registro de dónde quedó.
const MAX_POR_CORRIDA = 200;

// Spec 088. Holgura antes de cancelar una reserva que nadie pagó. Es cuatro
// veces el TTL de 30 min con el que el aforo deja de contarla (`ticket_reserva_ttl()`)
// y esa diferencia es deliberada: vencer el cupo es reversible — si el pago
// aparece igual, `confirm-payment` lo completa y la entrada vuelve a su lugar —
// pero cancelar la fila no se deshace desde este cron. El plazo corto es para
// liberar cupo; el largo, para escribir en la fila.
const HOLGURA_CANCELAR_HORAS = 2;

// Comparación en tiempo constante — mismo criterio que webhook-mp (spec 022):
// con === , el tiempo de respuesta filtra cuántos caracteres acertó quien
// prueba claves.
function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // Sin esto la ruta queda pública y cualquiera puede disparar cientos de
  // llamadas a la API de MP a nuestro costo. Se reusa el service role key en
  // vez de inventar un secreto nuevo: quien llama (el cron de Vercel) ya lo
  // tiene en su entorno, y una pieza menos es una pieza menos que se
  // desincroniza.
  const clave = req.headers.get('x-admin-key') ?? '';
  if (!igualesEnTiempoConstante(clave, SUPABASE_SERVICE_ROLE_KEY)) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dias = Number.isInteger(body?.dias) && body.dias > 0 ? body.dias : DIAS_POR_DEFECTO;
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: pendientes, error } = await supabase
      .from('tickets')
      .select('id, created_at')
      .eq('status', 'pending')
      .gte('created_at', desde)
      .order('created_at', { ascending: true })
      .limit(MAX_POR_CORRIDA);

    if (error) {
      console.error('reconciliar-pagos: no se pudieron leer los pendientes', error);
      return json({ error: 'query_fallida', detail: error.message }, 500);
    }

    const resumen = {
      ventana_dias: dias,
      revisados: pendientes?.length ?? 0,
      confirmados: 0,
      sin_cambio: 0,
      cancelados: 0,
      errores: [] as string[],
    };

    const limiteCancelar = Date.now() - HOLGURA_CANCELAR_HORAS * 60 * 60 * 1000;

    for (const ticket of pendientes ?? []) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/confirm-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ ticket_id: ticket.id }),
        });

        const data = await res.json().catch(() => null);

        // `confirm-payment` devuelve el estado en el que quedó el ticket. Todo
        // lo que no siga `pending` es un ticket que esta corrida destrabó.
        if (res.ok && data?.status && data.status !== 'pending') {
          resumen.confirmados += 1;
          console.log(`reconciliar-pagos: ticket ${ticket.id} → ${data.status}`);
        } else if (res.ok) {
          // Spec 088. El orden importa: primero se pregunta, después se
          // cancela. Cancelar sin preguntar es cómo se borra una entrada que el
          // comprador sí pagó.
          //
          // Y no alcanza con "sigue pending": `confirm-payment` devuelve pending
          // en tres casos distintos y sólo uno autoriza a cancelar.
          //   · sin_pago_encontrado_aun  → MP no tiene ningún pago con nuestro
          //     ticket_ref. Nadie pagó: se cancela.
          //   · mpStatus in_process / authorized → hay un pago vivo que MP aún
          //     no resolvió. Cancelar acá es quitarle la entrada a alguien que
          //     la está pagando.
          //   · guest_no_soportado_aun → el guest checkout ni siquiera se pudo
          //     consultar. No sabemos, así que no se toca.
          const nadiePago = data?.detail === 'sin_pago_encontrado_aun';
          if (nadiePago && new Date(ticket.created_at).getTime() < limiteCancelar) {
            const { error: errCancelar } = await supabase
              .from('tickets')
              .update({ status: 'cancelled' })
              .eq('id', ticket.id)
              // La condición se repite en el UPDATE y no sólo en el SELECT de
              // arriba: entre una cosa y la otra pasó una llamada a MP, y si el
              // webhook lo completó mientras tanto, esta escritura no debe pisarlo.
              .eq('status', 'pending');
            if (errCancelar) {
              resumen.errores.push(`${ticket.id}: cancelar falló — ${errCancelar.message}`);
            } else {
              resumen.cancelados += 1;
              console.log(`reconciliar-pagos: ticket ${ticket.id} → cancelled (reserva vencida)`);
            }
          } else {
            resumen.sin_cambio += 1;
          }
        } else {
          resumen.errores.push(`${ticket.id}: HTTP ${res.status}`);
        }
      } catch (err) {
        // Un ticket que falla no corta la corrida: los demás siguen. El error
        // viaja en el resumen para que quede en los logs del cron.
        resumen.errores.push(`${ticket.id}: ${String(err)}`);
      }
    }

    console.log('reconciliar-pagos: resumen', resumen);
    return json(resumen, resumen.errores.length > 0 ? 207 : 200);
  } catch (err) {
    console.error('reconciliar-pagos error:', err);
    return json({ error: 'internal', detail: String(err) }, 500);
  }
});
