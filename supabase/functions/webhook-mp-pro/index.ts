import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cuentaMP } from '../_shared/cuentasMP.ts';
import { firmaValida } from '../_shared/firmaMP.ts';

// Spec 109. Avisos de las suscripciones a Sonópolis Pro.
//
// Función aparte y no una rama de webhook-mp: los planes no aceptan
// `notification_url`, así que estos avisos llegan a la URL del panel de la
// aplicación de Mercado Pago, que apunta acá solo los tópicos de suscripción. Los
// pagos de entradas siguen llegando a webhook-mp por la `notification_url` de
// cada preferencia.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Estado de la suscripción en MP → pro_suscripciones.estado. `pending` no está:
// alguien abrió el checkout y no terminó, no cambia nada. La referencia de MP
// escribe `canceled` (una L); el spec decía `cancelled` y se aceptan las dos.
const ESTADO_SUSCRIPCION: Record<string, 'activa' | 'pausada' | 'cancelada'> = {
  authorized: 'activa',
  paused: 'pausada',
  canceled: 'cancelada',
  cancelled: 'cancelada',
};

async function mpGet(path: string, token: string) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`MP ${path} → ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

const ok = () => new Response('OK', { status: 200 });

serve(async (req) => {
  const url = new URL(req.url);

  // Mismo criterio que webhook-mp (spec 101): `?cuenta=` elige QUÉ secreto se
  // exige, nunca SI se exige. Un país desconocido también cae a 401.
  const paisCuenta = url.searchParams.get('cuenta') ?? 'CL';
  let cuenta;
  try {
    cuenta = cuentaMP(paisCuenta);
  } catch (err) {
    console.error('cuentaMP falló en webhook-mp-pro:', err);
    return new Response('Invalid signature', { status: 401 });
  }

  // 401 y no 500: una firma inválida no es un error transitorio, MP no reintenta.
  if (!(await firmaValida(req, url, cuenta.webhookSecret))) {
    console.error('Firma x-signature inválida, notificación rechazada', { url: req.url });
    return new Response('Invalid signature', { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Igual que webhook-mp: el tópico puede venir en el query (?topic=&id=) o en
    // el cuerpo { type, data: { id } }; el cuerpo gana.
    let topic = url.searchParams.get('topic') ?? url.searchParams.get('type');
    let id = url.searchParams.get('id') ?? url.searchParams.get('data.id');

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      if (body) {
        topic = body.type ?? body.topic ?? topic;
        id = body.data?.id?.toString() ?? body.id?.toString() ?? id;
      }
    }

    if (!topic || !id) {
      console.log('Notificación sin topic/id, se ignora');
      return ok();
    }

    if (topic === 'subscription_preapproval') {
      const suscripcion = await mpGet(`/preapproval/${id}`, cuenta.token);
      const planId: string | undefined = suscripcion.preapproval_plan_id;
      const nuevoEstado = ESTADO_SUSCRIPCION[suscripcion.status];

      if (!nuevoEstado) {
        console.log(`Suscripción ${id} en estado "${suscripcion.status}", no cambia nada`);
        return ok();
      }
      if (!planId) {
        console.log(`Suscripción ${id} sin plan: no es de Pro`);
        return ok();
      }

      const { data, error } = await supabase
        .from('pro_suscripciones')
        .update({ estado: nuevoEstado, mp_preapproval_id: suscripcion.id?.toString() ?? id })
        .eq('mp_plan_id', planId)
        .select('id');

      if (error) {
        console.error('Error actualizando pro_suscripciones:', error);
        return new Response('DB update failed', { status: 500 });
      }
      if (!data?.length) {
        // Puede ser una suscripción a otro plan de la misma cuenta de MP.
        console.log(`Plan ${planId} desconocido, suscripción ${id} ignorada`);
        return ok();
      }

      console.log(`Suscripción ${id} (plan ${planId}) → ${nuevoEstado}`);
      return ok();
    }

    if (topic === 'subscription_authorized_payment') {
      const cobro = await mpGet(`/authorized_payments/${id}`, cuenta.token);

      // Solo el cobro aprobado corre la fecha. Rechazado o en proceso: MP avisa de
      // nuevo cuando el reintento sale.
      if (cobro.payment?.status !== 'approved') {
        console.log(`Cobro ${id} con pago "${cobro.payment?.status}", no se registra`);
        return ok();
      }

      const suscripcion = await mpGet(`/preapproval/${cobro.preapproval_id}`, cuenta.token);
      if (!suscripcion.preapproval_plan_id) {
        console.log(`Cobro ${id} de una suscripción sin plan: no es de Pro`);
        return ok();
      }

      // La referencia no trae fecha de aprobación del cobro: `debit_date` es la
      // fecha en que MP lo cobró (o lo reintentó). Ver addenda del spec.
      const pagadoAt = cobro.debit_date ?? cobro.last_modified ?? new Date().toISOString();

      const { data: hasta, error } = await supabase.rpc('pro_registrar_pago', {
        p_mp_pago_id: cobro.id?.toString() ?? id,
        p_mp_plan_id: suscripcion.preapproval_plan_id,
        p_mp_preapproval_id: cobro.preapproval_id,
        // La referencia muestra `transaction_amount` como string en el ejemplo.
        p_monto: Number(cobro.transaction_amount),
        p_pagado_at: pagadoAt,
      });

      if (error) {
        if (error.message?.includes('suscripcion_desconocida')) {
          // Reintentar no lo arregla: el plan no es de ningún código de Pro.
          console.log(`Cobro ${id}: ${error.message}`);
          return ok();
        }
        console.error('pro_registrar_pago falló', id, error);
        return new Response('pro_registrar_pago failed', { status: 500 });
      }

      console.log(`Cobro ${id} registrado, Pro hasta ${hasta}`);
      return ok();
    }

    console.log('Tópico ignorado:', topic);
    return ok();
  } catch (err) {
    // 500 a propósito, igual que webhook-mp: MP reintenta lo que no devuelve 2xx.
    console.error('webhook-mp-pro error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
