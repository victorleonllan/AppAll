# Spec 163 — El admin ve cada cobro de Pro tal como lo ve Mercado Pago

> Estado: diseñado (09-nov-2026)
> Capa: LÓGICA. Edge Function nueva `supabase/functions/cobros-pro/index.ts`. Sin migración.
> Depende de: spec 109 (`crear-suscripcion-pro` crea el plan con `external_reference = codigo`),
> spec 110 (`pro_suscripciones`, `pro_pagos`), `_shared/cuentasMP.ts`,
> `es_admin_sonopolis(p_user uuid default auth.uid())`.
> Alimenta: `sonopolisWeb` W-270 (LÓGICA) → W-271 (FRONTEND).

> **En una frase:** una Edge Function solo para el admin que, para un local o banda, devuelve
> sus suscripciones a Pro con cada cobro que Mercado Pago intentó (aprobado, rechazado y por
> qué, devuelto), con qué tipo de tarjeta, y si Sonópolis lo registró.

## Motivo

Pedido de Victor (09-nov-2026): «crearia algo apra poder ver en el crm, de que manera falló
el cobro, si es que falló y si se recibió correctamente.»

Incidente que lo origina (30-oct-2026, Quintal Clandesta): Mercado Pago cobró $20.000, los
devolvió 8 minutos después y no creó la suscripción. Sonópolis no se enteró: la fila quedó en
`esperando`, sin rastro del cobro ni de la devolución. Victor lo descubrió mirando su cuenta de
Mercado Pago, y el motivo hubo que reconstruirlo cruzando la actividad de MP con los logs de
`webhook-mp-pro`. Detalle en la nota del agente Suscripción Pro, «Incidente 30-oct».

## Por qué en vivo contra Mercado Pago y no una tabla de avisos

- **Las devoluciones no avisan al webhook.** El panel de MP solo manda «Planes y
  suscripciones» a `webhook-mp-pro`; un pago devuelto no dispara ninguno de esos tópicos. Una
  tabla alimentada por el webhook no habría visto la devolución del 30-oct.
- **Mercado Pago es la fuente de verdad del dinero.** Leerlo al abrir el CRM muestra el estado
  actual (un pago aprobado que después se devuelve aparece devuelto), sin reconciliar nada.
- **Sin capa DATOS.** No hay migración ni `db push`, así que no compite con otros specs DATOS.
- Se descartó: guardar cada aviso del webhook en una tabla nueva. Sirve para auditar el
  webhook, pero no responde «¿se devolvió?», que es la pregunta del incidente.

## Decisión

### Entrada y permiso

`POST /functions/v1/cobros-pro` con la sesión del usuario (`Authorization: Bearer <jwt>`),
cuerpo `{ "tenant_type": "venue" | "musician", "tenant_id": "<uuid>" }`. Mismo CORS que
`crear-suscripcion-pro` (con `x-client-info`; ver «Diagnóstico» paso 0 de la nota del agente).

1. Cliente con el JWT del usuario → `rpc('es_admin_sonopolis')`. Si no es `true` → **403**
   `{ "error": "solo admin" }`. Sin sesión → 401.
2. `tenant_type` fuera de `venue`/`musician` o `tenant_id` no uuid → **400**.

### Qué lee

Con service role:

- `pro_suscripciones` del tenant, `order by created_at desc limit 10`.
- `pro_pagos` de esas suscripciones.

Con `cuentaMP(suscripcion.pais).token`, por cada suscripción que tenga `mp_plan_id`
(las `anulado` sin plan se devuelven sin consultar MP), **en paralelo**:

- `GET /v1/payments/search?external_reference={codigo}&sort=date_created&criteria=desc&limit=20`
  — los cobros. El plan se crea con `external_reference = codigo` (spec 109, `index.ts:124`), y
  MP lo copia a cada pago (verificado: la operación `185824675617` del 30-oct muestra
  «Referencia externa W5Q3DXJN»).
- `GET /preapproval/search?preapproval_plan_id={mp_plan_id}&limit=10` — las suscripciones que
  MP creó para ese plan (0 filas = MP nunca dio de alta la suscripción, como el 30-oct).

