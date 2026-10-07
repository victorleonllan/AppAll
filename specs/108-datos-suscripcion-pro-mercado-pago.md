# Spec 108 — La base guarda los códigos de suscripción a Sonópolis Pro y los cobros mensuales de Mercado Pago

> Estado: diseño (06-oct-2026).
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_108_suscripcion_pro.sql`.
> Depende de: `sonopolisWeb` W-048 (`sonopolis_pro_hasta`, trigger `guard_sonopolis_pro`),
> W-211 (`pro_cambios`, `admin_dar_pro`), spec 100 (`paises_cobro`), spec 077
> (`es_admin_sonopolis()`).
> Alimenta: spec 109 (Edge Functions de la suscripción) y `sonopolisWeb` W-213/W-214.

> **En una frase:** el admin genera un **código de suscripción** para un local o banda; cada
> código es un plan mensual de Mercado Pago, y cada cobro aprobado de ese plan corre la fecha
> `sonopolis_pro_hasta` del tenant hasta un mes después del pago.

## Motivo

Pedido de Victor (06-oct-2026): cobrar Sonópolis Pro con una suscripción mensual automática
de Mercado Pago, y generar el código a mano desde el admin con su cuenta
(`victor.leon.llanten@gmail.com`, único en `platform_admins`). Hasta hoy el cobro es manual
(W-211/W-212): Victor cobra por fuera y suma meses con un botón.

Una suscripción mensual es otro producto de Mercado Pago (`preapproval`), no el Checkout Pro
de las entradas. El gate de Pro **no cambia**: sigue siendo la fecha `sonopolis_pro_hasta`; lo
único nuevo es que un cobro aprobado la escribe sola.

## Decisión

### Un plan de Mercado Pago por código, no una suscripción con `payer_email`

Mercado Pago permite dos formas de suscripción con link de pago:

- **Suscripción sin plan** (`POST /preapproval`, `status: pending`): exige `payer_email`, y
  ese correo tiene que coincidir con la cuenta de Mercado Pago con que paga el tenant. El
  admin no conoce ese correo (puede no ser el de Sonópolis). **Descartada.**
- **Plan** (`POST /preapproval_plan`): devuelve un `init_point` que cualquiera puede pagar
  con su propia cuenta. La suscripción que nace lleva `preapproval_plan_id`. **Elegida**,
  con **un plan por código**: así el `preapproval_plan_id` identifica al tenant sin depender
  del correo del pagador. Crear planes no cuesta nada en Mercado Pago.

### Tablas

```sql
pro_suscripciones (
  id                 uuid pk default gen_random_uuid(),
  codigo             text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{8}$'),
  tenant_type        text not null check (tenant_type in ('venue','musician')),
  tenant_id          uuid not null,
  pais               char(2) not null references paises_cobro(pais),
  moneda             char(3) not null,
  monto              numeric(12,2) not null check (monto > 0),
  estado             text not null default 'esperando'
                     check (estado in ('esperando','activa','pausada','cancelada','anulado')),
  mp_plan_id         text unique,
  init_point         text,
  mp_preapproval_id  text unique,
  creado_por         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
)

pro_pagos (
  id               uuid pk default gen_random_uuid(),
  mp_pago_id       text not null unique,   -- id del authorized_payment de MP
  suscripcion_id   uuid not null references pro_suscripciones(id),
  monto            numeric(12,2) not null,
  pagado_at        timestamptz not null,
  hasta_antes      timestamptz,
  hasta_despues    timestamptz not null,
  created_at       timestamptz not null default now()
)
```

- **El código** son 8 caracteres sin los ambiguos (`0 O 1 I`): se dicta por WhatsApp sin
  confundirse. Lo genera Postgres con `gen_random_bytes`, reintentando si choca.
- **`moneda` se copia de `paises_cobro`** al crear el código: Mercado Pago Chile solo cobra
  en `CLP`. El precio de referencia US$20 (`config.pro.precioUsd`) se convierte a mano al
  generar el código; el monto queda fijo en el plan.
- **`pais` es el del tenant** (`venues.pais` o `profiles.pais`): decide con qué cuenta de
  Mercado Pago se cobra (`cuentaMP`, spec 101).
- **Estados**: `esperando` (código generado, nadie se suscribió), `activa`, `pausada`,
  `cancelada` (copian el estado de la suscripción en MP: `authorized`, `paused`,
  `cancelled`), y `anulado` (falló crear el plan en MP; el código no sirve).
- **`pro_pagos.mp_pago_id` único** es la idempotencia: Mercado Pago repite notificaciones, y
  un cobro procesado dos veces no puede sumar dos meses.
- RLS en las dos: **solo el admin lee** (`es_admin_sonopolis()`). Nadie inserta ni
  actualiza por policy: escriben las funciones de abajo y la Edge Function con
  `service_role`.

### `pro_cambios` sabe de dónde vino el cambio

```sql
alter table pro_cambios add column fuente text not null default 'admin'
  check (fuente in ('admin','mercadopago'));
