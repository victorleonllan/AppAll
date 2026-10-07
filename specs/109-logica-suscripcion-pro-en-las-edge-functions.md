# Spec 109 — Las Edge Functions crean el plan de Sonópolis Pro en Mercado Pago y reciben sus cobros

> Estado: aplicado y **desplegado en producción** (06-oct-2026): `crear-suscripcion-pro` y `webhook-mp-pro` deployadas; criterio 4 verificado en producción (sin firma → 401) y criterio 3 (con `anon` → «permission denied for function admin_crear_codigo_pro», sin plan). Criterio 2 sin verificar: crea un plan real. Falta el webhook en el panel de MP (paso manual). Verificado antes: `deno check` limpio en las
> dos funciones y `_shared/firmaMP.ts` (criterio 1); `npx tsc --noEmit` sin errores nuevos fuera
> de los de entorno Deno que ya tienen todas las Edge Functions; `git diff` vacío en `webhook-mp`
> (criterio 5). Criterios 2-4 piden la función desplegada contra la base con el 110 pusheado:
> pendientes. Ver «Bugs encontrados al aplicar».
> Capa: LÓGICA. `supabase/functions/_shared/firmaMP.ts` (nuevo),
> `supabase/functions/crear-suscripcion-pro/index.ts` (nueva),
> `supabase/functions/webhook-mp-pro/index.ts` (nueva), `supabase/config.toml`.
> Depende de: spec 108 (`pro_suscripciones`, `pro_pagos`, `admin_crear_codigo_pro`,
> `pro_registrar_pago`). **No se despliega antes de que el 108 esté en producción.**
> Alimenta: `sonopolisWeb/specs/w213-logica-codigo-de-suscripcion-pro.md`.

> **En una frase:** `crear-suscripcion-pro` convierte un código del admin en un plan mensual
> de Mercado Pago con su link de pago, y `webhook-mp-pro` escucha las suscripciones y los
> cobros de esos planes para correr la fecha de Pro del tenant.

## Decisión

### `_shared/firmaMP.ts`

Mueve a un archivo compartido `hmacSha256Hex`, `igualesEnTiempoConstante` y
`firmaValida(req, url, webhookSecret)` **copiándolos tal cual** de `webhook-mp`.
`webhook-mp` **no se toca** en este spec: es el que confirma las entradas pagadas, y
cambiarlo para ahorrar 40 líneas duplicadas no vale el riesgo. Queda la duplicación anotada
en `PENDIENTES.md`.

### `crear-suscripcion-pro` (con JWT)

`POST { tenant_type, tenant_id, monto }`, mismos CORS que `create-preference`.

1. Cliente con el `Authorization` del que llama → `rpc('admin_crear_codigo_pro', …)`.
   **El permiso lo decide Postgres** (spec 108); la función no revisa si es admin por su
   cuenta. Error del RPC → 403/400 con el mensaje tal cual.
2. `cuentaMP(pais)` (spec 101). Sin cuenta → marca el código `anulado` y responde 409
   `cuenta_mp_no_configurada`.
3. `POST https://api.mercadopago.com/preapproval_plan` con el token de esa cuenta:

   ```json
   {
     "reason": "Sonópolis Pro — {nombre}",
     "external_reference": "{codigo}",
     "auto_recurring": {
       "frequency": 1,
       "frequency_type": "months",
       "transaction_amount": {monto},
       "currency_id": "{moneda}"
     },
     "back_url": "{APP_WEB_URL}/pro/{codigo}/listo"
   }
   ```

   Sin `free_trial`: el primer cobro es el día que se suscribe.
4. Con `service_role`: guarda `mp_plan_id` (`id` de la respuesta) e `init_point`.
5. Responde `{ codigo, url: "{APP_WEB_URL}/pro/{codigo}", init_point }`.

Si Mercado Pago responde error: marca el código `anulado` y responde 502 con el mensaje de
MP. Un código sin plan no puede quedar `esperando`, porque la página pública mostraría un
botón que no lleva a ningún lado.

### `webhook-mp-pro` (`verify_jwt = false`)

Mercado Pago no manda un JWT de Supabase. Se verifica con `x-signature` (mismo esquema que
`webhook-mp`, spec 022) usando `cuentaMP(url.searchParams.get('cuenta') ?? 'CL')`. Firma
inválida → 401.

Los planes **no aceptan `notification_url`** como las preferencias: los avisos de
suscripción llegan a la URL configurada en el panel de la aplicación de Mercado Pago (ver
"Paso manual"). Por eso es una función aparte y no una rama de `webhook-mp`: el panel apunta
aquí solo los tópicos de suscripción, y los pagos de entradas siguen llegando a `webhook-mp`
por la `notification_url` de cada preferencia.

Tópicos (`type` del cuerpo o `topic`/`type` del query, igual que `webhook-mp`):

- **`subscription_preapproval`**: `GET /preapproval/{id}` → `preapproval_plan_id`, `status`.
  Si el plan es de un código, actualiza `estado` (`authorized` → `activa`, `paused` →
  `pausada`, `cancelled` → `cancelada`; `pending` no cambia nada) y `mp_preapproval_id`. Plan
  desconocido → 200 y log: puede ser una suscripción que no es de Pro.