Si una llamada a MP falla, esa suscripción sale con `mp_error` (texto `"MP <ruta> → <status>"`)
y las demás siguen. La función no devuelve 5xx por un error de MP.

### Qué devuelve (200)

```json
{
  "suscripciones": [
    {
      "id": "uuid", "codigo": "W5Q3DXJN", "estado": "esperando",
      "monto": 20000, "moneda": "CLP", "created_at": "…", "link_pedido_at": "…",
      "mp_plan_id": "…", "mp_preapproval_id": null,
      "mp_error": null,
      "suscripciones_mp": [
        { "id": "…", "status": "authorized|paused|cancelled|pending", "date_created": "…",
          "last_modified": "…", "next_payment_date": "…", "payment_method_id": "…" }
      ],
      "cobros": [
        { "id": "185824675617", "date_created": "…", "date_approved": "…",
          "status": "refunded", "status_detail": "refunded",
          "payment_type_id": "debit_card", "payment_method_id": "debvisa",
          "transaction_amount": 20000, "currency_id": "CLP",
          "refunds": [ { "id": "…", "date_created": "…", "amount": 20000 } ],
          "registrado": false }
      ],
      "pagos_sonopolis": [
        { "mp_pago_id": "…", "pagado_at": "…", "hasta_despues": "…", "monto": 20000 }
      ]
    }
  ]
}
```

- Los campos de `cobros` y `suscripciones_mp` se copian tal cual de MP, sin traducir: la
  traducción a texto la hace la web (W-270), para que el mapa de motivos se pueda corregir sin
  redeploy de la función.
- **No se devuelven datos del pagador** (correo, nombre, RUT) ni de la tarjeta más allá de
  `payment_type_id` y `payment_method_id`. El admin ya sabe de quién es el tenant.

### `registrado`: ¿Sonópolis anotó este cobro?

`pro_pagos.mp_pago_id` guarda el id del **authorized_payment** (aviso del webhook), no el id del
pago, y MP no documenta una búsqueda de authorized_payments por suscripción. Por eso el cruce es
por fecha:

`registrado = true` si `status = 'approved'` y existe un `pro_pagos` de **esa suscripción** con
`|pagado_at − date_approved| ≤ 48 h` que no se haya usado para otro cobro de la lista (se recorre
de más antiguo a más nuevo y cada `pro_pagos` empareja una vez). En cualquier otro estado,
`registrado = false`.

Se acepta la aproximación: con un cobro al mes, dos cobros aprobados de la misma suscripción
nunca caen a menos de 48 h. Guardar el id del pago en `pro_pagos` para cruzar exacto queda en
«Abierto».

## Criterios de aceptación

1. Sin sesión → 401. Con sesión de una cuenta que no es admin → 403 y no llama a MP (log sin
   `fetch` a `api.mercadopago.com`).
2. Admin, Quintal Clandesta (`venue`, `6a5f2a25-b086-4f3f-943f-8be57dda90ba`): devuelve la
   suscripción `W5Q3DXJN` con un cobro `185824675617`, `status` `refunded`, `payment_type_id`
   `debit_card`, `refunds` con 1 elemento, `registrado: false`, y `suscripciones_mp` vacío (o con
   el estado en que MP la haya dejado: se anota lo observado).
3. Admin, un tenant sin suscripciones → `{ "suscripciones": [] }`.
4. Con un token de MP inválido (probar en local con `MERCADOPAGO_ACCESS_TOKEN` falso): 200 con
   `mp_error` lleno en cada suscripción, nunca 5xx.
5. El JSON no contiene `payer`, `email`, `first_name` ni `identification`.

## Fuera de alcance

- Mostrarlo en la web → W-270 / W-271.
- Que el webhook marque un intento fallido o avise a Victor (idea 2 del diagnóstico del 09-nov).
- Que el dueño vea sus cobros en su panel: esta función es solo del admin.

## Abierto

- Guardar `payment.id` en `pro_pagos` para que `registrado` sea un cruce exacto (DATOS + cambio
  en `webhook-mp-pro`).