alter table pro_cambios add column pago_id uuid references pro_pagos(id);
```

`por` queda `null` en los cambios de Mercado Pago. Así el historial distingue "Victor sumó un
mes" de "pagó la suscripción".

### Funciones

**`admin_crear_codigo_pro(p_tenant_type text, p_tenant_id uuid, p_monto numeric)`**
→ `table(id uuid, codigo text, pais char(2), moneda char(3), nombre text)`.
`security definer`, `es_admin_sonopolis()` adentro (mismo patrón que `admin_dar_pro`).
Valida tipo, existencia del tenant (banda = `profiles` con `role = 'musician'`) y
`p_monto > 0`; falla si el país del tenant no tiene fila activa en `paises_cobro`
(«el país del tenant no cobra todavía»). Inserta la fila en `esperando` y devuelve lo que la
Edge Function necesita para crear el plan (`nombre` = `venues.name` o `profiles.nombre`).
`grant execute … to authenticated`.

**`pro_codigo(p_codigo text)`** → `table(codigo, tenant_type, nombre, monto, moneda, estado,
init_point)`. `security definer`, `grant execute … to anon, authenticated`. Es lo único que
ve la página pública del código: nombre del tenant, precio y link de pago. No expone
`tenant_id`, ids de Mercado Pago ni quién lo creó. Código inexistente → cero filas.

**`pro_registrar_pago(p_mp_pago_id text, p_mp_plan_id text, p_mp_preapproval_id text,
p_monto numeric, p_pagado_at timestamptz)`** → `timestamptz`. `security definer`,
**solo `service_role`** (`revoke … from public, anon, authenticated`). En una transacción:

1. Busca la suscripción por `mp_plan_id`; si no existe → excepción
   `suscripcion_desconocida`.
2. `p_monto < monto` de la suscripción → excepción `monto_menor_al_plan` (misma guarda que
   `finalizarTicket`, spec 105).
3. Inserta en `pro_pagos` con `on conflict (mp_pago_id) do nothing`; si ya existía, devuelve
   la fecha actual del tenant **sin tocar nada**.
4. Nueva fecha: `greatest(coalesce(hasta_actual, now()), p_pagado_at + interval '1 month'
   + interval '3 days')`.
5. Actualiza `sonopolis_pro_hasta`, completa `mp_preapproval_id` si estaba vacío, pone la
   suscripción en `activa` y escribe `pro_cambios` con `fuente = 'mercadopago'`.

**Por qué `greatest(…, pago + 1 mes + 3 días)` y no "sumar 30 días":** sumar acumula
desfase (12 cobros × 30 días = 360, no un año) y sumaría dos veces si un mes llega un pago
manual y uno automático. Anclar al día del pago vuelve el cálculo idempotente y respeta los
días que Victor haya regalado a mano. Los **3 días de gracia** cubren el reintento de
Mercado Pago cuando una tarjeta falla el día del cobro: Pro no se apaga por un rechazo que
se arregla al día siguiente. Si el cobro no se recupera, la fecha vence sola — no hay que
apagar nada.

**Cancelar no apaga Pro:** cuando el tenant cancela, la suscripción pasa a `cancelada` pero
la fecha queda donde estaba. Pagó el mes, usa el mes.

## Criterios de aceptación

1. Con la sesión del admin (claims en transacción con `rollback`):
   `admin_crear_codigo_pro('venue', <id>, 19000)` devuelve un código de 8 caracteres válidos,
   `pais = 'CL'`, `moneda = 'CLP'`, y deja una fila `esperando`.
2. Una sesión `authenticated` no admin → excepción; `anon` → permission denied.
3. `pro_codigo(<codigo>)` como `anon` devuelve nombre, monto, moneda, estado e `init_point`;
   con un código inexistente, cero filas.
4. Como `service_role`, tras poner un `mp_plan_id` a la fila: `pro_registrar_pago('p1', …,
   19000, now())` deja `hasta ≈ now() + 1 mes + 3 días`, una fila en `pro_pagos`, una en
   `pro_cambios` con `fuente = 'mercadopago'` y la suscripción `activa`.
5. Repetir el mismo `p_mp_pago_id` no cambia la fecha ni inserta filas.
6. `pro_registrar_pago` con `p_monto` menor → excepción, sin escribir. Como `authenticated`
   → permission denied.
7. `admin_dar_pro` (W-211) sigue funcionando y escribe `fuente = 'admin'`.

## Fuera de alcance

- Crear el plan en Mercado Pago y recibir sus avisos (spec 109).
- Cancelar o pausar una suscripción desde Sonópolis: se hace desde Mercado Pago.
- Cambiar el precio de un código ya generado: se genera otro.