- **`subscription_authorized_payment`**: `GET /authorized_payments/{id}`. Solo si el pago
  del cobro (`payment.status`) es `approved`: `GET /preapproval/{preapproval_id}` para el
  `preapproval_plan_id`, y `rpc('pro_registrar_pago', { p_mp_pago_id: id, p_mp_plan_id,
  p_mp_preapproval_id, p_monto: transaction_amount, p_pagado_at })`. Cualquier otro estado
  → 200 y log (Mercado Pago avisa de nuevo cuando el reintento sale).
- Otro tópico → 200.

Errores de red, de Mercado Pago o del RPC → **500**, para que Mercado Pago reintente
(misma regla que `webhook-mp`). `suscripcion_desconocida` → 200 y log: reintentar no lo
arregla.

**Antes de escribir `webhook-mp-pro`:** comparar contra la referencia de Mercado Pago
(`/developers/es/reference/subscriptions/_authorized_payments_id/get` y
`_preapproval_id/get`) los nombres `preapproval_id`, `transaction_amount`,
`payment.status` y la fecha del cobro. **No adivinar la forma de la respuesta**; si un
nombre difiere, se usa el real y se anota en la addenda.

### `config.toml`

```toml
[functions.crear-suscripcion-pro]
enabled = true
verify_jwt = true

[functions.webhook-mp-pro]
enabled = true
# Mercado Pago no manda JWT: se verifica la firma x-signature (spec 022).
verify_jwt = false
```

### Paso manual (Victor, en el panel de Mercado Pago)

Tus integraciones → la aplicación de Sonópolis (Chile) → Webhooks → modo productivo:

- URL: `https://xluinfihjjtxkglihxqz.supabase.co/functions/v1/webhook-mp-pro?cuenta=CL`
- Eventos: **Planes y suscripciones** (`subscription_preapproval`,
  `subscription_authorized_payment`). **No marcar "Pagos"**: los de entradas ya llegan por
  `notification_url` y marcarlo los duplicaría hacia esta función.
- La clave secreta del panel es la misma de `MERCADOPAGO_WEBHOOK_SECRET` (una por
  aplicación); si el panel muestra otra, se carga esa.

## Criterios de aceptación

1. `deno check` sin errores en las funciones nuevas y en `_shared/firmaMP.ts`.
2. `crear-suscripcion-pro` con la sesión del admin y un tenant `CL` → 200 con `codigo`,
   `url` e `init_point` de `mercadopago.cl`; la fila queda con `mp_plan_id`. El plan se ve
   en `GET /preapproval_plan/{id}` con el monto y `CLP`.
3. Con una sesión no admin → error del RPC, sin plan creado en Mercado Pago.
4. `webhook-mp-pro` con firma inválida → 401; sin firma → 401.
5. `webhook-mp` sigue igual (`git diff` vacío en su carpeta).

El ciclo con un cobro real (suscribirse, ver la fecha correr, cancelar) queda como `V` en
`PENDIENTES.md`: cuesta un mes de Pro real.

## Fuera de alcance

- Cancelar, pausar o cambiar el monto de una suscripción desde Sonópolis.
- México: el código funciona igual con `MERCADOPAGO_ACCESS_TOKEN_MX` cuando `paises_cobro`
  active MX; hoy `admin_crear_codigo_pro` lo rechaza.

## Addenda (06-oct-2026) — depende del 110, no del 108

El 108 quedó superado por el **spec 110** antes de implementarse (la suscripción se ata a la
cuenta de Sonópolis del tenant). Para este spec cambia poco:

- **Depende del 110.** `admin_crear_codigo_pro` y `pro_registrar_pago` conservan nombre y
  parámetros. `admin_crear_codigo_pro` además devuelve `correo_cuenta` y rechaza un tenant
  sin cuenta («este local no tiene cuenta en Sonópolis…»): ese error vuelve tal cual como
  400, igual que cualquier otro error del RPC, **sin crear plan en Mercado Pago**.
- `crear-suscripcion-pro` agrega `correo_cuenta` a su respuesta.
- `back_url` y `webhook-mp-pro` no cambian. El link de pago ya no lo entrega esta función a
  la página pública: lo entrega `pro_link_de_pago` (110) a la cuenta dueña con sesión. La
  función sigue devolviendo `init_point` al admin, que lo necesita solo para verificar.

## Bugs encontrados al aplicar (06-oct-2026)

Comparado contra la referencia de Mercado Pago (`/reference/online-payments/subscriptions/
get-authorized-payment/get` y `get-preapproval/get`; las rutas `_authorized_payments_id/get`
del spec ya responden 404):

- **`canceled`, no `cancelled`.** La referencia de `GET /preapproval/{id}` lista los estados
  `pending`, `authorized`, `paused` y `canceled` (una L). `webhook-mp-pro` mapea las dos
  grafías a `cancelada`: con solo la del spec, una cancelación real no cambiaba nada.
- **El cobro no trae fecha de aprobación.** `GET /authorized_payments/{id}` devuelve
  `debit_date` (fecha en que MP cobra o reintenta), `date_created` y `last_modified`; `payment`
  trae solo `id`, `status` y `status_detail`. `p_pagado_at` usa `debit_date`, y si falta
  `last_modified`. El desfase con la aprobación real es de minutos a horas, menor que los 3
  días de gracia de `pro_registrar_pago`.
- **`transaction_amount` viene como string** en el ejemplo de la referencia (`"25"`). Se
  convierte con `Number()` antes de `p_monto`.
- `preapproval_id`, `payment.status` y `preapproval_plan_id` coinciden con el spec.

