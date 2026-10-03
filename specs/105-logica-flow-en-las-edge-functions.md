# Spec 105 — Flow cobra, confirma y reconcilia en las Edge Functions, al lado de Mercado Pago

> Estado: **propuesto**.
> Capa: LÓGICA. `supabase/functions/_shared/flow.ts` (nuevo),
> `supabase/functions/_shared/finalizarTicket.ts` (nuevo),
> `supabase/functions/create-payment-flow/index.ts` (nueva),
> `supabase/functions/webhook-flow/index.ts` (nueva),
> `supabase/functions/confirm-payment/index.ts`, `supabase/functions/create-preference/index.ts`,
> `supabase/config.toml`.
> Depende de: spec 104 (`pasarelas_cobro`, `tickets.pasarela`, reserva con `p_pasarela`).
> **No se despliega antes de que el 104 esté en producción.**
> Habilita: `sonopolisWeb/specs/w189-logica-pagar-con-flow.md`.

> **En una frase:** dos Edge Functions nuevas (`create-payment-flow` crea el cobro en Flow,
> `webhook-flow` recibe su aviso) y una rama de Flow en `confirm-payment`, para que un
> ticket pagado con Flow termine `completed`, con sus entradas emitidas y su correo
> enviado, por los mismos caminos que uno de Mercado Pago.

## Contexto

Spec 104 deja dicho en la base qué pasarelas tiene cada país y con cuál se reservó cada
ticket. Falta el código que habla con Flow. Hoy las cuatro Edge Functions de pago hablan
solo con Mercado Pago:

- `create-preference` crea la preferencia de MP y después reserva.
- `webhook-mp` valida la firma de MP. En producción la firma nunca coincidió (Problema 7
  de la guía de MP), así que **en la práctica no confirma nada**.
- `confirm-payment` busca el pago en MP por `external_reference` y `metadata.ticket_ref`.
  Es el camino que confirma de verdad: lo llaman la pestaña de espera
  (`/compra/confirmacion`), la vuelta de MP (`/mis-entradas?ref=`) y el cron.
- `reconciliar-pagos` no habla con MP. Llama a `confirm-payment` por cada ticket `pending`
  de los últimos 7 días, y cancela **solo** si la respuesta trae exactamente
  `detail: 'sin_pago_encontrado_aun'` y el ticket tiene más de 2 horas.

### Cómo funciona Flow (API REST, referencia en developers.flow.cl/api)

- **Base URL:** producción `https://www.flow.cl/api`, sandbox `https://sandbox.flow.cl/api`.
- **Autenticación:** cada llamada lleva `apiKey` y una firma `s`. La firma se calcula así:
  se ordenan los parámetros por nombre (sin `s`), se concatena `nombre + valor` de cada
  uno, y se aplica HMAC-SHA256 con la `secretKey` de la cuenta, en hexadecimal.
- **`POST /payment/create`** (form-urlencoded): `commerceOrder`, `subject`, `currency`,
  `amount`, `email`, `paymentMethod` (9 = todos los medios), `urlConfirmation`,
  `urlReturn`, `timeout` (segundos hasta que la orden expira), `optional` (JSON). Responde
  `{ url, token, flowOrder }`. El comprador paga en `url + "?token=" + token`.
- **`urlConfirmation`:** Flow le hace un POST form-urlencoded con `token`. El comercio
  llama a `GET /payment/getStatus?token=…` para saber el resultado.
- **`urlReturn`:** Flow devuelve al comprador con un **POST** form-urlencoded con `token`.
- **`GET /payment/getStatusByCommerceId?commerceId=…`:** el mismo estado, buscado por
  nuestra referencia. No necesita el token.
- **Estado (`status`):** 1 pendiente de pago · 2 pagada · 3 rechazada · 4 anulada.
  `amount` y `currency` vienen en la respuesta.

**Antes de escribir la tabla de estados y la firma, el implementador las comprueba contra
la referencia oficial y contra el sandbox** (una orden de prueba creada y consultada). Si
algo de lo de arriba no coincide, manda la referencia y se anota como addenda con fecha en
este spec.

## Decisión 1 — credenciales de Flow por país, como las de MP

`_shared/flow.ts` exporta `cuentaFlow(pais)`, con el mismo patrón que `cuentaMP` (spec
101):

