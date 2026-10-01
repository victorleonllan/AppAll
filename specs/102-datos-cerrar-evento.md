# Spec 102 — El admin da un evento por pagado y lo cierra, en una sola acción

> Estado: **aplicado en producción** (30-sep-2026) — `20260930120000_spec_102_cerrar_evento.sql` (`supabase db push --linked`, sin otra migración pendiente). Antes del push, migración + criterios corridos dentro de una transacción revertida contra producción: colaborador no admin que hace `update closed_at` → `El cierre de un evento lo marca Sonópolis` y que llama al RPC → `Solo un admin…` (2); futuro → `El evento todavía no ocurre`, cancelado → `Un evento cancelado no se cierra` (3); pasado con ventas y payout `pendiente` sin reclamo → `pagado`, `monto_pagado = 17000`, `closed_by` = admin (4); segunda llamada no mueve `closed_at` (6); `anon` no ejecuta, `authenticated` sí (7). Después del push: 2 columnas, 0 eventos cerrados, payouts intactos (1). **Criterio 5 sin probar:** no hay hoy un evento pasado sin ventas.
> Capa: DATOS. `supabase/migrations/20260930120000_spec_102_cerrar_evento.sql`.
> Depende de: spec 074/077 (`es_admin_sonopolis()`, `monto_a_transferir`, policies
> `event_payouts_*_admin`), spec 075 (estados `pendiente`/`reclamado`/`pagado`), spec 078
> (el admin edita cualquier evento vía `can_edit_event`).
> Habilita: `sonopolisWeb/specs/w171-logica-cerrar-evento.md`,
> `w172-frontend-admin-pagado-y-cerrado.md`, `w173-frontend-historial-gris-en-paneles.md`.

> **En una frase:** un evento que ya pasó hoy no tiene forma de "terminar" — queda igual que
> uno activo en los paneles; este spec le agrega `events.closed_at` y un RPC
> `cerrar_evento` que, en una sola operación, marca el pago como hecho (si había plata) y
> cierra el evento.

## Motivo

Pedido de Victor (30-sep-2026): desde `/admin/sonopolis` poder dar un evento por pagado y
cerrarlo; los eventos cerrados se ven en gris en el admin y en los paneles de local y
músico, para que nadie los confunda con uno activo.

Dos decisiones las tomó Victor al pedirlo:

1. **Pagar y cerrar es una sola acción**, no dos botones. Un evento sin entradas vendidas
   se cierra directo, sin pago de por medio.
2. **Se puede dar por pagado aunque el organizador no haya reclamado** (p. ej. se le
   transfirió por fuera). Relaja, solo para esta acción del admin, la regla del spec 075
   ("no se paga lo que nadie pidió"). `marcar_pago_evento` sigue exigiendo el reclamo; no
   se toca.

## Decisión 1 — `closed_at` y `closed_by` en `events`, no en `event_payouts`

```sql
ALTER TABLE public.events
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by uuid REFERENCES auth.users(id);
```

- **En `events` y no en `event_payouts`:** el músico colaborador tiene que ver que el
  evento está cerrado (pinta su card en gris), y `event_payouts` solo lo lee el owner y el
  admin (spec 073/074) — ahí vive un número de cuenta. `events` ya es de lectura para
  quien corresponde (`events_select`, spec 033), así que la columna viaja sin policy nueva.
- **Descartado: un valor nuevo en `events.status` (`'closed'`).** `status` significa "¿se
  puede vender / se ve?" — `cancelled` apaga la venta y la cartelera lo muestra como
  cancelado. Cerrar es contable (ya se liquidó), no cambia qué ve el público. Mezclarlo en
  `status` obligaría a revisar cada `status = 'published'` del código (reserva de entradas,
  cartelera, canje) para decidir si `'closed'` cuenta como publicado.
- Nullable, sin default: `NULL` = abierto. Los eventos existentes quedan abiertos.

## Decisión 2 — solo el admin escribe `closed_at` / `closed_by`

Trigger nuevo `events_guard_cierre` (`BEFORE UPDATE ON events`), `SECURITY INVOKER`,
`SET search_path = public`:

```sql
IF (NEW.closed_at IS DISTINCT FROM OLD.closed_at
    OR NEW.closed_by IS DISTINCT FROM OLD.closed_by)
   AND NOT public.es_admin_sonopolis()
   AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
  RAISE EXCEPTION 'El cierre de un evento lo marca Sonópolis';
END IF;
RETURN NEW;
```

