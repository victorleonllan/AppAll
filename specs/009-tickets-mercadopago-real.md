# Spec 009: Tickets + Mercado Pago Checkout Pro real

> **Actualización:** 21 Jun 2026 — Cambio de gateway. Antes: Transbank Webpay. Ahora: **Mercado Pago (Checkout Pro)**.

## Objetivo

Conectar el flujo de compra de entradas de AppAll con **Mercado Pago Checkout Pro real**. Esto incluye:

1. Crear la tabla `tickets` en Supabase (SQL migration)
2. Edge Function `create-preference` que genera una preferencia de pago en MP
3. Conectar el frontend (`DetalleEventoScreen`) para abrir Checkout Pro
4. Webhook IPN para recibir notificaciones de pago
5. Actualizar estado del ticket (pending → completed / refunded)

---

## Dependencias

- ✅ Spec 006 — Tipos `Evento`, `Venue` completados
- ✅ Spec 007 — `EventosContext` con Supabase
- ✅ Spec 008 — `DetalleEventoScreen`, `ConfirmacionCompraScreen`, `CarteleraStack`, flujo mock de tickets, scheme `appall://`
- ✅ App **JamCafé** creada en Mercado Pago Developers (Checkout Pro) — ambiente de prueba
- ✅ Access Token MP: `APP_USR-7224677760508968-062101-daa37436dde426359c4b1ec539784a43-3486811969`
- ✅ Public Key MP: `APP_USR-e068928a-c35e-4d95-91cb-b25697ef579e`
- 🔲 **MCP Server de MP configurado** en `~/.hermes/config.yaml` (requiere reinicio de Hermes)

---

## Arquitectura del flujo de pago

```
Usuario toca "Comprar entrada" en DetalleEventoScreen
       │
       ▼
App llama a Edge Function: POST /create-preference
  - Body: { evento_id, user_id, cantidad }
  - Edge Function usa Access Token MP para crear preferencia
       │
       ▼
Edge Function devuelve: { preference_id, init_point (URL de MP) }
       │
       ▼
App abre Checkout Pro URL en WebView / navegador externo
       │
       ▼
Usuario paga en Mercado Pago (tarjeta, transferencia, etc.)
       │
       ▼
MP redirige a: appall://confirmacion?status=success|failure|pending
       │
       ▼
ConfirmacionCompraScreen muestra resultado
       │
       ▼
MP envía IPN (webhook) a Edge Function /webhook
  - Edge Function actualiza status del ticket en Supabase
  - Si falla, app verifica status manualmente
```

---

## Fase 0 — SQL migration: tabla `tickets`

Crear en Supabase > SQL Editor. **Elegir "Run and enable RLS"** cuando salga el modal.

```sql
-- Tabla tickets con orientación a Mercado Pago
CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  evento_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'refunded', 'cancelled')),
  preference_id TEXT NOT NULL DEFAULT '',
  payment_id TEXT,
  monto INTEGER NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "tickets_select_own" ON tickets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "tickets_select_event_owner" ON tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = tickets.evento_id
      AND events.created_by = auth.uid()
    )
  );

CREATE POLICY "tickets_insert" ON tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tickets_update_own" ON tickets FOR UPDATE
  USING (auth.uid() = user_id);

-- Actualizar events: agregar columna monto (entrada)
ALTER TABLE events ADD COLUMN IF NOT EXISTS monto INTEGER DEFAULT 0;
```

---

## Fase 1 — Edge Function: `create-preference`

Crear archivo: `supabase/functions/create-preference/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY')!;

serve(async (req) => {
  try {
    const { evento_id, user_id, cantidad } = await req.json();

    // Validar usuario autenticado
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== user_id) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Obtener info del evento
    const { data: evento, error } = await supabase
      .from('events')
      .select('*, venues(*)')
      .eq('id', evento_id)
      .single();

    if (error || !evento) {
      return new Response('Evento no encontrado', { status: 404 });
    }

    // Crear preferencia en Mercado Pago
    const preference = {
      items: [{
        id: evento.id,
        title: `Entrada: ${evento.nombre} - ${evento.venues?.nombre || ''}`,
        quantity: cantidad,
        unit_price: evento.monto,
        currency_id: 'CLP',
      }],
      payer: {
        email: user.email,
      },
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

    // Insertar ticket en Supabase
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

    // Devolver URLs al frontend
    return new Response(
      JSON.stringify({
        preference_id: mpData.id,
        init_point: mpData.init_point,
        sandbox_init_point: mpData.sandbox_init_point,
        ticket_id: ticket.id,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (err) {
    console.error('create-preference error:', err);
    return new Response('Internal error', { status: 500 });
  }
});
```

---

## Fase 2 — Edge Function: `webhook-mp` (IPN)

Crear archivo: `supabase/functions/webhook-mp/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MERCADOPAGO_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY')!;

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // IPN de MP: puede llegar como query param o POST body
    const url = new URL(req.url);
    const topic = url.searchParams.get('topic') || url.searchParams.get('type');
    const id = url.searchParams.get('id');

    if (topic === 'merchant_order' && id) {
      // Obtener la merchant_order para verificar el pago
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
        // Extraer external_reference = evento_id|user_id
        const externalRef = order.external_reference;
        const [evento_id, user_id] = externalRef.split('|');

        // Actualizar ticket a completed
        await supabase
          .from('tickets')
          .update({ status: 'completed', payment_id: id })
          .eq('preference_id', order.preference_id);
      }
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('webhook error:', err);
    return new Response('OK', { status: 200 }); // Siempre responder 200 a MP
  }
});
```