```ts
const SECRETOS = {
  CL: { apiKey: Deno.env.get('FLOW_API_KEY_CL'), secretKey: Deno.env.get('FLOW_SECRET_KEY_CL') },
  MX: { apiKey: Deno.env.get('FLOW_API_KEY_MX'), secretKey: Deno.env.get('FLOW_SECRET_KEY_MX') },
};
const FLOW_API_URL = Deno.env.get('FLOW_API_URL') ?? 'https://www.flow.cl/api';
```

- `throw` si faltan las credenciales del país, **nunca** un fallback a otro país. Cobrar
  con la cuenta equivocada es el error que el spec 101 cerró para MP.
- Una cuenta por país porque Flow Chile y Flow México son comercios distintos: el registro
  mexicano pide alta en el SAT y deposita en una cuenta mexicana.
- `FLOW_API_URL` es un solo secret para todo el proyecto. Apuntarlo al sandbox prueba los
  dos países sin tocar código.

Mismo archivo:

- `firmar(params, secretKey)`: la firma descrita arriba, con `crypto.subtle` (HMAC SHA-256).
- `flowGet(cuenta, path, params)` y `flowPost(cuenta, path, params)`: agregan `apiKey` y
  `s`, y lanzan error con el cuerpo de la respuesta si el status no es 2xx. Tirar el
  cuerpo es el bug que costó caro en el spec 021.
- `ESTADO_FLOW: Record<number, 'completed' | 'cancelled' | null>`:
  `{ 1: null, 2: 'completed', 3: 'cancelled', 4: 'cancelled' }`. Con `null` el ticket
  sigue `pending`.

## Decisión 2 — `create-payment-flow`: primero se reserva, después se cobra

Misma entrada que `create-preference`: `{ evento_id, user_id, cantidad }` más el token de
sesión. Mismas validaciones, en el mismo orden: sesión y `user_id`, `cantidad` entre 1 y
10, evento existe, `precio_vigente_de` con `se_vende` (409 `pais_sin_cobro`).

Después:

1. Flow activo para el país: si `pasarelas_cobro` no tiene `(evento.pais, 'flow', activo)`,
   responde **409 `pasarela_inactiva`** sin reservar. La reserva también lo valida (spec
   104), pero acá se corta antes, con un error que la web sabe traducir.
2. `cuentaFlow(evento.pais)`: si faltan secrets, **500 `cuenta_flow_no_configurada`**.
3. `ticketRef = crypto.randomUUID()`.
4. **Reserva**: `reservar_ticket_pending(p_evento_id, p_cantidad, p_preference_id: ticketRef, p_pasarela: 'flow')`.
   Los errores se traducen igual que en `create-preference` (`sin_cupo`, `pais_sin_cobro`,
   más `pasarela_inactiva`).
5. **Cobro en Flow**: `POST /payment/create` con
   - `commerceOrder`: `ticketRef`
   - `subject`: `Entrada: <artist_name> - <venue_name>` (con ` ×N` si `cantidad > 1`)
   - `currency`: `ticket.moneda`
   - `amount`: `ticket.monto` (el total que calculó la reserva: precio vigente × cantidad)
   - `email`: el de la sesión
   - `paymentMethod`: `9`
   - `urlConfirmation`: `${SUPABASE_URL}/functions/v1/webhook-flow?cuenta=${pais}`
   - `urlReturn`: `${APP_WEB_URL}/api/flow/retorno?ref=${ticketRef}`
   - `timeout`: `1800` (30 minutos)
   - `optional`: `{"ticket_id":"<ticket.id>"}`
6. Si Flow responde error: el ticket recién reservado pasa a `cancelled`
   (`.eq('status','pending')`) para devolver el cupo en el acto, y se responde **502
   `flow_create_failed`** con el cuerpo de Flow en `detail`.
7. Responde `{ checkout_url: url + "?token=" + token, ticket_id, pasarela: 'flow' }`.

**Por qué al revés que `create-preference` (reserva primero, cobro después):** el monto que
se cobra sale de la reserva, que es la única fuente de verdad del precio (preventa, cupo,
cantidad). Con el orden de MP, un fallo de la reserva deja un link de pago vivo para un
ticket que no existe. Con este orden, un fallo de Flow deja un ticket reservado, y el paso
6 lo libera en el acto. **`create-preference` no se reordena:** funciona en producción, y
cambiarlo no es parte de integrar Flow.

**Por qué `timeout: 1800`:** son los 30 minutos de `ticket_reserva_ttl()` (spec 088) y de
`RESERVA_TTL_MINUTOS` en `create-preference`. A esa hora el aforo deja de contar el ticket,
así que la orden de Flow tiene que morir con él. Si no, alguien paga a los 45 minutos una
entrada ya revendida. Ahora el número vive en tres lugares: el comentario de la constante
nombra los otros dos.

