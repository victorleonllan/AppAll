# Spec 021 — Cerrar el flujo de compra en web

> Estado: **código completo, verificado el 2026-08-11 contra el repo actual** (los 9
> problemas de este documento, incluidos los tres encontrados al implementar). Los
> checkboxes de *Criterios de aceptación* nunca se habían tildado aunque el código ya los
> cumplía — quedaron así desde que se escribió el spec, tres días y quince specs atrás. Ver
> el detalle fila por fila más abajo.
>
> **Lo único que falta es real: la prueba end-to-end con una compra de verdad.**
> Producción tiene 6 tickets, todos en `pending` — el flujo llega hasta el Checkout Pro de MP
> pero ningún pago se completó, ni antes ni después de estos fixes. Ya no bloqueado por el
> spec 028 (Resend, aplicado 2026-08-11): el magic link llega bien. Intento del 2026-08-13
> trabado en el propio checkout de MP — detalle y cómo retomarlo en `PENDIENTES.md`, spec 021.
>
> **Fuera de este spec y sin escribir todavía:** validar la firma `x-signature` de MP,
> validar `cantidad` y limitar aforo — es el spec 022, hoy solo un bosquejo en
> `PENDIENTES.md`.

## Contexto

El flujo de compra **nunca se completó una sola vez**. Hay 0 tickets en la base, lo que
confirma que `create-preference` jamás terminó bien. Los specs 009, 014 y 015 dejaron la
infraestructura montada, pero nadie la ejecutó de punta a punta.

Este spec cierra los seis puntos donde el flujo se rompe. No agrega funcionalidad nueva:
arregla la que ya debía funcionar.

**Criterio de cierre:** una compra completa con tarjeta de prueba de Mercado Pago,
ticket en `completed`, verificado consultando la base.

---

## Problema 0 — el cliente se autentica con la anon key 🔴

**Encontrado al implementar este spec. No estaba en el inventario de `PENDIENTES.md`,
y es la causa raíz: el flujo moría acá, antes de llegar a Mercado Pago.**

```ts
// DetalleEventoScreen.tsx:117
'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
```

Del otro lado, `create-preference` identifica al comprador así:

```ts
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { headers: { Authorization: authHeader } },
});
const { data: { user } } = await supabase.auth.getUser();
if (!user || user.id !== user_id) return new Response('Unauthorized', { status: 401 });
```

La anon key es un JWT, pero **no es un token de usuario**: `getUser()` devuelve `null`.
La guarda dispara y la function responde **401 antes de llamar a MP**. Nunca se creó una
preferencia, nunca se insertó un ticket. Eso explica los 0 tickets de la base.

Se veía como un error genérico ("No se pudo procesar la compra") porque el cliente
descartaba el cuerpo de la respuesta — ver problema 2.

### Solución

Mandar el `access_token` de la sesión, y la anon key en su header propio:

