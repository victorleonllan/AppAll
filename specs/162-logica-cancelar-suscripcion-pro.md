# Spec 162 — Cancelar la suscripción a Pro en Mercado Pago desde el panel, y que el webhook cierre igual

> Estado: aplicado y **desplegado en producción** (26-oct-2026) — `cancelar-suscripcion-pro` v1 y `webhook-mp-pro` v3. `deno check` limpio en las dos (criterio 1). En producción: sin token → 401; con la anon key (JWT válido, sin cuenta) → 403 «Solo la cuenta…», sin llamar a Mercado Pago (criterio 2, ver addenda); `webhook-mp-pro` sin firma → 401 (criterio 3). Cancelar de verdad: V40.
> Capa: LÓGICA. `supabase/functions/cancelar-suscripcion-pro/index.ts` (nueva),
> `supabase/functions/webhook-mp-pro/index.ts`, `supabase/config.toml`.
> Depende de: spec 161 (`pro_mi_suscripcion`, `pro_cerrar_suscripcion`), spec 109
> (`webhook-mp-pro`, `_shared/cuentasMP.ts`).
> Alimenta: `sonopolisWeb` W-264.

> **En una frase:** una Edge Function que, con la sesión del dueño, cancela la suscripción
> en Mercado Pago y cierra la fila con `pro_cerrar_suscripcion`; y el webhook usa la misma
> función cuando la cancelación llega desde Mercado Pago.

## Motivo

Pedido de Victor (26-oct-2026): «que dentro del crm de local sea fácil cancelarlo. que
quede claro hasta qué día puede seguir usando pro.» Hoy la tarjeta dice «Cancelas cuando
quieras desde Mercado Pago»: el dueño tiene que encontrar la suscripción en su cuenta de
Mercado Pago. El token de Mercado Pago vive en los secretos de Supabase, así que la
cancelación es una Edge Function, igual que crear el plan (spec 109).

## Decisión

### `cancelar-suscripcion-pro` (`verify_jwt = true`)

Body `{ tenant_type, tenant_id }`.

1. Cliente con el `Authorization` de quien llama → `rpc('pro_mi_suscripcion', …)`.
   - Cero filas → `403 { error: 'Solo la cuenta de este local o banda puede cancelar su suscripción' }`.
   - `estado` no es `activa` ni `pausada` → `409 { error: 'No tienes una suscripción activa' }`.
2. Con `service_role`: `mp_preapproval_id` y `pais` de `pro_suscripciones` por
   `suscripcion_id`. Sin `mp_preapproval_id` → `409` igual que arriba.
3. `cuentaMP(pais)` y `PUT https://api.mercadopago.com/preapproval/{mp_preapproval_id}`
   con `{ "status": "cancelled" }`.
   - **Antes de escribirlo:** comparar contra la referencia de Mercado Pago
     (`/developers/es/reference/subscriptions/_preapproval_id/put`) el valor exacto de
     `status`. El webhook ya encontró que el `GET` escribe `canceled` con una L
     (comentario en `webhook-mp-pro`). **No adivinar**: se usa el que diga la referencia y
     se anota en la addenda.
   - Error de Mercado Pago → `502 { error: 'Mercado Pago no respondió, intenta de nuevo' }`
     y **no se toca la base**: si Mercado Pago no canceló, va a seguir cobrando.
4. Con `service_role`: `rpc('pro_cerrar_suscripcion', { p_suscripcion_id })` → la fecha.
   Si falla → `500` y log. Mercado Pago ya canceló, así que su webhook va a reintentar el
   cierre por el paso de abajo.
5. `200 { pro_hasta }`.

### `webhook-mp-pro`, tópico `subscription_preapproval`

Cuando `nuevoEstado === 'cancelada'`: en vez del `update` directo de `estado`, buscar la
fila por `mp_plan_id`, guardar `mp_preapproval_id` si faltaba y llamar a
`pro_cerrar_suscripcion(id)`. Así la fecha se ajusta igual si el dueño canceló desde
Mercado Pago. Error del RPC → `500` (Mercado Pago reintenta). Los demás estados siguen como
en el spec 109.

### `config.toml`

```toml
[functions.cancelar-suscripcion-pro]
enabled = true
verify_jwt = true
```

## Criterios de aceptación

1. `deno check` limpio en las dos funciones.
2. Con `anon` → 401; con una cuenta que no es dueña → 403, sin llamada a Mercado Pago.
3. `webhook-mp-pro` con firma inválida sigue en 401.
4. Cancelar de verdad se prueba en V40 de sonopolisWeb, con la suscripción de Quintal
   Clandesta: en Mercado Pago queda cancelada, la fila `cancelada` y la fecha en el fin del
   mes pagado.

## Fuera de alcance

- La pantalla (W-265) y la función de la web que llama a esta (W-264).

## Addenda (26-oct-2026)

- **`status` es `canceled`, con una L.** La guía de Mercado Pago
  (`/developers/en/docs/subscriptions/subscription-management`) dice «send a PUT with the
  `status` attribute and the `canceled` value». La página de referencia `…/_preapproval_id/put`
  del spec ya no existe (404); la actual es
  `/reference/online-payments/subscriptions/update-preapproval/put`.
- **Criterio 2:** «con `anon` → 401» se cumple sin `Authorization`. Con la anon key el
  gateway la acepta (es un JWT válido) y la función responde 403, porque
  `pro_mi_suscripcion` devuelve cero filas: es el mismo camino que una cuenta que no es
  dueña, que no se probó con una sesión real.
- En el webhook, la rama `cancelada` busca la fila por `mp_plan_id`, guarda
  `mp_preapproval_id` solo si faltaba y llama a `pro_cerrar_suscripcion`; los demás estados
  siguen con el `update` del spec 109.
