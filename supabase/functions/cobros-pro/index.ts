import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cuentaMP } from '../_shared/cuentasMP.ts';
import { armarCobros, recortarSuscripcionMP, type PagoSonopolis } from './cruce.ts';

// Spec 163. Solo el admin: para un local o banda, sus suscripciones a Pro con cada
// cobro tal como lo ve Mercado Pago (aprobado, rechazado y por qué, devuelto) y si
// Sonópolis lo registró en pro_pagos.
//
// En vivo contra MP y no desde una tabla de avisos: una devolución no dispara ningún
// tópico de «Planes y suscripciones», así que el webhook nunca se entera (incidente
// 30-oct-2026, Quintal). MP es la fuente de verdad del dinero.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Los mismos CORS que crear-suscripcion-pro: sin `x-client-info` el navegador corta
// el preflight y `functions.invoke` falla con «Failed to send a request».
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function mpGet(path: string, token: string) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    // Solo la ruta sin query y el status: el cuerpo de MP puede traer datos del pagador.
    throw new Error(`MP ${path.split('?')[0]} → ${res.status}`);
  }
  return await res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const body = await req.json().catch(() => null);
    const tenantType = body?.tenant_type;
    const tenantId = body?.tenant_id;

    // 1. Permiso: lo decide Postgres con la sesión de quien llama. verify_jwt ya
    // rechazó a quien no trae JWT.
    const usuario = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: esAdmin, error: errAdmin } = await usuario.rpc('es_admin_sonopolis');
    if (errAdmin || esAdmin !== true) {
      return json({ error: 'solo admin' }, 403);
    }

    if ((tenantType !== 'venue' && tenantType !== 'musician') || typeof tenantId !== 'string' || !UUID.test(tenantId)) {
      return json({ error: 'tenant_type o tenant_id inválido' }, 400);
    }

    // 2. Lo que sabe Sonópolis.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: suscripciones, error: errSus } = await admin
      .from('pro_suscripciones')
      .select('id, codigo, estado, monto, moneda, pais, created_at, link_pedido_at, mp_plan_id, mp_preapproval_id')
      .eq('tenant_type', tenantType)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (errSus) {
      console.error('cobros-pro: no se pudo leer pro_suscripciones', errSus);
      return json({ error: 'No se pudieron leer las suscripciones' }, 500);
    }
    if (!suscripciones?.length) {
      return json({ suscripciones: [] }, 200);
    }

    const { data: pagos, error: errPagos } = await admin
      .from('pro_pagos')
      .select('suscripcion_id, mp_pago_id, pagado_at, hasta_despues, monto')
      .in('suscripcion_id', suscripciones.map((s) => s.id))
      .order('pagado_at', { ascending: false });
    if (errPagos) {
      console.error('cobros-pro: no se pudo leer pro_pagos', errPagos);
      return json({ error: 'No se pudieron leer los pagos' }, 500);
    }

    // 3. Lo que sabe Mercado Pago, en paralelo. Un error de MP queda en `mp_error`
    // de esa suscripción; nunca un 5xx.
    const resultado = await Promise.all(
      suscripciones.map(async (s) => {
        const pagosSonopolis: PagoSonopolis[] = (pagos ?? [])
          .filter((p) => p.suscripcion_id === s.id)
          .map((p) => ({
            mp_pago_id: p.mp_pago_id,
            pagado_at: p.pagado_at,
            hasta_despues: p.hasta_despues,
            monto: Number(p.monto),
          }));

        const base = {
          id: s.id,
          codigo: s.codigo,
          estado: s.estado,
          monto: Number(s.monto),
          moneda: s.moneda,
          created_at: s.created_at,
          link_pedido_at: s.link_pedido_at,
          mp_plan_id: s.mp_plan_id,
          mp_preapproval_id: s.mp_preapproval_id,
          pagos_sonopolis: pagosSonopolis,
        };

        if (!s.mp_plan_id) {
          return { ...base, mp_error: null, suscripciones_mp: [], cobros: [] };
        }

        try {
          const { token } = cuentaMP(s.pais);
          const [busquedaPagos, busquedaSus] = await Promise.all([
            mpGet(
              `/v1/payments/search?external_reference=${encodeURIComponent(s.codigo)}&sort=date_created&criteria=desc&limit=20`,
              token,
            ),
            mpGet(`/preapproval/search?preapproval_plan_id=${encodeURIComponent(s.mp_plan_id)}&limit=10`, token),
          ]);
          return {
            ...base,
            mp_error: null,
            suscripciones_mp: (busquedaSus?.results ?? []).map(recortarSuscripcionMP),
            cobros: armarCobros(busquedaPagos?.results ?? [], pagosSonopolis),
          };
        } catch (err) {
          const mensaje = err instanceof Error ? err.message : String(err);
          console.error('cobros-pro: MP falló para', s.codigo, mensaje);
          return { ...base, mp_error: mensaje, suscripciones_mp: [], cobros: [] };
        }
      }),
    );

    return json({ suscripciones: resultado }, 200);
  } catch (err) {
    console.error('cobros-pro error:', err);
    return json({ error: 'Error interno' }, 500);
  }
});
