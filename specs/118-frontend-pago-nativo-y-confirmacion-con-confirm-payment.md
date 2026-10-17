# Spec 118 — Pago nativo con el navegador del sistema, y la confirmación le pregunta a `confirm-payment`

> Estado: propuesto (16-oct-2026)
> Capa: FRONTEND. `src/screens/DetalleEventoScreen.tsx`, `src/screens/ConfirmacionCompraScreen.tsx`.
> Depende de: spec 114, spec 117.
> Alimenta: spec 126 (el botón «Ver mis entradas» de la confirmación lleva a esa pantalla).
> Requiere desplegado antes de distribuir un build: `sonopolisWeb` W-245 (la página puente). Sin ella el pago se cobra igual, pero el navegador no vuelve solo a la app.
> Hermano en la web: `sonopolisWeb/app/(marketing)/compra/confirmacion/Confirmacion.js` y `app/(private)/mis-entradas/PollTrasCompra.js`.

> **En una frase:** en iOS y Android, «Comprar» abre el checkout de Mercado Pago con
> `WebBrowser.openAuthSessionAsync` y vuelve a la app por `appall://compra`; la pantalla de
> confirmación deja de esperar al webhook y le pide la confirmación a `confirm-payment` en
> cada consulta, como la web. El build web de Expo sigue como hoy.

## Contexto

### En nativo, comprar no abre nada

`DetalleEventoScreen.tsx:196-199`:

```ts
const checkoutUrl = data.init_point || data.sandbox_init_point;
if (typeof window !== 'undefined') {
  window.open(checkoutUrl, '_blank');
}
```

En React Native `window.open` no existe (`window` existe como global, pero sin `open`): el
`if` pasa, la llamada lanza `TypeError`, el `catch` muestra «No se pudo procesar la
compra»… **después** de que `create-preference` ya reservó un ticket `pending`, que ocupa
cupo hasta que caduque a los 30 minutos (spec 088). Comprar desde la app nativa no
funciona hoy.

### La confirmación espera a un webhook que no confirma

`ConfirmacionCompraScreen.tsx:77-91` solo lee `tickets.status` cada 3 s. Quien pasa el
ticket a `completed` debería ser `webhook-mp`, pero la firma `x-signature` no coincide
contra tráfico real de Mercado Pago (comentario de `confirm-payment/index.ts:7-15`). Por eso
la web, en cada tick, **primero** le pide a `confirm-payment` que verifique el pago contra
la API de Mercado Pago y **después** lee el estado
(`sonopolisWeb/app/(marketing)/compra/confirmacion/Confirmacion.js:116-136`). La app nunca
llama a `confirm-payment`: una compra aprobada se queda «pendiente» en la app hasta la
reconciliación diaria.

### Comprar sin sesión, en nativo, manda el login a la web

Sin sesión, el detalle pide el correo y llama a `signInOtp`
(`DetalleEventoScreen.tsx:130-151`), que arma `emailRedirectTo` con
`window.location.origin` (`AuthContext.tsx:62-65`). En nativo eso es `undefined`, y Supabase
manda el enlace al Site URL: el comprador abre el correo y queda logueado **en la web**, no
en la app. La app no tiene cómo recibir una sesión por deep link fuera de
`openAuthSessionAsync`.

## Diseño

### Decisión 1 — dos caminos, elegidos por `Platform.OS`

`handleComprarLogueado` se parte en una función que pide la preferencia (común) y dos
formas de abrir el pago:

- **`Platform.OS === 'web'`**: exactamente lo de hoy. Body sin `origen`, `window.open`,
  `navigation.replace('ConfirmacionCompra', { eventoId, ticketId, status: 'pending' })`.
  Las `back_urls` siguen yendo a `sonopolis.org/mis-entradas` (la web Next.js), que es lo
  correcto para quien compra en un navegador.
- **Nativo**: Decisión 2.

**Por qué no unificar con `openAuthSessionAsync` también en web:** en web,
`expo-web-browser` abre un popup que el navegador bloquea si no sale síncrono del clic (le
pasó a la web en producción; ver `abrirVentanaDeEspera` en `sonopolisWeb/libs/purchase.js`),
y el `appall://` de vuelta no significa nada en un navegador. El build web no manda en las
decisiones del plan, pero no debe romperse.