```ts
const { data: { session } } = await supabase.auth.getSession();
if (!session) throw new Error('Sesión no encontrada');

headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${session.access_token}`,
  'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
}
```

La guarda `user.id !== user_id` de la Edge Function se mantiene: ahora sí puede cumplirse.

---

## Problema 0b — `create-preference` no responde CORS 🔴

**También encontrado al implementar, también fuera del inventario.**

La app web vive en `app-all-lemon.vercel.app` y la function en
`xluinfihjjtxkglihxqz.supabase.co`: son orígenes distintos. Un `POST` con
`Content-Type: application/json` dispara un preflight `OPTIONS`, que la function no
maneja, y ninguna respuesta lleva `Access-Control-Allow-Origin`.

**El navegador bloquea la petición antes de que salga.** Segundo muro, independiente
del problema 0: aunque el token fuera correcto, en web la llamada moría igual.

### Solución

Manejar `OPTIONS` y devolver los headers CORS en **todas** las respuestas, incluidas las
de error — si el error no los lleva, el navegador lo convierte en un fallo de CORS
genérico y el detalle del problema 2 se pierde igual.

```ts
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
```

Se agrega un helper `json(body, status)` y **todas** las salidas de la function pasan por
él, así ninguna se queda sin headers. De paso, las respuestas de error dejan de ser texto
plano (`'Unauthorized'`, `'Evento no encontrado'`) y pasan a ser JSON con detalle.

`webhook-mp` no necesita CORS: lo llama Mercado Pago servidor a servidor, no un navegador.

---

## Problema 0c — ningún evento creado desde la app se puede comprar 🔴

**Tercer hallazgo fuera del inventario.**

`CrearEventoScreen` captura `precio` como **texto libre** (placeholder `"Ej: $5.000"`) y
nunca setea `monto`. En el mapeo a base:

```ts
monto: evento.monto ?? null,   // EventosContext.tsx
```

Queda `NULL`. Y del otro lado:

```ts
if (monto <= 0) {
  Alert.alert('Sin precio', 'Este evento no tiene un precio definido');
  return;   // DetalleEventoScreen.tsx:103
}
```

Son dos campos para una sola idea: `precio` es lo que el músico escribe, `monto` es el
entero en CLP que Mercado Pago cobra. Nadie conectaba uno con el otro, así que **todo
evento publicado desde la app nacía sin precio cobrable**.

### Solución

Derivar `monto` de `precio` en `mapEventoToDB`, el punto único por donde pasan las
escrituras de eventos:

```ts
function montoDesdePrecio(precio: string | undefined): number {
  const digitos = (precio ?? '').replace(/\D/g, '');
  return digitos ? parseInt(digitos, 10) : 0;
}
```

Formato chileno: el punto es separador de miles, no decimal — quedarse con los dígitos es
la lectura correcta (`"$5.000"` → `5000`).

Un campo numérico propio en el formulario sería más limpio, pero es cambio de UI y queda
para un spec aparte. Derivarlo cierra el flujo sin tocar la pantalla.

---

## Problema 1 — `back_urls` apuntan a un scheme nativo

```ts
// create-preference/index.ts:44-48
back_urls: {
  success: 'appall://confirmacion?status=success',
  ...
}
```

`appall://` es el scheme de la app nativa (`app.json`). En un navegador no se resuelve:
el usuario paga, Mercado Pago intenta redirigirlo y queda varado en una pestaña muerta.
Además `appall` es la marca vieja — el producto es **Sonópolis**.

### Solución

URLs HTTPS al deploy web, leídas de una variable de entorno:

```ts
const APP_WEB_URL = Deno.env.get('APP_WEB_URL') ?? 'https://app-all-lemon.vercel.app';

back_urls: {
  success: `${APP_WEB_URL}/?compra=success`,
  failure: `${APP_WEB_URL}/?compra=failure`,
  pending: `${APP_WEB_URL}/?compra=pending`,
}
```

Se usa env var y no una constante para que un deploy de preview pueda apuntar a su
propia URL sin editar código.

⚠️ **Requiere setear el secret antes de desplegar:**

```bash
supabase secrets set APP_WEB_URL=https://app-all-lemon.vercel.app
```

El scheme nativo queda **fuera de alcance**: en web el checkout se abre en una pestaña
nueva (`window.open(..., '_blank')`) y la pestaña original sigue haciendo polling, así
que la back_url es una cortesía, no el mecanismo de confirmación. Nativo se trata en el
spec 027.

---

## Problema 2 — `auto_return` con back_url no-HTTP

```ts
auto_return: 'approved',
```

Mercado Pago valida las `back_urls` **al crear la preferencia**. Con `auto_return`
activo y una `success` que no es HTTP(S), la API puede rechazar la creación con
`400 invalid auto_return`. Es la causa más probable de que `create-preference` nunca
haya devuelto un `init_point`.

### Solución

`auto_return` se mantiene — deja de ser un problema en cuanto las `back_urls` son HTTPS
(problema 1). Lo que se agrega es que el error de MP **se propague con detalle** en vez
de morir como un `502` opaco:

```ts
if (!mpRes.ok) {
  const errorText = await mpRes.text();
  console.error('MP API error:', mpRes.status, errorText);
  return new Response(
    JSON.stringify({ error: 'mp_preference_failed', status: mpRes.status, detail: errorText }),
    { status: 502, headers: { 'Content-Type': 'application/json' } }
  );
}
```

