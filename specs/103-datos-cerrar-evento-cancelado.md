# Spec 103 — Un evento cancelado también se cierra, sin marcar pago

> Estado: **aplicado en producción** (30-sep-2026) — `20260930140000_spec_103_cerrar_evento_cancelado.sql` (`supabase db push --linked`). Antes del push, criterios dentro de una transacción revertida contra producción: Flerk se cierra y su payout sigue `pendiente`/`monto_pagado NULL` (1); un evento futuro cancelado (por su owner dentro de la transacción) se cierra (2); futuro no cancelado → `El evento todavía no ocurre`, pasado con ventas → `pagado 17000` + cerrado (3); colaborador no admin → `Solo un admin…` (4). Después del push: `cerrar_evento` es la versión 103; Flerk sigue abierto.
> Capa: DATOS. `supabase/migrations/20260930140000_spec_103_cerrar_evento_cancelado.sql`.
> Supera: la guarda 4 de la Decisión 3 del **spec 102** (`'Un evento cancelado no se
> cierra'`). El resto del 102 sigue vigente.
> Habilita: `sonopolisWeb/specs/w174-logica-pagos-sin-cerrados.md`,
> `w175-frontend-cerrar-cancelados.md`.

> **En una frase:** `cerrar_evento` deja de rechazar los cancelados: los cierra sin tocar
> `event_payouts`, porque la plata de un show que no ocurrió no se le debe al organizador.

## Motivo

Pedido de Victor (30-sep-2026), el mismo día que se aplicó el 102: "los eventos cancelados
también deberían poder cerrarse". Sin esto, un cancelado queda para siempre en "Por cerrar"
del admin y nunca pasa al historial gris de los paneles.

Caso real en producción: **Flerk**, cancelado el 5-sep, con 2 entradas `completed`
($14.000 a transferir según `monto_a_transferir`), payout `pendiente` y ningún reembolso
registrado. Hoy aparece en `/admin/sonopolis` → "Terminaron y no han reclamado".

## Decisión

**Cerrar un cancelado = solo `closed_at`/`closed_by`. No se marca pago.**

- `monto_a_transferir` cuenta entradas `completed`; en un cancelado esa plata es de los
  compradores (reembolso), no del organizador. Marcar el payout `pagado` registraría una
  transferencia de $14.000 que no corresponde y congelaría ese número en `monto_pagado`
  como si se hubiera pagado.
- **Descartado: exigir que no haya ventas sin reembolsar.** Los reembolsos no tienen
  escritor (reservado desde el spec 036): Flerk no se podría cerrar nunca, que es justo lo
  que Victor pidió poder hacer. El reembolso, si se hizo, se hizo por fuera (Mercado Pago);
  el cierre es la marca de Victor de que ese caso ya está resuelto.
- **Sin guarda de fecha para los cancelados.** La guarda "el evento todavía no ocurre"
  existe porque un evento vivo todavía vende y su monto cambia; un cancelado ya no vende
  (spec 044), así que un cancelado futuro también se puede cerrar.
- El payout de un cancelado cerrado queda como estaba (`pendiente`). Para que deje de
  aparecer en la cola de pagos, la consulta de la web excluye los cerrados (W-174).

## Trabajo

`CREATE OR REPLACE FUNCTION public.cerrar_evento(p_event uuid)` con el cuerpo del 102 y un
solo cambio: la guarda 4 se reemplaza por una rama que, si `status = 'cancelled'`, hace el
`UPDATE events SET closed_at, closed_by` y devuelve, **sin** pasar por la guarda de fecha
ni por el paso de pago. Mismos `SECURITY INVOKER`, `search_path` y grants (el `CREATE OR
REPLACE` los conserva; se repiten igual por claridad).

`supabase db push --linked` — DATOS de a uno; antes, migración + criterios dentro de una
transacción revertida contra producción, como el 102.

## Criterios de aceptación

1. `cerrar_evento` sobre Flerk (cancelado, pasado, con ventas): `closed_at` puesto, payout
   sigue `pendiente`, `monto_pagado` sigue `NULL`.
2. Un cancelado futuro también se cierra.
3. Un evento **no** cancelado se comporta igual que en el 102: futuro → `El evento todavía no
   ocurre`; pasado con ventas → payout `pagado` + cerrado.
4. Un colaborador no admin sigue sin poder cerrar (`Solo un admin…`).