### Decisión 2 — el pago nativo

```ts
const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-preference`, {
  method: 'POST',
  headers: { /* los mismos de hoy: Content-Type, Authorization Bearer access_token, apikey */ },
  body: JSON.stringify({ evento_id: evento.id, user_id: user!.id, cantidad: 1, origen: 'app' }),
});
// … mismo manejo de !res.ok que hoy (el detalle del error viaja al Alert)
const { init_point, sandbox_init_point, ticket_id, ticket_ref } = await res.json();

const resultado = await WebBrowser.openAuthSessionAsync(
  init_point || sandbox_init_point,
  'appall://compra',
);

let status: 'success' | 'failure' | 'pending' = 'pending';
if (resultado.type === 'success' && resultado.url) {
  const s = new URL(resultado.url).searchParams.get('status');
  if (s === 'success' || s === 'failure' || s === 'pending') status = s;
}

navigation.navigate('ConfirmacionCompra', {
  eventoId: evento.id, ticketId: ticket_id, ref: ticket_ref, status,
});
```

- `origen: 'app'` hace que `create-preference` devuelva el pago a la página puente W-245,
  que reabre `appall://compra?status=…&ref=…` (spec 117).
- `openAuthSessionAsync` (y no `openBrowserAsync`): es el único de los dos que **espera**
  a que el navegador vuelva por la URL de retorno y lo cierra solo. Es el mismo mecanismo
  que ya usa el login con Google (`AuthContext.tsx:105`).
- **Si el comprador cierra el navegador sin volver** (`type` `'cancel'` o `'dismiss'`), se
  navega igual a la confirmación con `status: 'pending'`: el ticket existe y pudo haberse
  pagado (p. ej. pagó y cerró antes del retorno). La confirmación lo resuelve preguntando.
- `navigate` y no `replace`: el spec 114 le puso `getId` (por `ref`) a
  `ConfirmacionCompra`. En Android, el retorno por `appall://compra` llega también al
  `linking` de React Navigation, que navega a la misma ruta con el mismo `ref`; con
  `navigate` las dos llegadas caen en la misma pantalla en vez de apilar dos. Detalle queda
  debajo, y «atrás» vuelve al evento.
- `new URL(...)` con un scheme propio funciona en Hermes; si el executor encuentra que no,
  el fallback es leer el query string a mano (`split('?')[1]` + `URLSearchParams`, igual que
  `AuthContext.tsx:114-115`).
- Se importa `* as WebBrowser from 'expo-web-browser'` (ya es dependencia y plugin en
  `app.json`).

### Decisión 3 — sin sesión, en nativo, se inicia sesión en la app

En `handleBotonComprar` (`:281-288`), sin `user`:

- **web**: lo de hoy (paso `'email'`, enlace mágico).
- **nativo**: `Alert` «Inicia sesión para comprar» con un botón «Iniciar sesión» que
  navega a la pestaña de cuenta: `navigation.getParent()?.navigate('Sonópolis')` (la
  tercera pestaña sin sesión es `AuthScreen` con ese nombre, `navigation/index.tsx:20`).

**Por qué no arreglar el enlace mágico en nativo:** exigiría que la app reciba la sesión
por deep link (`appall://` con tokens) fuera de `openAuthSessionAsync`, que es lógica de
`AuthContext` y otro spec. Mandar a iniciar sesión con contraseña o Google funciona hoy y
no pierde la compra: después de entrar, el evento sigue en la cartelera.

### Decisión 4 — la confirmación, como la web

`ConfirmacionCompraScreen.tsx` se reescribe en su lógica (la vista y sus estilos se
conservan). Recibe `{ eventoId?, ticketId?, ref?, status? }` (tipo del spec 114).

**Resolver el ticket.** Si llega `ticketId`, se usa. Si llega solo `ref` (la app estaba
cerrada y la abrió el deep link), al montar se busca:

```ts
supabase.from('tickets').select('id, evento_id').eq('preference_id', ref).maybeSingle()
```

La policy `tickets_select_own` (spec 020) devuelve la fila si el ticket es de quien tiene
la sesión. Si no aparece (otra cuenta, o sin sesión), la pantalla sigue con `ref` sola:
`confirm-payment` acepta `ticket_ref` (Decisión 4b) y el estado se puede mostrar igual;
solo falta la info del evento.