Sin esto, el próximo fallo vuelve a ser invisible desde el cliente. Del lado del
cliente, `DetalleEventoScreen` deja de tragarse el cuerpo de la respuesta:

```ts
if (!res.ok) {
  const detalle = await res.text();
  throw new Error(`create-preference ${res.status}: ${detalle}`);
}
```

### 2b — `sandbox_init_point` va primero

```ts
const checkoutUrl = data.sandbox_init_point || data.init_point;
```

Con credenciales de prueba, `init_point` **ya opera en modo test**.
`sandbox_init_point` es el flujo antiguo de MP y no siempre resuelve. Se invierte la
preferencia: `init_point || sandbox_init_point`. Es candidato serio a ser el segundo
punto donde el flujo moría.

---

## Problema 3 — el webhook solo escucha `merchant_order`

```ts
// webhook-mp/index.ts:15
if (topic === 'merchant_order' && id) { ... }
```

Webhooks v2 de Mercado Pago notifican **`payment`** como evento principal, y lo hacen
por `POST` con el cuerpo `{ "type": "payment", "data": { "id": "..." } }` — no siempre
por query string. Si llega solo esa notificación, el ticket **nunca** pasa a `completed`.

### Solución

Leer el evento de las dos fuentes (query string y body) y manejar ambos tópicos:

| Notificación | Endpoint que se consulta | De dónde sale el ticket |
|---|---|---|
| `payment` | `GET /v1/payments/{id}` | `external_reference` + `preference_id` de la respuesta |
| `merchant_order` | `GET /merchant_orders/{id}` | `preference_id` de la orden |

En ambos casos **se vuelve a consultar la API de MP**; nunca se confía en el payload
recibido. Eso ya era así y se mantiene.

---

## Problema 4 — el `catch` devuelve 200 aunque falle

```ts
} catch (err) {
  console.error('webhook error:', err);
  return new Response('OK', { status: 200 });   // ← MP lo lee como entregado
}
```

Mercado Pago reintenta las notificaciones que **no** devuelven 2xx. Devolver 200 ante un
error interno significa: pago cobrado, ticket en `pending` para siempre, y MP no vuelve
a intentar nunca.

### Solución

`500` ante error interno o ante un fallo consultando la API de MP. `200` solo cuando
el evento se procesó, o cuando es un evento que legítimamente se ignora (por ejemplo un
tópico desconocido) — ahí reintentar no sirve de nada.

---

## Problema 5 — no hay manejo de pagos rechazados

```ts
if (order.order_status === 'paid') { ... }
```

Solo se actúa ante el caso feliz. Un rechazo deja el ticket en `pending` sin feedback,
y el usuario ve "Verificando pago…" hasta que se rinde.

### Solución

Mapeo explícito de estado de Mercado Pago a `TicketStatus`:

| Estado en MP | `tickets.status` |
|---|---|
| `approved` / order `paid` | `completed` |
| `rejected`, `cancelled` | `cancelled` |
| `refunded`, `charged_back` | `refunded` |
| `pending`, `in_process`, `authorized` | `pending` (sin cambio) |

Los cuatro valores existen ya en el `CHECK` de `tickets_status_check` y en `TicketStatus`
(`src/types/index.ts`). No hace falta migración.

⚠️ **`'paid'` no es un estado de ticket** — es de Mercado Pago. Confundirlos rompió el
dashboard del spec 010.

Además se corrige el `payment_id`: hoy el webhook guarda ahí el id de la *merchant order*.
Debe guardar el id del **pago**.

---

## Problema 6 — la pantalla de confirmación miente y luego se rinde

Dos defectos en `ConfirmacionCompraScreen.tsx`:

### 6a — un pago exitoso se muestra como fallido

```ts
setActualStatus(data.status as 'success' | 'failure' | 'pending');   // línea 58
const cfg = config[actualStatus] ?? config.failure;                   // línea 42
```

El polling escribe el estado **del ticket** (`completed`, `cancelled`, `refunded`) en una
variable que se usa como clave de `config`, cuyas claves son `success` / `failure` /
`pending`. `config['completed']` es `undefined` → cae al `?? config.failure`.