**`paymentMethod: 9` incluye medios en efectivo** (en México, pago en tienda). MP los
excluye (spec 072) porque se aprueban horas después y caerían sobre una reserva vencida.
Con Flow, el `timeout` de 30 minutos cierra la orden antes de que eso pase. Que de verdad
lo haga con un voucher en efectivo se verifica en sandbox (V en `PENDIENTES.md`). Si no lo
hace, el arreglo es un `paymentMethod` que liste solo los inmediatos, en un spec propio.

**Descartado — un solo `create-preference` con un parámetro `pasarela`:** mezcla dos
contratos de respuesta y dos órdenes de operación en la función que hoy vende. Una función
por pasarela deja la de MP intacta, y la web elige a cuál llamar (W-189).

## Decisión 3 — `webhook-flow`: el aviso de Flow, verificado preguntándole a Flow

`POST` form-urlencoded con `token`, y `?cuenta=<pais>` en la URL (lo puso
`create-payment-flow`). Pasos:

1. `cuentaFlow(cuenta)` (sin `?cuenta=`, responde 400: toda orden de Flow nace con él).
2. `flowGet(cuenta, '/payment/getStatus', { token })`.
3. Busca el ticket por `preference_id = commerceOrder`. Si no existe, responde 200 y deja
   un log (no hay nada que Flow pueda reintentar con éxito).
4. `finalizarTicket(...)` (Decisión 5).
5. Responde 200. Responde 500 solo si falló la consulta a Flow o `issue_ticket_items`: son
   los dos casos en que un reintento puede salir bien.

**Por qué no hay firma que validar:** Flow no firma el POST de confirmación, solo manda un
token. La garantía es que el estado se le pide a Flow con nuestra `secretKey`: un POST
falso con un token inventado devuelve error en `getStatus`, y uno con un token real solo
puede confirmar lo que Flow dice. Por eso este webhook sí va a confirmar en producción, a
diferencia de `webhook-mp`.

`config.toml`: `[functions.webhook-flow]` y `[functions.create-payment-flow]` con
`verify_jwt = false`, igual que `webhook-mp` y `create-preference` (Flow no manda un JWT de
Supabase, y `create-payment-flow` valida la sesión a mano).

## Decisión 4 — `confirm-payment` pregunta según `tickets.pasarela`

La función ya busca el ticket y corta si no está `pending`. Se agrega `pasarela` al
`select` y, **antes de la guarda de invitado**, una rama:

```ts
if (ticket.pasarela === 'flow') {
  const cuenta = cuentaFlow(ticket.pais_cobro);
  const estado = await flowGet(cuenta, '/payment/getStatusByCommerceId', { commerceId: ticket.preference_id });
  // status 1 (pendiente) → { status: 'pending', detail: 'sin_pago_encontrado_aun' }
  // 2/3/4 → finalizarTicket(...) y { status: nuevoEstado }
}
```

- **`sin_pago_encontrado_aun` para el estado 1, a propósito.** Es el texto exacto con el
  que `reconciliar-pagos` decide cancelar un ticket abandonado de más de 2 horas. Con
  cualquier otro texto, los tickets de Flow abandonados quedarían `pending` para siempre,
  y aunque el aforo los deja de contar a los 30 minutos (spec 088), ensucian las ventas y
  el aviso de pagos pendientes.
- Un error de Flow al consultar (red, 5xx) responde 502 `flow_status_failed`: el cron lo
  cuenta como error y lo reintenta en la próxima corrida, sin cancelar.
- **Con Flow, el invitado sí se puede confirmar.** La búsqueda es por `commerceId` y no
  necesita `user_id`. Por eso la rama va antes de `guest_no_soportado_aun`. Hoy ningún
  invitado compra (el RPC de invitado no tiene llamadores), pero no se le cierra la puerta.
- La rama de Mercado Pago no cambia ni una línea.

`reconciliar-pagos` no cambia: llega a Flow a través de `confirm-payment`.

## Decisión 5 — `_shared/finalizarTicket.ts`: un solo cierre para los dos caminos de Flow

`webhook-flow` y la rama de Flow de `confirm-payment` terminan igual. Las dos llaman a:

```ts
finalizarTicket(supabase, ticket, { nuevoEstado, paymentId, monto, moneda })
```

