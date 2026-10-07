# Spec 110 — La suscripción a Sonópolis Pro queda atada a la cuenta de Sonópolis del local o banda

> Estado: aplicado y **pusheado a producción** (06-oct-2026) — `20261006222008_spec_110_suscripcion_pro.sql`, única migración pendiente. En producción: `pro_codigo` como `anon` con código inexistente → `[]`; `pro_link_de_pago` como `anon` → permission denied (criterio 4-5 parcial). Los 7 criterios verificados en la base local (migraciones 091→110 en una transacción revertida). **Supera al spec 108**, que no se implementó.
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_110_suscripcion_pro.sql`.
> Depende de: `sonopolisWeb` W-048 (`sonopolis_pro_hasta`, trigger `guard_sonopolis_pro`),
> W-211 (`pro_cambios`, `admin_dar_pro`), spec 100 (`paises_cobro`), spec 077
> (`es_admin_sonopolis()`).
> Alimenta: spec 109 (Edge Functions; usa `admin_crear_codigo_pro` y `pro_registrar_pago`
> con las mismas firmas que definía el 108) y `sonopolisWeb` W-215/W-216.

> **En una frase:** el admin genera un **código de suscripción** para un local o banda que
> tiene cuenta en Sonópolis; solo esa cuenta, con su sesión iniciada, recibe el link de pago
> de Mercado Pago; y cada cobro aprobado corre la fecha `sonopolis_pro_hasta` de ese tenant.

## Motivo

Pedido de Victor (06-oct-2026): cobrar Sonópolis Pro con una suscripción mensual automática
de Mercado Pago, generando el código a mano desde el admin con su cuenta
(`victor.leon.llanten@gmail.com`, único en `platform_admins`).

**Por qué supera al 108.** En el 108 el link de pago era público: cualquiera con el código
podía suscribirse, y nada exigía que el local tuviera cuenta en Sonópolis. Victor pidió que
la suscripción quede **asociada a una cuenta de Sonópolis**, porque Pro se activa en esa
cuenta y el correo con que se paga en Mercado Pago puede no ser el de ninguna cuenta. Este
spec conserva todo el 108 y agrega:

1. **No hay código sin cuenta.** Un local sin `owner_id` no puede recibir un código.
2. **El admin ve a qué cuenta va** (su correo) antes de generar el código.
3. **Solo la cuenta del tenant, con sesión, obtiene el link de pago.** La página pública
   muestra el precio y el correo enmascarado de la cuenta, pero no el link.

El correo de Mercado Pago sigue sin importar: el pago se asocia al tenant por el plan, no
por quien paga. Lo que este spec asegura es que **quien se suscribe es la cuenta dueña**.

## Decisión

### Un plan de Mercado Pago por código, no una suscripción con `payer_email`

Mercado Pago permite dos formas de suscripción con link de pago:

- **Suscripción sin plan** (`POST /preapproval`, `status: pending`): exige `payer_email`, y
  ese correo tiene que coincidir con la cuenta de Mercado Pago del que paga. El correo de
  Sonópolis puede no ser el de Mercado Pago, y el pago fallaría. **Descartada.**
- **Plan** (`POST /preapproval_plan`): devuelve un `init_point` que se paga con cualquier
  cuenta de Mercado Pago. La suscripción que nace lleva `preapproval_plan_id`. **Elegida**,
  con **un plan por código**: el `preapproval_plan_id` identifica al tenant sin depender del
  correo del pagador.

### La cuenta de un tenant

- **Local** (`venue`): la cuenta es `venues.owner_id`. Sin `owner_id` → no hay cuenta.
- **Banda** (`musician`): la cuenta es el propio `profiles.id` (`role = 'musician'`).

Función interna `pro_cuenta_del_tenant(p_tenant_type, p_tenant_id)` → `uuid` (o `null`),
`security definer`, sin `grant` a nadie: la usan las funciones de abajo.

### Tablas

```sql
pro_suscripciones (
  id                 uuid pk default gen_random_uuid(),
  codigo             text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{8}$'),
  tenant_type        text not null check (tenant_type in ('venue','musician')),
  tenant_id          uuid not null,
  cuenta_id          uuid not null references auth.users(id),
  correo_cuenta      text not null,
  pais               char(2) not null references paises_cobro(pais),
  moneda             char(3) not null,
  monto              numeric(12,2) not null check (monto > 0),
  estado             text not null default 'esperando'
                     check (estado in ('esperando','activa','pausada','cancelada','anulado')),
  mp_plan_id         text unique,
  init_point         text,
  mp_preapproval_id  text unique,
  link_pedido_at     timestamptz,
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

- **`cuenta_id` y `correo_cuenta`** registran a qué cuenta se le generó el código, con el
  correo que tenía en ese momento. Es el historial que Victor lee en el admin.
- **`link_pedido_at`**: cuándo la cuenta dueña pidió el link de pago. Distingue «nunca abrió
  el código» de «llegó a Mercado Pago y no terminó».
- **El código** son 8 caracteres sin los ambiguos (`0 O 1 I`), para dictarlo por WhatsApp.
  Lo genera Postgres con `gen_random_bytes` y reintenta si choca.
- **`moneda` se copia de `paises_cobro`**: Mercado Pago Chile solo cobra en `CLP`. El monto
  queda fijo en el plan; cambiarlo es generar otro código.
- **`pais` es el del tenant** (`venues.pais` o `profiles.pais`): decide la cuenta de
  Mercado Pago con que se cobra (`cuentaMP`, spec 101).
- **Estados**: `esperando` (nadie se suscribió); `activa`, `pausada` y `cancelada` copian
  la suscripción de Mercado Pago (`authorized`, `paused`, `cancelled`); `anulado` significa
  que falló crear el plan y el código no sirve.
- **`pro_pagos.mp_pago_id` único** es la idempotencia: Mercado Pago repite avisos, y un
  cobro procesado dos veces no puede sumar dos meses.
- RLS en las dos: **solo el admin lee** (`es_admin_sonopolis()`). Nadie inserta ni
  actualiza por policy: escriben las funciones y la Edge Function con `service_role`.

### `pro_cambios` sabe de dónde vino el cambio

```sql
alter table pro_cambios add column fuente text not null default 'admin'
  check (fuente in ('admin','mercadopago'));
alter table pro_cambios add column pago_id uuid references pro_pagos(id);
```

`por` queda `null` en los cambios de Mercado Pago.

### Funciones

**`admin_cuenta_del_tenant(p_tenant_type text, p_tenant_id uuid)`** →
`table(cuenta_id uuid, correo text)`. `security definer`, `es_admin_sonopolis()` adentro,
`grant … to authenticated`. Lee el correo en `auth.users`. Cero filas si el tenant no tiene
cuenta. Es lo que muestra el admin antes de generar: «Pro se activa en la cuenta
x@gmail.com».

**`admin_crear_codigo_pro(p_tenant_type text, p_tenant_id uuid, p_monto numeric)`**
→ `table(id uuid, codigo text, pais char(2), moneda char(3), nombre text, correo_cuenta text)`.
`security definer`, `es_admin_sonopolis()` adentro, `grant … to authenticated`. Valida:

- tipo y existencia del tenant (banda = `profiles` con `role = 'musician'`);
- **que tenga cuenta** → si no: «este local no tiene cuenta en Sonópolis: primero tiene que
  reclamarlo o crearla»;
- `p_monto > 0`;
- que el país del tenant tenga fila activa en `paises_cobro` → si no: «el país del tenant
  no cobra todavía».

Inserta la fila en `esperando` con `cuenta_id`, `correo_cuenta` y `creado_por = auth.uid()`.
`nombre` = `venues.name` o `profiles.nombre`.

**`pro_codigo(p_codigo text)`** → `table(codigo, tenant_type, nombre, monto, moneda, estado,
correo_enmascarado, es_mi_cuenta boolean)`. `security definer`,
`grant … to anon, authenticated`. Es lo que ve la página pública:

- `correo_enmascarado`: mismo formato que el CRM (`vic******@gmail.com`, W-187), para que
  quien abre el link sepa con qué cuenta entrar sin exponer el correo completo.
- `es_mi_cuenta`: `auth.uid()` es la cuenta del tenant **hoy** (`pro_cuenta_del_tenant`, no
  `cuenta_id`: si el local cambió de dueño, manda el dueño actual). `false` sin sesión.
- **No devuelve `init_point`**, `tenant_id`, ids de Mercado Pago ni quién lo creó. Código
  inexistente → cero filas.

**`pro_link_de_pago(p_codigo text)`** → `text` (el `init_point`). `security definer`,
**solo `authenticated`**. Excepciones legibles:

- código inexistente → «este código no existe»;
- `auth.uid()` no es la cuenta del tenant → «este código es de otra cuenta de Sonópolis»;
- estado distinto de `esperando` → «esta suscripción ya está {estado}»;
- sin `init_point` → «este código no tiene link de pago».

Si todo está bien, marca `link_pedido_at = now()` (la primera vez) y devuelve el
`init_point`.

**`pro_registrar_pago(p_mp_pago_id text, p_mp_plan_id text, p_mp_preapproval_id text,
p_monto numeric, p_pagado_at timestamptz)`** → `timestamptz`. `security definer`, **solo
`service_role`** (`revoke … from public, anon, authenticated`). En una transacción:

1. Busca la suscripción por `mp_plan_id`; si no existe → `suscripcion_desconocida`.
2. `p_monto < monto` → `monto_menor_al_plan` (misma guarda que `finalizarTicket`, spec 105).
3. Inserta en `pro_pagos` con `on conflict (mp_pago_id) do nothing`; si ya existía,
   devuelve la fecha actual del tenant **sin tocar nada**.
4. Nueva fecha: `greatest(coalesce(hasta_actual, now()), p_pagado_at + interval '1 month'
   + interval '3 days')`.
5. Actualiza `sonopolis_pro_hasta` del tenant, completa `mp_preapproval_id` si estaba
   vacío, pone la suscripción en `activa` y escribe `pro_cambios` con
   `fuente = 'mercadopago'`.

**Por qué `greatest(…, pago + 1 mes + 3 días)` y no "sumar 30 días":** sumar acumula
desfase (12 cobros × 30 días = 360, no un año) y contaría dos veces un mes en que hubo pago
manual y automático. Anclar al día del pago hace el cálculo idempotente y respeta los días
regalados a mano. Los **3 días de gracia** cubren el reintento de Mercado Pago cuando una
tarjeta falla el día del cobro. Si el cobro no se recupera, la fecha vence sola.

**Cancelar no apaga Pro:** la suscripción pasa a `cancelada` y la fecha queda donde estaba.
Pagó el mes, usa el mes.

## Criterios de aceptación

1. Con la sesión del admin (claims en transacción con `rollback`):
   `admin_cuenta_del_tenant` de un local con dueño devuelve su correo; de un local sin
   `owner_id`, cero filas.
2. `admin_crear_codigo_pro('venue', <con dueño>, 19000)` devuelve un código válido,
   `CL`/`CLP` y el correo; deja la fila `esperando` con `cuenta_id`. Sobre un local sin
   dueño → «este local no tiene cuenta en Sonópolis…», sin fila.
3. Una sesión no admin → excepción en las dos `admin_*`; `anon` → permission denied.
4. `pro_codigo` como `anon`: nombre, monto, correo enmascarado, `es_mi_cuenta = false`, sin
   `init_point`. Como la cuenta del tenant: `es_mi_cuenta = true`.
5. `pro_link_de_pago` como la cuenta del tenant (con `init_point` puesto a mano) → el link y
   `link_pedido_at` lleno; como otra cuenta → «este código es de otra cuenta…»; como `anon`
   → permission denied.
6. Como `service_role`, con `mp_plan_id` puesto: `pro_registrar_pago('p1', …, 19000, now())`
   deja `hasta ≈ now() + 1 mes + 3 días`, una fila en `pro_pagos`, una en `pro_cambios` con
   `fuente = 'mercadopago'` y la suscripción `activa`. Repetir `'p1'` no cambia nada. Monto
   menor → excepción. Como `authenticated` → permission denied.
7. `admin_dar_pro` (W-211) sigue funcionando y escribe `fuente = 'admin'`.

## Fuera de alcance

- Crear el plan en Mercado Pago y recibir sus avisos (spec 109).
- Cancelar o pausar una suscripción desde Sonópolis: se hace desde Mercado Pago.
- Que un local sin dueño reclame su cuenta: es otro flujo.
