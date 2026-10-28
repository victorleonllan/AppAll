import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cuentaMP } from '../_shared/cuentasMP.ts';

// Spec 162. La cuenta dueña de un local o banda cancela su suscripción a
// Sonópolis Pro desde su panel. El token de Mercado Pago vive en los secretos de
// Supabase, por eso es una Edge Function y no una API route de la web.
//
// Orden: primero Mercado Pago, después la base. Si MP no canceló, va a seguir
// cobrando, así que la base no se toca. Si MP canceló y la base falla, el webhook
// (`subscription_preapproval` → cancelada) reintenta el mismo cierre.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Los mismos CORS que crear-suscripcion-pro: el panel de la web llama desde otro origen.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const SIN_ACTIVA = 'No tienes una suscripción activa';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { tenant_type, tenant_id } = await req.json();

    // 1. El permiso lo decide Postgres: pro_mi_suscripcion (spec 161) devuelve cero
    // filas a quien no es la cuenta dueña.
    const usuario = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: filas, error: errMia } = await usuario.rpc('pro_mi_suscripcion', {
      p_tenant_type: tenant_type,
      p_tenant_id: tenant_id,
    });
    if (errMia) {
      return json({ error: errMia.message }, 400);
    }
    const mia = filas?.[0];
    if (!mia) {
      return json({ error: 'Solo la cuenta de este local o banda puede cancelar su suscripción' }, 403);
    }
    if (mia.estado !== 'activa' && mia.estado !== 'pausada') {
      return json({ error: SIN_ACTIVA }, 409);
    }

    // 2. El id de la suscripción en MP solo lo lee el servidor.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: sus, error: errSus } = await admin
      .from('pro_suscripciones')
      .select('mp_preapproval_id, pais')
      .eq('id', mia.suscripcion_id)
      .single();
    if (errSus) {
      console.error('no se pudo leer la suscripción', mia.suscripcion_id, errSus);
      return json({ error: 'No se pudo leer tu suscripción' }, 500);
    }
    if (!sus.mp_preapproval_id) {
      return json({ error: SIN_ACTIVA }, 409);
    }

    // 3. Cancelar en MP. La referencia escribe `canceled` con una L (addenda del spec).
    const cuenta = cuentaMP(sus.pais);
    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${sus.mp_preapproval_id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${cuenta.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'canceled' }),
    });
    if (!mpRes.ok) {
      console.error('MP no canceló', sus.mp_preapproval_id, mpRes.status, await mpRes.text());
      return json({ error: 'Mercado Pago no respondió, intenta de nuevo' }, 502);
    }

    // 4. Cerrar en la base: estado cancelada y Pro hasta el fin del mes pagado.
    const { data: hasta, error: errCerrar } = await admin.rpc('pro_cerrar_suscripcion', {
      p_suscripcion_id: mia.suscripcion_id,
    });
    if (errCerrar) {
      console.error('MP canceló pero pro_cerrar_suscripcion falló', mia.suscripcion_id, errCerrar);
      return json({ error: 'Se canceló en Mercado Pago, pero no se pudo actualizar tu panel. Recarga en unos minutos.' }, 500);
    }

    return json({ pro_hasta: hasta }, 200);
  } catch (err) {
    console.error('cancelar-suscripcion-pro falló', err);
    return json({ error: 'No se pudo cancelar la suscripción' }, 500);
  }
});