1. **Si `nuevoEstado === 'completed'`, primero se compara el cobro con la reserva:**
   `monto === ticket.monto` y `moneda === ticket.moneda`. Si no coinciden, no se completa:
   log de error y respuesta `{ status: 'pending', detail: 'monto_no_coincide' }`. Con ese
   texto `reconciliar-pagos` tampoco lo cancela, y queda a la vista para revisarlo a mano.
   Es una guarda barata contra cobrar un monto y entregar otro.
2. `UPDATE tickets SET status, payment_id = flowOrder WHERE id = … AND status = 'pending'`.
   La guarda de `pending` evita pisar lo que el otro camino ya resolvió. `webhook-mp` no la
   tiene, y por eso puede revivir un ticket cancelado.
3. Si quedó `completed`: `issue_ticket_items`, y después el aviso fire-and-forget a
   `/api/entradas/enviar-confirmacion`, copiado de `confirm-payment`. El candado
   `entrada_enviada_at` (W-122) evita el correo doble cuando corren el webhook y la
   confirmación a la vez.

**Fuera:** pasar `webhook-mp` y la rama MP de `confirm-payment` a este helper. Sería lo
correcto a la larga, pero toca el camino que hoy cobra. Queda en `PENDIENTES.md`.

## Decisión 6 — `create-preference` respeta `pasarelas_cobro`

Dos líneas de cambio:

- Antes de crear la preferencia en MP: si `(evento.pais, 'mercadopago')` no está activa en
  `pasarelas_cobro`, responde **409 `pasarela_inactiva`**. Sin esto, el día que México se
  encienda solo con Flow, la app nativa (que siempre llama a `create-preference`) crearía
  una preferencia de MP que después la reserva rechaza.
- La llamada a `reservar_ticket_pending` pasa `p_pasarela: 'mercadopago'` explícito, en vez
  de depender del DEFAULT del spec 104.

## Trabajo

1. `_shared/flow.ts`: `cuentaFlow`, `firmar`, `flowGet`, `flowPost`, `ESTADO_FLOW`.
2. `_shared/finalizarTicket.ts` (Decisión 5).
3. `create-payment-flow/index.ts` + su `deno.json` (copia del de `create-preference`).
4. `webhook-flow/index.ts` + `deno.json`.
5. `confirm-payment/index.ts`: `pasarela` en el `select` y la rama de Flow.
6. `create-preference/index.ts`: Decisión 6.
7. `config.toml`: las dos funciones nuevas.
8. Secrets (los carga Victor, nunca quedan en el repo):
   `FLOW_API_KEY_CL`, `FLOW_SECRET_KEY_CL` y `FLOW_API_URL`. Primero el sandbox para
   probar, después producción. México (`_MX`) cuando exista su cuenta.
9. Deploy: `supabase functions deploy create-payment-flow webhook-flow confirm-payment create-preference`.

## Criterios de aceptación

1. `rg -n "FLOW_" supabase/functions` solo encuentra las claves en `_shared/flow.ts`.
2. `firmar` reproduce la firma de un ejemplo calculado aparte (por ejemplo, con
   `openssl dgst -sha256 -hmac`), sobre los mismos parámetros ordenados.
3. Con Flow apagado en Chile (estado del spec 104), `create-payment-flow` para un evento
   chileno responde 409 `pasarela_inactiva` y no crea ningún ticket.
4. `create-preference` sigue respondiendo 200 con `init_point` para un evento chileno, y el
   ticket queda con `pasarela = 'mercadopago'`.
5. `confirm-payment` con un ticket de MP devuelve lo mismo que antes del cambio.
6. Las cuatro funciones despliegan sin error de bundling.

Lo que pide Flow encendido y una orden real o de sandbox (crear, pagar, confirmar por
webhook y por `confirm-payment`, anular, voucher en efectivo, monto que no coincide) va
como `V` en `PENDIENTES.md`, no acá.

## Fuera de alcance

- Encender Flow en Chile o México (spec DATOS de una línea, ver spec 104).
- La web: llamar a `create-payment-flow`, la ruta `/api/flow/retorno` y el selector de
  pasarela (W-189 y W-190).
- La app nativa: sigue comprando solo con MP. Con un país solo-Flow, responde 409
  `pasarela_inactiva` y muestra su error genérico. Queda en `PENDIENTES.md`.
- Reembolsos (`/refund/create`): ni MP ni Flow los tienen automatizados.
- Pasar el camino de MP a `finalizarTicket`.
