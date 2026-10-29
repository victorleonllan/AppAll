# Spec 147 — `create-payment-flow` sabe cuándo la llama la app y la devuelve a la app

> Estado: aplicado (29-oct-2026) — `deno check` limpio; desplegada en producción (v4, `verify_jwt: false`), el código descargado trae `origen_invalido`, `origen=app` y `ticket_ref`. Criterio 4 (llamada en producción con sesión válida) pendiente: sin sesión de prueba en esta tanda.
> Capa: LÓGICA. `supabase/functions/create-payment-flow/index.ts`.
> Depende de: spec 105 (aplicado), spec 117 (aplicado)
> Hermano en la web: W-251 de `sonopolisWeb` (la ruta de retorno de Flow que lee `origen=app`).
> Alimenta: spec 151 (pago por pasarela en la app).

> **En una frase:** con `origen: 'app'` en el body, la `urlReturn` de Flow lleva
> `origen=app` para que la web reenvíe al comprador a la página puente que reabre la app;
> la respuesta suma `ticket_ref`; sin `origen`, todo sigue exactamente igual para la web.

## Contexto

Es el mismo cambio que el spec 117 le hizo a `create-preference`, ahora para Flow. Hoy
`create-payment-flow` no distingue quién la llama:

- Lee solo `evento_id, user_id, cantidad` del body (`create-payment-flow/index.ts:46`).
- La vuelta de Flow apunta siempre a la web:
  `urlReturn: ${APP_WEB_URL}/api/flow/retorno?ref=${ticketRef}` (`:152`). Flow devuelve
  al comprador con un **POST** a esa URL; la ruta `app/api/flow/retorno/route.js` de la
  web (W-189) lo convierte con un `303` en
  `/mis-entradas?compra=success&ref=…`. Desde la app nativa eso deja al comprador en
  sonopolis.org dentro del navegador del sistema, sin sesión web, y la app nunca se entera
  de que volvió.
- La respuesta es `{ checkout_url, ticket_id, pasarela }` (`:177-181`), sin `ticket_ref`.
  La app la necesita para reconocer su propio retorno: `ConfirmacionCompra` recibe `ref` y
  la confirma con `confirm-payment` (spec 114 y 118), que con un ticket de Flow le pregunta
  a Flow por `commerceOrder` = `ticketRef` (`confirm-payment/index.ts:121-152`).

**Por qué no apuntar `urlReturn` directo a `/app/volver` (W-245) ni a `appall://`:**
Flow vuelve con un POST, y `/app/volver` es una página de Next.js, que solo acepta GET
(respondería 405 justo después de pagar; es el motivo de que exista
`/api/flow/retorno`, W-189). Un scheme propio tampoco sirve: el navegador no puede hacer un
POST a `appall://`. Así que la vuelta sigue pasando por `/api/flow/retorno`, y es esa ruta
la que, con `origen=app`, redirige a `/app/volver` (W-251).

`ticketRef` (`:114`) es un UUID generado por la función, la misma referencia que va a
`tickets.preference_id` y a Flow como `commerceOrder`.

## Diseño

### Decisión 1 — `origen` en el body, explícito y validado como en el spec 117

```ts
const { evento_id, user_id, cantidad, origen } = await req.json();
// ...
if (origen !== undefined && origen !== 'app') {
  return json({ error: 'origen_invalido', detail: "origen debe ser 'app' u omitirse" }, 400);
}
const desdeApp = origen === 'app';
```

La validación va junto a la de `cantidad` (`:58-63`), después de la sesión y antes de
consultar el evento: un body inválido no gasta consultas, no reserva cupo y no llama a
Flow.

**Por qué rechazar un valor desconocido en vez de tratarlo como web:** un cliente que
manda `origen: 'ios'` por error recibiría la vuelta de la web en silencio, y el síntoma
(«después de pagar, la app no vuelve») quedaría lejísimos de la causa. La web no manda
`origen`, así que la regla no la afecta. Mismo código de error y mismo texto que
`create-preference` (`create-preference/index.ts:77-80`): la app traduce un solo
vocabulario de errores para las dos pasarelas (spec 151).

### Decisión 2 — la `urlReturn` de la app