**4a. Cada consulta pide primero la confirmación.**

```ts
async function pedirConfirmacion(cuerpo: { ticket_id?: string; ticket_ref?: string }) {
  try {
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/confirm-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify(cuerpo),
    });
    if (!res.ok) return null;
    return (await res.json()) as { status?: TicketStatus };
  } catch {
    return null; // un fallo acá no corta el polling: el próximo tick reintenta
  }
}
```

Mismos headers que la web (`pedirConfirmacion` en `sonopolisWeb/libs/data/tickets.js`).
**Este `catch` sí es deliberado y va comentado:** un tick fallido no es un error para el
usuario mientras quede ventana; el error visible es el `timeout` del final.

**4b. Qué se consulta.** `consultarTicket`:

1. `pedirConfirmacion(ticketId ? { ticket_id: ticketId } : { ticket_ref: ref })`.
2. Si hay `ticketId`, lee `tickets.status` como hoy (`:80-84`) — es la fuente de verdad
   que ya tenía; si no lo hay, usa el `status` que devolvió `confirm-payment` (que es el
   estado del ticket, `confirm-payment/index.ts`, respuestas `{ status }`).
3. Si salió de `pending`, traduce con `TICKET_A_VISTA` (`:23-28`, se conserva) y corta.

**4c. Cuándo se consulta.** Igual que la web: una consulta **inmediata** al montar (si el
pago ya está aprobado, no tiene sentido mostrar «pendiente» 3 s), después cada
`INTERVALO_POLLING_MS` (3 s) durante `VENTANA_POLLING_MS` (3 min), y al vencer, `timeout`
con el botón «Volver a consultar» de hoy. Se consulta cuando `status` inicial es
`pending` o `success` (la `back_url` de éxito dice que Mercado Pago aprobó, pero el ticket
y las entradas los emite `confirm-payment`). Con `status: 'failure'` no se consulta: se
muestra el fallo como hoy.

**4d. Salidas.** Con éxito se agrega un botón principal «🎟️ Ver mis entradas» →
`navigation.navigate('MisEntradas')` (ruta registrada en `CarteleraStack` por el spec 114),
y «Volver a cartelera» pasa a secundario. Se **quita** la redirección automática a los 8 s
(`:126-134`): con un botón para ver la entrada recién comprada, sacar al usuario de la
pantalla sin que lo pida le quita justo esa opción.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin errores.
2. `npm run build:web` termina sin errores.
3. `grep -n "window.open" src/screens/DetalleEventoScreen.tsx` aparece solo dentro de la
   rama `Platform.OS === 'web'`.
4. En nativo, el body a `create-preference` lleva `origen: 'app'`; en web, no.
5. `ConfirmacionCompraScreen` llama a `confirm-payment` antes de leer `tickets` en cada
   consulta, y hace una consulta al montar.
6. Abierta solo con `{ ref, status: 'pending' }` (sin `ticketId`), la pantalla resuelve el
   ticket por `preference_id` y consulta.
7. Sin sesión, en nativo, «Comprar» no llama a `signInOtp`.

## Fuera de alcance

- Elegir cantidad (sigue `cantidad: 1`), moneda y precio vigente en el botón: spec 120.
- Compra sin cuenta (guest checkout, spec 048 sección 2).
- Enlace mágico que vuelva a la app (Decisión 3).
- El contenido de «Mis entradas»: spec 126 (hasta entonces, la pantalla provisoria del 114
  lleva a la web).
- Flow: apagado.

## Verificación manual (candidatas a `V#` en `specs/PENDIENTES.md`)

- **V (118-a):** compra real desde un build de Android: se abre Mercado Pago dentro de la
  app, al aprobar vuelve sola a la confirmación (o con el botón de la W-245), y en menos de
  un minuto pasa a «Compra exitosa» con el ticket `completed` en la base. Una sola
  pantalla de confirmación en el stack.
- **V (118-b):** lo mismo en iOS.
- **V (118-c):** pagar y cerrar el navegador antes del retorno: la confirmación igual llega
  a «Compra exitosa».
- **V (118-d):** en el build web de Expo, comprar sigue abriendo Mercado Pago en otra
  pestaña y la confirmación pasa a éxito llamando a `confirm-payment`.
