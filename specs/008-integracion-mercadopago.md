# Spec 008: Detalle de evento + compra de entradas — Estructura para Mercado Pago

## Objetivo

Crear la estructura completa en frontend para la compra de entradas con Mercado Pago: pantalla de detalle de evento, flujo de compra con tickets, y pantalla de confirmación. Dejar el código listo para conectar con Mercado Pago Checkout Pro.

---

## Dependencias

- Spec 006 (tipos `Evento`, `Venue`) ✅
- Spec 007 (EventosContext funcional con Supabase) ✅
- Requiere SQL migration para tabla `tickets` (ver Fase 0)

---

## Estado: ✅ Código listo — Pendiente conexión MP real

| Fase | Estado |
|------|--------|
| 0 — SQL migration (tabla tickets) | ⏳ Pendiente |
| 1 — Tipos y modelo de datos | ✅ Completado |
| 2 — Mock data actualizada | ✅ Completado |
| 3 — EventosContext con tickets | ✅ Completado |
| 4 — CarteleraStack (navegación) | ✅ Completado |
| 5 — DetalleEventoScreen | ✅ Completado |
| 6 — ConfirmacionCompraScreen | ✅ Completado |
| 7 — TarjetaEvento touchable | ✅ Completado |
| 8 — CarteleraScreen con navegación | ✅ Completado |
| 9 — Config deep links (scheme) | ✅ Completado |
| 10 — Conexión Mercado Pago real | ⏳ Pendiente |
| 11 — Edge Functions Supabase | ⏳ Pendiente |

---

## Fase 0: SQL Migration (ejecutar en Supabase SQL Editor)

```sql
-- TABLA: tickets (entradas compradas)
CREATE TABLE tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  evento_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'refunded')),
  preference_id TEXT NOT NULL DEFAULT '',
  payment_id TEXT,
  monto INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Todos pueden ver sus propios tickets
CREATE POLICY "tickets_select_own" ON tickets FOR SELECT
  USING (auth.uid() = user_id);

-- El creador del evento ve los tickets de su evento
CREATE POLICY "tickets_select_event_owner" ON tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events WHERE events.id = tickets.evento_id AND events.created_by = auth.uid()
    )
  );

-- Solo el sistema crea tickets (desde Edge Function)
CREATE POLICY "tickets_insert" ON tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Actualizar status (desde webhook o usuario)
CREATE POLICY "tickets_update_own" ON tickets FOR UPDATE
  USING (auth.uid() = user_id);

-- Agregar columna monto a events (opcional, para precio numérico)
ALTER TABLE events ADD COLUMN IF NOT EXISTS monto INTEGER;
```

---

## Fase 1: Tipos (`src/types/index.ts`)

```typescript
export type TicketStatus = 'pending' | 'completed' | 'refunded';

export interface Ticket {
  id: string;
  eventoId: string;
  userId: string;
  status: TicketStatus;
  preferenceId: string;
  paymentId?: string;
  monto: number;
  createdAt: string;
}
```

Se agregó `monto?: number` a `Evento` para el precio numérico (en CLP).

**DB mapping:**
- `mapEventoFromDB`: mapea `db.monto` → `evento.monto` (opcional)
- `mapEventoToDB`: envía `evento.monto` → `db.monto`

---

## Fase 2: Mock data (`src/data/mock/eventos.ts`)

Cada evento mock ahora incluye `monto` numérico:

| Evento | Monto CLP |
|--------|-----------|
| Juana Fe | 5000 |
| Los Andes Jazz | 4000 |
| María Sol Trío | 6000 |
| Banda de Garage | 3500 |
| Tango Sur | 5000 |

---

## Fase 3: EventosContext (`src/context/EventosContext.tsx`)

Nuevos métodos en el provider:

| Método | Descripción |
|--------|-------------|
| `tickets` | `Ticket[]` — estado global de tickets |
| `createTicket(eventoId, userId, monto)` | Crea ticket con status `pending` |
| `getTicketsByUser(userId)` | Filtra tickets del usuario |
| `updateTicketStatus(ticketId, status)` | Cambia status (`completed`/`refunded`) |

Todo funciona en mock por ahora (sin Supabase para tickets).

---

