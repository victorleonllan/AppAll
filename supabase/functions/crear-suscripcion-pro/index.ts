import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cuentaMP } from '../_shared/cuentasMP.ts';

// Spec 109 (con la addenda del 110). El admin genera un código de Sonópolis Pro
// para un tenant: esta función lo convierte en un plan mensual de Mercado Pago
// (`preapproval_plan`) y guarda su link de pago.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Misma env var que create-preference: MP valida que back_url sea HTTPS.
const APP_WEB_URL = Deno.env.get('APP_WEB_URL') ?? 'https://sonopolis.org';

// Los mismos CORS que create-preference: el panel de admin de la web llama desde
// otro origen.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Lo que devuelve admin_crear_codigo_pro (spec 110).
interface CodigoPro {
  id: string;
  codigo: string;
  pais: string;
  moneda: string;
  nombre: string;
  correo_cuenta: string;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Un código sin plan no puede quedar `esperando`: la página pública mostraría
  // un botón que no lleva a ningún lado.
  const anular = async (id: string) => {
    const { error } = await admin
      .from('pro_suscripciones')
      .update({ estado: 'anulado' })
      .eq('id', id);
    if (error) console.error('no se pudo anular el código', id, error);
  };

  // Id del código creado y todavía sin plan guardado: si algo lanza en el medio
  // (red caída hacia MP, JSON roto), el catch lo anula.
  let sinPlan: string | null = null;

  try {
    const { tenant_type, tenant_id, monto } = await req.json();

    // 1. El permiso lo decide Postgres (spec 110, `admin_crear_codigo_pro`), no
    // esta función: el RPC corre con la sesión del que llama y rechaza a quien no
    // es admin, al tenant sin cuenta y al país que no cobra.
    const usuario = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });

    const { data: codigo, error: rpcError } = await usuario
      .rpc('admin_crear_codigo_pro', {
        p_tenant_type: tenant_type,
        p_tenant_id: tenant_id,
        p_monto: monto,
      })
      .single<CodigoPro>();

    if (rpcError || !codigo) {
      const mensaje = rpcError?.message ?? 'admin_crear_codigo_pro no devolvió el código';
      const noEsAdmin = mensaje.includes('solo el admin');
      return json({ error: mensaje }, noEsAdmin ? 403 : 400);
    }
    sinPlan = codigo.id;

    // 2. Una cuenta de Mercado Pago por país (spec 101). `throw` si faltan los
    // secrets: nunca crear el plan con la cuenta de otro país.
    let cuenta;
    try {
      cuenta = cuentaMP(codigo.pais);
    } catch (err) {
      console.error('cuentaMP falló:', err);
      await anular(codigo.id);
      return json({ error: 'cuenta_mp_no_configurada', pais: codigo.pais }, 409);
    }

    // 3. Sin `free_trial`: el primer cobro es el día que se suscribe.
    const plan = {
      reason: `Sonópolis Pro — ${codigo.nombre}`,
      external_reference: codigo.codigo,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: Number(monto),
        currency_id: codigo.moneda,
      },
      back_url: `${APP_WEB_URL}/pro/${codigo.codigo}/listo`,
    };

    const mpRes = await fetch('https://api.mercadopago.com/preapproval_plan', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cuenta.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(plan),
    });

    if (!mpRes.ok) {
      const detalle = await mpRes.text();
      console.error('MP preapproval_plan error:', mpRes.status, detalle);
      await anular(codigo.id);
      return json({ error: 'mp_plan_failed', status: mpRes.status, detail: detalle }, 502);
    }

    const mpPlan = await mpRes.json();

    // 4. Con service_role: las policies de pro_suscripciones no dejan escribir a
    // nadie, ni al admin.
    const { error: updError } = await admin
      .from('pro_suscripciones')
      .update({ mp_plan_id: mpPlan.id, init_point: mpPlan.init_point })
      .eq('id', codigo.id);

    if (updError) {
      // El plan existe en MP pero la base no lo sabe: sin mp_plan_id el webhook no
      // puede atar sus cobros a este código, así que se anula igual que un error de MP.
      console.error('no se pudo guardar el plan', mpPlan.id, 'en', codigo.id, updError);
      await anular(codigo.id);
      return json({ error: 'plan_no_guardado', detail: updError.message }, 500);
    }

    sinPlan = null;

    // 5. `init_point` vuelve solo al admin, para verificar. A la cuenta dueña se lo
    // entrega `pro_link_de_pago` (spec 110), nunca la página pública.
    return json({
      codigo: codigo.codigo,
      url: `${APP_WEB_URL}/pro/${codigo.codigo}`,
      init_point: mpPlan.init_point,
      correo_cuenta: codigo.correo_cuenta,
    }, 200);
  } catch (err) {
    console.error('crear-suscripcion-pro error:', err);
    if (sinPlan) await anular(sinPlan);
    return json({ error: 'internal', detail: String(err) }, 500);
  }
});
