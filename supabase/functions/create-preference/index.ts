import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY')!;

serve(async (req) => {
  try {
    const { evento_id, user_id, cantidad } = await req.json();

    // Validar usuario
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== user_id) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Info del evento
    const { data: evento, error } = await supabase
      .from('events')
      .select('*, venues(*)')
      .eq('id', evento_id)
      .single();

    if (error || !evento) {
      return new Response('Evento no encontrado', { status: 404 });
    }

    // Crear preferencia en MP
    const preference = {
      items: [{
        id: evento.id,
        title: `Entrada: ${evento.nombre} - ${evento.venues?.nombre || ''}`,
        quantity: cantidad,
        unit_price: evento.monto,
        currency_id: 'CLP',
      }],
      payer: { email: user.email },
      back_urls: {
        success: 'appall://confirmacion?status=success',
        failure: 'appall://confirmacion?status=failure',
        pending: 'appall://confirmacion?status=pending',
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
      console.error('MP API error:', errorText);
      return new Response('Error al crear preferencia en MP', { status: 502 });
    }

    const mpData = await mpRes.json();

    // Guardar ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        evento_id,
        user_id,
        status: 'pending',
        preference_id: mpData.id,
        monto: evento.monto * cantidad,
        cantidad,
      })
      .select()
      .single();

    if (ticketError) {
      console.error('Ticket insert error:', ticketError);
      return new Response('Error al crear ticket', { status: 500 });
    }

    return new Response(
      JSON.stringify({
        preference_id: mpData.id,
        init_point: mpData.init_point,
        sandbox_init_point: mpData.sandbox_init_point,
        ticket_id: ticket.id,
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err) {
    console.error('create-preference error:', err);
    return new Response('Internal error', { status: 500 });
  }
});