## Fase 4: CarteleraStack (`src/navigation/CarteleraStack.tsx`)

Nuevo NativeStack que envuelve el tab Cartelera:

```typescript
export type CarteleraStackParamList = {
  CarteleraList: undefined;
  DetalleEvento: { eventoId: string };
  ConfirmacionCompra: { eventoId: string; ticketId: string; status: 'success' | 'failure' | 'pending' };
};
```

Screens:
1. **CarteleraList** → `CarteleraScreen` (lista de eventos)
2. **DetalleEvento** → `DetalleEventoScreen` (detalle + botón comprar)
3. **ConfirmacionCompra** → `ConfirmacionCompraScreen` (resultado post-pago, sin header)

---

## Fase 5: DetalleEventoScreen (`src/screens/DetalleEventoScreen.tsx`)

Pantalla que muestra:
- Nombre del artista (grande)
- Género musical
- Lugar (venue), fecha, hora
- Precio
- **Botón "Comprar entrada"**

**Flujo actual (mock):**
1. Usuario toca "Comprar entrada"
2. Se crea un `Ticket` con status `pending`
3. Alert con opciones: "Simular pago exitoso" o "Cancelar"
4. Si éxito → `updateTicketStatus('completed')` → navega a `ConfirmacionCompra` con `status: 'success'`
5. Si cancelar → `updateTicketStatus('refunded')`

**Flujo futuro (Mercado Pago):**
```
1. Usuario toca "Comprar entrada"
2. Se crea Ticket (pending)
3. POST a Edge Function /create-preference → recibe init_point
4. WebBrowser.openBrowserAsync(init_point)
5. MP procesa → redirect a appall://compra-{resultado}
6. Deep link → ConfirmacionCompraScreen
7. Webhook IPN actualiza status en DB
```

---

## Fase 6: ConfirmacionCompraScreen (`src/screens/ConfirmacionCompraScreen.tsx`)

Pantalla post-pago con 3 estados:

