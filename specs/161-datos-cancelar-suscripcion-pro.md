# Spec 161 — El dueño ve su suscripción a Pro y la base sabe cerrarla en el día que pagó

> Estado: aplicado y **pusheado a producción** (26-oct-2026) — `20261026200000_spec_161_cancelar_suscripcion_pro.sql`, única pendiente. Antes del push, los 5 criterios verificados en producción dentro de una transacción abortada (migración corrida dos veces, Quintal como tenant de prueba, sin dejar filas): próximo cobro 26-nov y Pro hasta 29-nov; otra cuenta y `anon` → 0 filas; cerrar → 26-nov, idempotente, 1 fila en `pro_cambios`; con la fecha movida por el admin no la toca; `authenticated` → permission denied. Ver addenda.
> Capa: DATOS. Migración nueva en `supabase/migrations/` (`*_spec_161_cancelar_suscripcion_pro.sql`).
> Depende de: spec 110 (`pro_suscripciones`, `pro_pagos`, `pro_cuenta_del_tenant`,
> `pro_cambios.fuente`). **No se hace `db push` mientras la migración de W-261 de
> sonopolisWeb siga sin pushear** (capa DATOS de a una, regla global).
> Alimenta: spec 162, `sonopolisWeb` W-264.

> **En una frase:** una función para que el dueño lea el estado de su suscripción (cuándo
> se cobra de nuevo, hasta cuándo tiene Pro) y otra, solo del servidor, que la marca
> cancelada y deja `sonopolis_pro_hasta` en el fin exacto del mes pagado.

## Motivo

Pedido de Victor (26-oct-2026): «que un pago real lo active, debería ser pago automático
para siempre hasta que lo cancele. y que dentro del crm de local sea fácil cancelarlo. que
quede claro hasta qué día puede seguir usando pro. la idea es que los ciclos sean
mensuales.»

El cobro mensual automático ya existe: el plan de Mercado Pago se crea con
`frequency: 1, frequency_type: 'months'` y sin fecha de término (spec 109), así que cobra
cada mes hasta que alguien lo cancela. Faltan dos cosas que viven en la base:

1. **El dueño no puede leer su suscripción.** `pro_suscripciones` y `pro_pagos` solo los
   lee el admin (spec 110). Sin eso el panel no puede decir «se renueva el 26 de noviembre».
2. **Cancelar no ajusta la fecha.** Cada cobro deja `sonopolis_pro_hasta = pago + 1 mes +
   3 días`. Los 3 días existen para que un reintento de cobro de Mercado Pago no corte Pro
   mientras tanto; si la suscripción se cancela, ya no hay reintento y esos 3 días harían
   que el ciclo no sea mensual.

## Decisión

### `pro_suscripciones.cancelada_at`

`alter table public.pro_suscripciones add column cancelada_at timestamptz;` Nula salvo en
las canceladas desde este spec en adelante.

### `pro_mi_suscripcion(p_tenant_type text, p_tenant_id uuid)`

`security definer`, `set search_path = public`, `grant execute` a `authenticated`.

- Si `auth.uid()` no es `pro_cuenta_del_tenant(p_tenant_type, p_tenant_id)` → **cero
  filas** (no error: el panel muestra la tarjeta de siempre).
- Si lo es: la suscripción más reciente del tenant con `estado in ('activa', 'pausada',
  'cancelada')` (`order by created_at desc limit 1`). `esperando` y `anulado` no cuentan:
  nadie terminó de pagar.
- Devuelve una fila:

| Columna | Valor |
|---|---|
| `suscripcion_id` | `pro_suscripciones.id` |
| `estado` | `activa` · `pausada` · `cancelada` |
| `monto`, `moneda` | los de la suscripción |
| `ultimo_pago_at` | `max(pro_pagos.pagado_at)` de esa suscripción, o `null` |
| `proximo_cobro_at` | `ultimo_pago_at + interval '1 month'` si `estado = 'activa'`; si no, `null` |
| `pro_hasta` | `sonopolis_pro_hasta` actual del tenant |
| `cancelada_at` | la columna nueva |

### `pro_cerrar_suscripcion(p_suscripcion_id uuid) returns timestamptz`

`security definer`, `set search_path = public`. **Solo `service_role`** (`revoke` a
`public, anon, authenticated`): la llaman las Edge Functions del spec 162 después de que
Mercado Pago confirmó la cancelación.

1. `select … for update` de la suscripción. No existe → `raise exception
   'suscripcion_desconocida'`.
2. Si ya está `cancelada` → devuelve el `sonopolis_pro_hasta` actual sin tocar nada
   (idempotente: el panel cancela y Mercado Pago avisa lo mismo por el webhook).
3. `estado = 'cancelada'`, `cancelada_at = now()`.
4. Último pago de esa suscripción (`pro_pagos` por `pagado_at desc limit 1`). **Solo si**
   existe **y** el `sonopolis_pro_hasta` del tenant sigue siendo su `hasta_despues` (nadie
   lo movió después, por ejemplo el admin regalando un mes):
   `nuevo = greatest(now(), hasta_despues - interval '3 days')`, se escribe en
   `venues`/`profiles` y queda una fila en `pro_cambios` con `fuente = 'mercadopago'`,
   `por = null`, `pago_id = null`.
   - Por qué `hasta_despues - 3 días` y no `pagado_at + 1 mes`: si el tenant tenía tiempo
     acumulado cuando pagó, `hasta_despues` ya lo incluye; restar solo la gracia no le
     quita nada pagado.
   - Por qué `greatest(now(), …)`: si se cancela durante un reintento de cobro fallido, el
     mes ya terminó y no se pagó; Pro termina ahora, no en el pasado.
5. Si no hay pago o la fecha fue movida por otro: la fecha no se toca.
6. Devuelve el `sonopolis_pro_hasta` final del tenant.

## Criterios de aceptación

Verificar en una transacción con `rollback` (local o producción), como el spec 111.

1. La migración corre dos veces sin error (`if not exists` / `create or replace`).
2. `pro_mi_suscripcion` con la sesión de la cuenta dueña de un tenant con una suscripción
   `activa` y un pago del 26-oct → `proximo_cobro_at` = 26-nov y `pro_hasta` = 29-nov.
   Con otra cuenta o con `anon` → cero filas.
3. `pro_cerrar_suscripcion` sobre esa suscripción → `estado = 'cancelada'`, `cancelada_at`
   lleno, `sonopolis_pro_hasta` = 26-nov y una fila nueva en `pro_cambios`. Llamarla otra
   vez devuelve 26-nov y no agrega filas.
4. Si antes de cerrar el admin corrió la fecha (`admin_dar_pro` +30 días), cerrar no la
   toca.
5. `pro_cerrar_suscripcion` con `authenticated` → «permission denied».

## Fuera de alcance

- Llamar a Mercado Pago (spec 162).
- Volver a suscribirse antes de que venza un Pro cancelado: hoy el botón de suscribirse
  solo aparece sin Pro. Se anota en `PENDIENTES.md` si Victor lo pide.

## Addenda (26-oct-2026)

- `pro_mi_suscripcion` también tiene `grant` a `anon`: el criterio 2 pide «cero filas» sin
  sesión, no un error de permiso. Sin `auth.uid()` devuelve vacío.
- El `db push` de W-261 ya estaba hecho por otra sesión cuando se aplicó este spec.
