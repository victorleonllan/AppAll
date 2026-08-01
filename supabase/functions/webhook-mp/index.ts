import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get('topic') || url.searchParams.get('type');
    const id = url.searchParams.get('id');

    if (topic === 'merchant_order' && id) {
      const mpRes = await fetch(
        `https://api.mercadopago.com/merchant_orders/${id}`,
        {
          headers: {
            'Authorization': `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
          },
        }
      );

      if (!mpRes.ok) {
        return new Response('Error fetching merchant order', { status: 502 });
      }

      const order = await mpRes.json();

      if (order.order_status === 'paid') {
        const externalRef = order.external_reference;
        const [evento_id, user_id] = externalRef.split('|');

        await supabase
          .from('tickets')
          .update({ status: 'completed', payment_id: id })
          .eq('preference_id', order.preference_id);
      }
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('webhook error:', err);
    return new Response('OK', { status: 200 });
  }
});