| status | Icono | Color | Mensaje |
|--------|-------|-------|---------|
| `success` | checkmark-circle | verde (#2E7D32) | "¡Compra exitosa!" |
| `failure` | close-circle | rojo (#B71C1C) | "Compra no completada" |
| `pending` | time | amarillo (#F57F17) | "Pago pendiente" |

Muestra info del evento + botón "Volver a cartelera".
Auto-redirección a cartelera después de 8 segundos (por si el usuario no toca nada).

---

## Fase 7-8: TarjetaEvento + CarteleraScreen

- `TarjetaEvento` ahora acepta `onPress?: () => void`. Si se provee, la tarjeta completa es touchable y navega al detalle. Si no, se comporta como antes (solo lectura).
- `CarteleraScreen` usa `useNavigation<NavigationProp>()` para navegar a `DetalleEvento` al presionar una tarjeta.
- `DashboardCafeScreen` y `PerfilMusicoScreen` siguen igual (no pasan `onPress`).

---

## Fase 9: Deep Links (app.json)

Scheme configurado: `appall://`

**app.json:**
```json
{
  "expo": {
    "scheme": "appall",
    "ios": { ... },
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [{ "scheme": "appall" }],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    "plugins": ["expo-secure-store", "expo-web-browser"]
  }
}
```

**Rutas deep link planeadas:**
| Ruta | Propósito |
|------|-----------|
| `appall://compra-exitosa?eventoId=X&ticketId=Y` | Pago aprobado |
| `appall://compra-fallida?eventoId=X` | Pago rechazado |
| `appall://compra-pendiente?eventoId=X` | Pago en revisión |

---

## Fase 10: Conexión Mercado Pago (PENDIENTE — implementar después)

### Backend: Supabase Edge Function

```typescript
// supabase/functions/create-preference/index.ts
import { MercadoPagoConfig, Preference } from "npm:mercadopago@2";

const client = new MercadoPagoConfig({
  accessToken: Deno.env.get("MP_ACCESS_TOKEN")!,
});

Deno.serve(async (req) => {
  const { eventoId, title, unitPrice, userId } = await req.json();
  const preference = await new Preference(client).create({
    items: [{ id: eventoId, title, quantity: 1, unit_price: unitPrice, currency_id: "CLP" }],
    payer: { email: userId },
    back_urls: {
      success: "appall://compra-exitosa",
      failure: "appall://compra-fallida",
      pending: "appall://compra-pendiente",
    },
    auto_return: "approved",
    notification_url: "https://<proyecto>.supabase.co/functions/v1/mp-webhook",
  });
  return new Response(JSON.stringify({ preferenceId: preference.id, initPoint: preference.init_point }));
});
```

### Frontend: en DetalleEventoScreen

```typescript
import * as WebBrowser from 'expo-web-browser';

const handleComprar = async () => {
  const user = await supabase.auth.getUser();
  const { initPoint } = await fetch(
    'https://<proyecto>.supabase.co/functions/v1/create-preference',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${user.data.session?.access_token}` },
      body: JSON.stringify({
        eventoId: evento.id,
        title: evento.artista,
        unitPrice: evento.monto,
        userId: user.data.user?.id,
      }),
    }
  ).then(r => r.json());

  const result = await WebBrowser.openBrowserAsync(initPoint);
  if (result.type === 'success') {
    // Navigate based on redirect URL
  }
};
```

### Webhook IPN

```typescript
// supabase/functions/mp-webhook/index.ts
Deno.serve(async (req) => {
  const { type, data } = await req.json();
  if (type === 'payment') {
    const paymentId = data.id;
    // Consultar MP API para obtener estado
    // Actualizar tickets.status en DB
  }
  return new Response('OK');
});
```

---

## Variables de Entorno Requeridas (futuro)

```
# .env (local) / Supabase Edge Function secrets
MP_ACCESS_TOKEN=TEST-xxxxxx
MP_PUBLIC_KEY=TEST-xxxxxx
EXPO_PUBLIC_MP_PUBLIC_KEY=TEST-xxxxxx
```

---

## Dependencias npm

Agregadas:
- `expo-web-browser` — para abrir Checkout Pro in-app

Futuras:
- `mercadopago` (SDK para Edge Function, no en frontend)

---

## Resumen de archivos creados/modificados

| Archivo | Acción |
|---------|--------|
| `src/types/index.ts` | ✅ Agregados `Ticket`, `TicketStatus`, `monto?` en `Evento` |
| `src/data/mock/eventos.ts` | ✅ Agregado `monto` numérico a cada evento |
| `src/context/EventosContext.tsx` | ✅ Agregados `tickets`, `createTicket`, `getTicketsByUser`, `updateTicketStatus` |
| `src/navigation/CarteleraStack.tsx` | ✅ **Nuevo** — stack nativo para Cartelera |
| `src/screens/DetalleEventoScreen.tsx` | ✅ **Nuevo** — detalle + botón comprar |
| `src/screens/ConfirmacionCompraScreen.tsx` | ✅ **Nuevo** — resultado post-pago |
| `src/components/TarjetaEvento.tsx` | ✅ Agregado `onPress` |
| `src/screens/CarteleraScreen.tsx` | ✅ Navegación a `DetalleEvento` |
| `src/navigation/index.tsx` | ✅ Cartelera tab usa `CarteleraStack` (headerShown: false) |
| `app.json` | ✅ Scheme `appall`, intent filters, plugin `expo-web-browser` |
| `package.json` | ✅ Dependencia `expo-web-browser` |

---

## Criterios de aceptación

- [x] Interfaz `Ticket` y `TicketStatus` en types
- [x] `Evento.monto` opcional para precio numérico (CLP)
- [x] Mock data con `monto` en cada evento
- [x] EventosContext con `tickets`, `createTicket`, `getTicketsByUser`, `updateTicketStatus`
- [x] CarteleraStack con CarteleraList → DetalleEvento → ConfirmacionCompra
- [x] DetalleEventoScreen muestra info completa del evento + botón comprar
- [x] ConfirmacionCompraScreen muestra resultado (success/failure/pending)
- [x] TarjetaEvento acepta `onPress` para navegar al detalle
- [x] CarteleraScreen navega a DetalleEvento al tocar tarjeta
- [x] Navegación sin romper tabs existentes
- [x] Scheme `appall://` configurado en app.json
- [x] `expo-web-browser` instalado
- [x] TypeScript compila sin errores