- **Trigger aparte, no dentro de `events_guard_protected_columns`:** esa función es
  `SECURITY DEFINER` (spec 033/044), y ahí `current_user` sería siempre su dueño — la
  lección del spec W-048. Una función chica e `INVOKER` no arrastra ese riesgo.
- Sin esto, cualquier colaborador con `can_edit_event` podría "cerrarse" su propio evento
  con un `update` y pintarlo gris.

## Decisión 3 — `cerrar_evento(p_event uuid)`: paga si hace falta, y cierra

`RETURNS public.events`, `LANGUAGE plpgsql`, **`SECURITY INVOKER`** (mismo patrón que
`marcar_pago_evento`: el admin escribe con su propia sesión y lo dejan pasar las policies
`event_payouts_update_admin` y `events_update` vía `can_edit_event`; sin `DEFINER` no entra
en la deuda del spec 093). `SET search_path = public`.

Orden de las guardas:

1. `NOT es_admin_sonopolis()` → `'Solo un admin de Sonópolis cierra un evento'`.
2. Evento inexistente → `'Ese evento no existe'`.
3. **Idempotente:** si `closed_at IS NOT NULL`, devolver la fila sin tocar nada.
4. `status = 'cancelled'` → `'Un evento cancelado no se cierra'` (un cancelado con ventas
   es un reembolso, fuera de alcance; el cancelado ya tiene su propia marca).
5. `comienza_at IS NULL OR comienza_at > now()` → `'El evento todavía no ocurre'`. No se
   cierra lo que no pasó: el monto todavía puede cambiar.
6. `v_monto := monto_a_transferir(p_event)`.
   - `v_monto > 0` y **no hay fila** en `event_payouts` → `'Ese evento tiene plata por
     transferir y no tiene datos bancarios'`. Descartado cerrarlo igual: se perdería la
     única señal de que a alguien se le debe plata.
   - `v_monto > 0` y la fila **no** está `'pagado'` → `UPDATE event_payouts SET status =
     'pagado', pagado_at = now(), pagado_por = auth.uid(), monto_pagado = v_monto`. **Sin
     exigir `'reclamado'`** (decisión de Victor). El monto se congela en la base, igual que
     en el spec 074.
   - `v_monto = 0` o ya `'pagado'` → no se toca `event_payouts`.
7. `UPDATE events SET closed_at = now(), closed_by = auth.uid() WHERE id = p_event
   RETURNING *`.

Todo en la misma función = una sola transacción: no queda un pago marcado con el evento
abierto, ni al revés.

`REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated` (la guarda real
es el paso 1).

## Fuera de alcance

- **Reabrir un evento cerrado.** Si hace falta, `closed_at = NULL` desde el SQL editor
  (`postgres` pasa el trigger). Sin botón hasta que aparezca el caso.
- Bloquear la edición o el canje de entradas de un evento cerrado.
- La app móvil (AppAll en pausa): lee `events` con `select *`, la columna nueva no rompe
  nada.

## Trabajo

1. Migración con: las dos columnas, la función + trigger `events_guard_cierre`, la función
   `cerrar_evento` con sus grants.
2. `supabase db push --linked` — **DATOS va de a uno**: verificar antes que no haya otra
   migración pendiente sin pushear.
3. Criterios 2-6 dentro de una transacción revertida contra producción (como el spec 100).

## Criterios de aceptación

1. `events.closed_at` y `events.closed_by` existen, nullable; todos los eventos actuales
   con `NULL`.
2. Un colaborador (no admin) que hace `update events set closed_at = now()` sobre su evento
   recibe `El cierre de un evento lo marca Sonópolis`.
3. `cerrar_evento` sobre un evento futuro falla con `El evento todavía no ocurre`; sobre
   uno cancelado, con `Un evento cancelado no se cierra`.
4. Sobre un evento pasado con ventas y payout `pendiente` (sin reclamo): el payout queda
   `pagado` con `monto_pagado = monto_a_transferir(evento)` y el evento con `closed_at`.
5. Sobre un evento pasado sin ventas y sin fila de payout: se cierra, sin error.
6. Llamarlo dos veces devuelve la misma fila y no cambia `closed_at` ni `pagado_at`.
7. `anon` no puede ejecutar `cerrar_evento`.
