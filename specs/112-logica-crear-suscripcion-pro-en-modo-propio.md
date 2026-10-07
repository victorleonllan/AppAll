# Spec 112 — `crear-suscripcion-pro` también crea el plan cuando lo pide el dueño del local o banda

> Estado: **aplicado y desplegado** (06-oct-2026) — `deno check` limpio (criterio 1); en producción, modo propio con `anon` → «permission denied for function pro_crear_mi_codigo» sin plan (criterio 2); modo admin con `anon` responde igual que antes (criterio 3). Pagar de verdad: V40 de sonopolisWeb.
> Capa: LÓGICA. `supabase/functions/crear-suscripcion-pro/index.ts`.
> Depende de: spec 111 (`pro_crear_mi_codigo`), spec 109 (la función).
> Alimenta: `sonopolisWeb` W-221.

> **En una frase:** con `propio: true` en el body, la función crea el código con
> `pro_crear_mi_codigo` (sesión del dueño, precio de la base) y devuelve el link de pago
> directo, reusando el plan si ya había uno esperando.

## Motivo

El spec 111 deja que la cuenta dueña cree su código; falta convertirlo en un plan de
Mercado Pago, que es lo que ya hace esta función para el admin.

## Decisión

Body `{ tenant_type, tenant_id, propio: true }`, sin `monto`. Sin `propio` todo sigue como
en el 109 (modo admin, con `monto`).

**Modo propio:**

1. RPC `pro_crear_mi_codigo` con la sesión de quien llama. Error → `{ error: mensaje }` con
   400 (403 si dice «solo la cuenta»). El permiso lo decide Postgres.
2. Si la fila trae `init_point` (código reusado) → `200 { codigo, url, init_point }` sin
   llamar a Mercado Pago.
3. Si no: mismo plan que el 109 (`preapproval_plan`, `back_url` a `/pro/{codigo}/listo`,
   `external_reference = codigo`) con `transaction_amount = monto` **de la fila**, no del
   body. Al guardar `mp_plan_id` e `init_point` con `service_role`, también
   `link_pedido_at = now()`: el link sale en esta misma respuesta.
4. Mismo manejo de errores del 109: sin cuenta de MP del país, MP falla o no se guarda el
   plan → la fila pasa a `anulado`.
5. `200 { codigo, url, init_point }`.

**Por qué un flag explícito y no "sin monto = propio":** un admin que olvida el monto no
debe terminar creando un código a precio de lista sin enterarse; con `propio` cada modo se
pide a propósito.

El modo admin queda idéntico: mismo RPC, mismo monto del body.

## Criterios de aceptación

1. `deno check` limpio.
2. En producción, modo propio con `anon` → error de Postgres, sin plan en MP.
3. Modo admin sin cambios (`git diff` solo agrega la rama `propio`).

Suscribirse de verdad desde el panel queda como `V40` de `sonopolisWeb/specs/W-PENDIENTES.md`
(ampliada): cuesta un mes de Pro.

## Fuera de alcance

- Cambiar `webhook-mp-pro`: los cobros de un código propio se registran igual que los del
  admin (por `mp_plan_id`).