---

## Fase 3 — Frontend: conectar DetalleEventoScreen a MP real

Modificar `src/screens/DetalleEventoScreen.tsx`:

### 3.1 — Agregar botón "Comprar entrada"

El botón ya existe (Spec 008). Cambiar su lógica: en lugar de mock, llamar a la Edge Function.

```typescript
const handleComprarEntrada = async () => {
  if (!user) {
    navigation.navigate('Auth');
    return;
  }

  setLoading(true);
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/create-preference`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          evento_id: evento.id,
          user_id: user.id,
          cantidad: cantidadSeleccionada || 1,
        }),
      }
    );

    if (!res.ok) throw new Error('Error al crear preferencia');

    const data = await res.json();

    // Abrir Checkout Pro en WebView o redirigir
    const checkoutUrl = data.sandbox_init_point || data.init_point;

    if (Platform.OS === 'web') {
      // En web: abrir en nueva pestaña
      window.open(checkoutUrl, '_blank');
    } else {
      // En Android: abrir en WebView o navegador
      Linking.openURL(checkoutUrl);
    }

    // Navegar a confirmación
    navigation.navigate('ConfirmacionCompra', {
      status: 'pending',
      preference_id: data.preference_id,
      ticket_id: data.ticket_id,
    });
  } catch (err) {
    console.error('Error al comprar:', err);
    Alert.alert('Error', 'No se pudo procesar la compra');
  } finally {
    setLoading(false);
  }
};
```

### 3.2 — Verificar status del ticket en ConfirmacionCompraScreen

Cuando la app regresa de Checkout Pro (vía deep link `appall://confirmacion`), verificar el estado real del ticket en Supabase:

```typescript
useEffect(() => {
  const checkTicketStatus = async () => {
    if (!ticketId) return;

    const { data, error } = await supabase
      .from('tickets')
      .select('status')
      .eq('id', ticketId)
      .single();

    if (data) {
      setActualStatus(data.status);
    }
  };

  // Si status es "pending", esperar un momento y verificar
  if (route.params?.status === 'pending') {
    const interval = setInterval(async () => {
      await checkTicketStatus();
    }, 3000); // cada 3 segundos

    setTimeout(() => clearInterval(interval), 30000); // max 30 seg
    return () => clearInterval(interval);
  } else {
    checkTicketStatus();
  }
}, [ticketId]);
```

---

## Fase 4 — Configurar Edge Functions en Supabase

### 4.1 — Instalar Supabase CLI en el Mac

```bash
# En el Mac de Victor
npm install -g supabase

cd ~/projects/AppAll

# Inicializar configuración de Edge Functions
supabase init
supabase functions new create-preference
supabase functions new webhook-mp
```

Luego copiar el código de Fase 1 y Fase 2 en los archivos generados.

### 4.2 — Configurar secrets de Edge Functions

```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN="APP_USR-7224677760508968-062101-daa37436dde426359c4b1ec539784a43-3486811969"
supabase secrets set SUPABASE_URL="https://xluinfihjjtxkglihxqz.supabase.co"
supabase secrets set SUPABASE_SERVICE_KEY="<la_service_role_key_de_Supabase>"
```

### 4.3 — Deploy

```bash
supabase functions deploy create-preference
supabase functions deploy webhook-mp
```

---

## Fase 5 — Configurar el Webhook (IPN) en Mercado Pago

En https://www.mercadopago.com.uy/developers/ → app JamCafé → Webhooks:

1. Agregar URL: `https://xluinfihjjtxkglihxqz.supabase.co/functions/v1/webhook-mp`
2. Seleccionar eventos: `merchant_order` (pagos)
3. Guardar

---

## Criterios de aceptación

- [ ] **Tabla `tickets` creada** en Supabase con RLS + políticas activas
- [ ] **Edge Function `create-preference`** — deployada y responde 200 con `preference_id` + `init_point`
- [ ] **Edge Function `webhook-mp`** — deployada, responde 200, actualiza `tickets.status` a "completed"
- [ ] **Frontend** — `DetalleEventoScreen` abre Checkout Pro real al comprar
- [ ] **ConfirmacionCompraScreen** — verifica status real del ticket después del pago
- [ ] **App no se cuelga** si MP está caído (timeout + error UI)
- [ ] **Deep link** `appall://confirmacion?status=...` funciona correctamente
- [ ] **Probar flujo completo** con credenciales de prueba de Mercado Pago (tarjetas de prueba: 5031 7557 3453 0604, CVV 123, exp cualquier fecha futura)

---

## Posibles mejoras post-beta

- Guardar email del comprador en ticket (para envío de entrada digital)
- WebSocket para actualizar status en tiempo real
- Soporte para Oneclick (pago guardado)
- Reembolso desde dashboard músico
- Timbrar entrada con código QR