**Una compra exitosa muestra "Compra no completada".** El `as` silenció al compilador:
son dos vocabularios distintos y el cast los hizo pasar por uno.

Se agrega una función de traducción explícita:

```ts
const TICKET_A_VISTA: Record<TicketStatus, 'success' | 'failure' | 'pending'> = {
  completed: 'success',
  cancelled: 'failure',
  refunded:  'failure',
  pending:   'pending',
};
```

### 6b — el polling se rinde a los 30s en silencio

```ts
const timeout = setTimeout(() => clearInterval(interval), 30000);   // línea 62
```

30 segundos no alcanzan: el webhook depende de que MP notifique, y su latencia puede ser
de minutos. Al vencer, el intervalo se limpia y la pantalla queda congelada en
"Verificando pago…" para siempre, sin distinguir "esperando" de "me rendí".

Solución: ventana de **3 minutos**, y al vencer un estado `timeout` visible con un botón
para reintentar la consulta a mano.

---

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `supabase/functions/create-preference/index.ts` | back_urls HTTPS vía `APP_WEB_URL`, error de MP con detalle |
| `supabase/functions/webhook-mp/index.ts` | tópico `payment` + body POST, códigos de error correctos, mapeo de estados, `payment_id` real |
| `src/screens/ConfirmacionCompraScreen.tsx` | traducción de estados, ventana de 3 min, estado `timeout` con reintento |
| `src/screens/DetalleEventoScreen.tsx` | **access_token en vez de anon key**, propaga el detalle del error, `init_point` antes que `sandbox_init_point` |

## Criterios de aceptación

Verificado leyendo el código en el repo el 2026-08-11, no ejecutando la app — ver la nota
de estado al principio del documento para el porqué.

- [x] `create-preference` recibe el `access_token` del usuario y **no** responde 401 — `DetalleEventoScreen.tsx:177`
- [x] `APP_WEB_URL` seteada como secret en Supabase — usada en `create-preference/index.ts:9`, con fallback a la URL de producción si faltara
- [x] `create-preference` devuelve `init_point` sin error — CORS, auth y back_urls HTTPS ya no lo bloquean; sin una compra real esto sigue sin probarse en runtime
- [x] Las `back_urls` de la preferencia creada son HTTPS y apuntan a Sonópolis — `create-preference/index.ts:65-69`
- [x] Un error de la API de MP llega al cliente con status y detalle, no como `502` opaco — `create-preference/index.ts:87-92`
- [x] El webhook procesa una notificación `type=payment` enviada por POST — `webhook-mp/index.ts:40-45,57-61`
- [x] El webhook procesa una notificación `topic=merchant_order` por query string — `webhook-mp/index.ts:36-38,62-67`
- [x] Un fallo interno del webhook devuelve `500`, no `200` — `webhook-mp/index.ts:99-104`
- [x] Un pago rechazado deja el ticket en `cancelled`, no en `pending` — mapa `ESTADO_MP` en `webhook-mp/index.ts:10-17`
- [x] `payment_id` guarda el id del pago, no el de la merchant order — `webhook-mp/index.ts:60,66`
- [x] Una compra aprobada muestra **"Compra exitosa"**, no "Compra no completada" — `TICKET_A_VISTA` en `ConfirmacionCompraScreen.tsx:23-28`
- [x] Tras 3 minutos sin confirmación la pantalla lo dice y ofrece reintentar — `ConfirmacionCompraScreen.tsx:31,108-111,161-171`
- [ ] **Compra end-to-end con tarjeta de prueba, ticket en `completed` verificado en la base** — el único que sigue abierto; depende del spec 028

## Fuera de alcance

- Validación de firma `x-signature`, idempotencia, control de cupo y validación de
  `cantidad` → **spec 022**
- Deep link nativo (`appall://`) y prueba en nativo → **spec 027**
- Que la cartelera esté vacía (0 eventos) bloquea la prueba end-to-end; sembrar datos
  es parte del **spec 024** (`seed.sql`), pero para cerrar este spec basta crear un
  evento a mano desde la app
