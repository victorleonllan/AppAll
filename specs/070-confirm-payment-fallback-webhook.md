# Spec 070 — `confirm-payment`, camino paralelo mientras el webhook no confirma pagos

> Estado: **aplicado (2-sep-2026)**, verificado contra un pago real
> (`preference_id` `a65fca57-f56a-4e96-a77c-679f21e38ceb`, ticket pasó de
> `pending` a `completed`). Causa raíz del problema que motiva este spec
> sigue **sin diagnosticar** — ver "Problema abierto" más abajo.

## Contexto

Primera compra real de punta a punta guiada desde el vault
(`02-PROJECTS/Sonópolis Web/Investigación/como-testear-una-compra.md`,
Problema 7) encontró que **`webhook-mp` nunca ha confirmado un pago real**:
las notificaciones de Mercado Pago llegan, pero `firmaValida()` las rechaza
con 401 en el 100% de los casos observados — incluso después de:

1. Verificar que el manifest (`id:...;request-id:...;ts:...;`) coincide
   exactamente con el formato documentado por MP.
2. Regenerar la `Clave secreta` del webhook dos veces desde el dashboard de
   MP y sincronizarla a Supabase inmediatamente después de cada cambio.
3. Confirmar que solo existe una aplicación de MP (`Sonopolis`,
   `1115176636276783`) — no hay confusión entre dos apps distintas.
4. Recalcular el HMAC de forma independiente en Python contra los datos
   reales del log (`xSignatureRaw`, `manifest`, secret) — el cálculo
   coincide con lo que computa `webhook-mp`, pero **nunca** con el `v1` que
   mandó MP.

Con el manifest y el cálculo confirmados correctos por partida doble
(Deno y Python de acuerdo entre sí), la variable que queda sin explicar es
qué secret usa realmente MP para firmar — no se pudo reconciliar en esta
sesión. Puede ser un delay de propagación tras regenerar la clave, o algo no
documentado de cómo MP firma notificaciones de pagos hechos por un test
user. Ver logs de diagnóstico (abajo) para retomar.

## Decisión (Victor, 2-sep-2026)

En vez de seguir bloqueado por la firma, **no depender del webhook para
confirmar el pago**: verificarlo activamente contra la API de MP desde nuestro
propio lado, con nuestro propio `MERCADOPAGO_ACCESS_TOKEN` — evita el problema
de raíz por completo porque no hay nada que MP nos tenga que firmar.

## Qué se construyó

### `supabase/functions/confirm-payment/index.ts` (nueva)

Recibe `{ ticket_id }`. Si el ticket sigue `pending`:

1. Arma `external_reference` (`evento_id|user_id`, mismo formato que
   `create-preference` ya manda a MP).
2. `GET /v1/payments/search?external_reference=...` — puede haber varios
   intentos de pago para el mismo evento+usuario (reintentos), así que
3. Filtra por `metadata.ticket_ref === tickets.preference_id` (el fix del
   Problema 7 original — la referencia propia que ya viaja en la preferencia,
   no algo nuevo).
4. Si el pago encontrado está `approved`/`paid`, hace el mismo `UPDATE` +
   `issue_ticket_items` que haría `webhook-mp` — con
   `.eq('status', 'pending')` en el UPDATE para no pisar un estado que el
   webhook ya haya puesto mientras tanto, si algún día vuelve a funcionar.

Sin policy de INSERT/UPDATE que explotar: el nuevo estado depende de lo que
MP responda para ese `ticket_ref` exacto, no de lo que mande quien llama —
alguien podría llamar con un `ticket_id` ajeno, pero solo "confirma" lo que
ya era cierto en MP.

### `libs/data/tickets.js` (sonopolisWeb) — `confirmarPago(ticketId)`

Llama a `confirm-payment`. Nunca lanza — un fallo acá no debe cortar el
polling de la pantalla de confirmación.

### `Confirmacion.js` — un `await confirmarPago(ticketId)` antes de cada
`getTicketStatus` en el polling de 3 segundos. Si `confirm-payment` confirma
el pago, el siguiente `getTicketStatus` ya lo ve `completed`.

## Qué NO cubre este spec

- **Guest checkout** (compra sin cuenta): `confirm-payment` corta con
  `guest_no_soportado_aun` porque el ticket no tiene `user_id` para armar el
  `external_reference`. Deuda técnica — ver `PENDIENTES.md`.
- **Diagnosticar por qué falla la firma** — ese problema sigue abierto. Este
  spec es un workaround deliberado, no una solución al Problema 7.

## Problema abierto — diagnóstico para retomar

`webhook-mp/index.ts` quedó con un `console.log('firmaValida debug', ...)`
temporal (no expone el secret) que imprime `manifest`, `v1Recibido` y
`esperado` en cada notificación que llega. Con eso, retomar sería:

1. Confirmar si el mismatch se resuelve solo después de un rato largo
   (¿delay de propagación real de MP tras regenerar la clave?).
2. Abrir un ticket de soporte con Mercado Pago con la evidencia ya reunida
   (manifest exacto, secret usado, hash esperado vs. recibido) — se agotaron
   las hipótesis razonables del lado del código.
3. Si se resuelve, `webhook-mp` y `confirm-payment` conviven sin conflicto
   (ambos hacen el mismo `UPDATE` idempotente) — no hace falta desarmar nada
   para volver a depender del webhook.

---

*Relacionado: [[mercado-pago]] (agente), spec 022 (webhook original),
`02-PROJECTS/Sonópolis Web/Investigación/como-testear-una-compra.md`
(Problema 7, en el vault).*
