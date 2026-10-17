# Spec 117 — `create-preference` sabe cuándo la llama la app y la devuelve a la app

> Estado: propuesto (16-oct-2026)
> Capa: LÓGICA. `supabase/functions/create-preference/index.ts`.
> Depende de: ninguno.
> Alimenta: spec 118 (pago nativo), `sonopolisWeb` W-245 (la página puente a la que apuntan las `back_urls`).

> **En una frase:** con `origen: 'app'` en el body, las `back_urls` de Mercado Pago
> apuntan a la página puente `https://sonopolis.org/app/volver` (W-245), que reabre la
> app; la respuesta suma `ticket_ref`; sin `origen`, todo sigue exactamente igual para la
> web.

## Contexto

`create-preference` arma las `back_urls` siempre hacia la web
(`create-preference/index.ts:147-155`): el pago aprobado vuelve a
`${APP_WEB_URL}/mis-entradas?compra=success&ref=<ticketRef>`. Para la web es correcto.
Para la app nativa no: el comprador termina en `sonopolis.org` dentro del navegador del
sistema, sin sesión web, y la app nunca se entera de que volvió.

No se puede apuntar las `back_urls` directo a `appall://`: Mercado Pago las valida al crear
la preferencia y, con `auto_return` activo, rechaza un scheme que no sea HTTPS (comentario
de `:7-8`, y `CLAUDE.md` del repo, «El flujo de compra»). Hace falta una página HTTPS que
reciba el retorno y reabra la app: la W-245 de la web.

`ticketRef` (`:133`) es la referencia del ticket que existe antes que el ticket, y la que
viaja en la `back_url` (spec 072). Hoy la respuesta devuelve `ticket_id` pero no
`ticket_ref` (`:233-238`). La app la necesita para reconocer su propio retorno (spec 118 y
el `getId` del spec 114).

## Diseño

### Decisión 1 — `origen` en el body, explícito

```ts
const { evento_id, user_id, cantidad, origen } = await req.json();

if (origen !== undefined && origen !== 'app') {
  return json({ error: 'origen_invalido', detail: "origen debe ser 'app' u omitirse" }, 400);
}
const desdeApp = origen === 'app';
```

La validación va junto a la de `cantidad` (`:69-74`), antes de consultar el evento: un body
inválido no debe gastar consultas ni llamar a Mercado Pago.

**Por qué rechazar un valor desconocido y no tratarlo como web:** un cliente que manda
`origen: 'ios'` por error recibiría `back_urls` de la web en silencio, y el síntoma
(«después de pagar, la app no vuelve») estaría lejísimos de la causa. La web no manda
`origen`, así que la regla no la afecta.

**Por qué un flag y no deducirlo** (del `User-Agent`, de la falta de `Origin`): son
heurísticas que cambian con cada versión de React Native y de los navegadores. Mismo
criterio que el `propio: true` del spec 112: cada modo se pide a propósito.

### Decisión 2 — las `back_urls` de la app

```ts
const volverApp = `${APP_WEB_URL}/app/volver`;
back_urls: desdeApp
  ? {
      success: `${volverApp}?compra=success&ref=${ticketRef}`,
      failure: `${volverApp}?compra=failure&ref=${ticketRef}`,
      pending: `${volverApp}?compra=pending&ref=${ticketRef}`,
    }
  : { /* las tres de hoy, sin cambios */ },
```

- **`compra` y no `status`:** Mercado Pago **agrega sus propios query params** a la
  `back_url` al volver (`collection_id`, `collection_status`, `payment_id`, `status`,
  `external_reference`, `preference_id`…). Un `status` nuestro quedaría duplicado con el
  suyo (`status=approved`). `compra` es el nombre que ya usa la web.
- **`ref` en las tres**, no solo en `success`: en `failure`/`pending` la app también tiene
  que saber de qué compra se trata para mostrarla.
- `auto_return: 'approved'`, `expires`, `payment_methods`, `notification_url`,
  `external_reference` y `metadata` no cambian: la confirmación real sigue siendo
  `webhook-mp` / `confirm-payment`, no la `back_url`.

### Decisión 3 — la respuesta suma `ticket_ref`

```ts
return json({
  preference_id: mpData.id,
  init_point: mpData.init_point,
  sandbox_init_point: mpData.sandbox_init_point,
  ticket_id: ticket.id,
  ticket_ref: ticketRef,
}, 200);
```

En los dos modos. Es un campo nuevo: la web lo ignora (`libs/purchase.js` lee solo
`init_point`/`sandbox_init_point`/`ticket_id`).

### Decisión 4 — se despliega

Un arreglo que no está desplegado no existe (`CLAUDE.md`, «Tres estados que se
desincronizan»). Este spec se cierra con la función desplegada:
`supabase functions deploy create-preference` (o el MCP con
`import_map_path: "deno.json"` explícito, ver `CLAUDE.md`). Desplegar antes que la W-245
es inocuo: ningún cliente manda `origen: 'app'` hasta el spec 118.

## Criterios de aceptación

1. `deno check supabase/functions/create-preference/index.ts` limpio.
2. `git diff` de la función: solo agrega la validación de `origen`, la rama de
   `back_urls` y `ticket_ref` en la respuesta. Las `back_urls` sin `origen` quedan
   byte a byte iguales.
3. Desplegada en producción: `get_edge_function` (MCP de Supabase) devuelve el código con
   `origen`.
4. En producción, una llamada con `origen: 'ios'` y sesión válida responde
   `400 { error: 'origen_invalido' }` sin crear ticket.

## Fuera de alcance

- `create-payment-flow` (Flow): Flow está apagado y la app no lo llama.
- La página `/app/volver`: W-245 en `sonopolisWeb`.
- Compra sin cuenta (guest checkout del spec 048, sección 2): esa rama también toca esta
  función; ver el informe de validez del 048 en el plan.
- Cambiar la confirmación: sigue por `webhook-mp` y `confirm-payment`.

## Verificación manual (candidatas a `V#` en `specs/PENDIENTES.md`)

- **V (117-a):** una compra de prueba con `origen: 'app'` crea en Mercado Pago una
  preferencia cuyas `back_urls` apuntan a `https://sonopolis.org/app/volver?compra=…&ref=…`
  (se ve en la respuesta de `GET /checkout/preferences/{id}`), y la respuesta trae
  `ticket_ref` igual a `tickets.preference_id`.
- **V (117-b):** una compra desde la web (sin `origen`) sigue volviendo a
  `/mis-entradas?compra=success&ref=…`.