```ts
// Spec 147 — `origen=app`: /api/flow/retorno (W-251) reenvía a /app/volver, que reabre
// la app. Sin él, la vuelta de la web queda byte a byte igual.
urlReturn: desdeApp
  ? `${APP_WEB_URL}/api/flow/retorno?origen=app&ref=${ticketRef}`
  : `${APP_WEB_URL}/api/flow/retorno?ref=${ticketRef}`,
```

- **La marca va en la URL y no en `optional`:** la ruta de la web recibe el POST de Flow
  sin sesión y no le pregunta nada a Flow ni a la base; solo puede decidir con lo que trae
  la URL. Ya depende de que Flow conserve la query de `urlReturn` para leer `ref` (W-189),
  así que `origen` viaja por el mismo camino.
- **No hay que firmar ni proteger `origen`:** lo peor que logra alguien que lo agrega a
  mano es que su propio navegador termine en `/app/volver` en vez de `/mis-entradas`. La
  confirmación real sigue siendo `webhook-flow` / `confirm-payment`, no la URL de vuelta.
- `urlConfirmation`, `timeout`, `optional`, `commerceOrder`, monto y moneda no cambian.

### Decisión 3 — la respuesta suma `ticket_ref`

```ts
return json({
  checkout_url: `${orden.url}?token=${orden.token}`,
  ticket_id: ticket.id,
  ticket_ref: ticketRef,
  pasarela: 'flow',
}, 200);
```

En los dos modos, igual que `create-preference` (spec 117, Decisión 3). Es un campo nuevo:
la web lo ignora (`crearPagoCompra` de `libs/purchase.js` lee solo `checkout_url`,
`init_point`, `sandbox_init_point` y `ticket_id`).

### Decisión 4 — se despliega

Un arreglo que no está desplegado no existe (`CLAUDE.md`, «Tres estados que se
desincronizan»). El spec se cierra con la función desplegada:
`supabase functions deploy create-payment-flow`, que toma `verify_jwt = false` e
`import_map` de `supabase/config.toml:434-438`. Si se despliega con el MCP de Supabase,
pasar `verify_jwt: false` e `import_map_path: "deno.json"` explícitos (`CLAUDE.md`).

Desplegarla antes que la W-251 es inocuo: Flow está apagado en todos los países
(`pasarelas_cobro`, spec 104) y ningún cliente manda `origen: 'app'` a esta función hasta
el spec 160.

## Criterios de aceptación

1. `deno check supabase/functions/create-payment-flow/index.ts` sin errores (el spec 105
   la dejó limpia).
2. `git diff` de la función: solo agrega la lectura y validación de `origen`, la rama de
   `urlReturn` y `ticket_ref` en la respuesta. La `urlReturn` sin `origen` queda byte a
   byte igual a la de `:152`.
3. Desplegada en producción: `get_edge_function` (MCP de Supabase) devuelve el código con
   `origen_invalido` y `origen=app`, y la función sigue con `verify_jwt: false`.
4. En producción, con sesión válida y un evento `CL`: `origen: 'ios'` responde
   `400 { error: 'origen_invalido' }` y `origen: 'app'` responde
   `409 { error: 'pasarela_inactiva' }` (Flow apagado). En los dos casos no se crea ningún
   ticket.

## Fuera de alcance

- La ruta `/api/flow/retorno` que lee `origen=app`: W-251 de `sonopolisWeb`.
- Que la app llame a esta función: specs 151 y 160.
- Encender Flow: es un spec DATOS de una línea sobre `pasarelas_cobro` (spec 104), aparte.
- `create-preference`: ya tiene `origen` (spec 117).

## Verificación manual (candidatas a `V#` en `specs/PENDIENTES.md`)

- **V-candidata 147-a:** con Flow encendido en sandbox, una compra con `origen: 'app'` crea
  la orden con `urlReturn` = `https://sonopolis.org/api/flow/retorno?origen=app&ref=<uuid>`
  y, al volver, Flow conserva los dos parámetros en el POST (mismo supuesto que el `ref`
  de W-189, nunca probado en sandbox). La respuesta trae `ticket_ref` igual a
  `tickets.preference_id`.
- **V-candidata 147-b:** una compra con Flow desde la web (sin `origen`) sigue volviendo a
  `/mis-entradas?compra=success&ref=…`.
