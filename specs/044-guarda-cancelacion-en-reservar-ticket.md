# Spec 044 — La cancelación tiene que vivir en la base

> Estado: **aplicado y verificado (2026-08-13).** Migración
> `20260813215305_spec_044_guarda_cancelacion_realtime.sql` en producción. Los 6 criterios
> de cierre verificados por RPC/SQL directo contra producción, en transacciones con
> `ROLLBACK` (mismo método que 022/040) — sin tocar el único evento real ni sus 10 tickets:
>
> - `reservar_ticket_pending` sobre un evento de prueba `cancelled` → `evento_no_vende:
>   ... está en estado cancelled, no vende entradas`.
> - Lo mismo sobre `draft` → `evento_no_vende: ... está en estado draft, no vende entradas`.
> - Cancelar un evento de prueba con un ticket `pending` y uno `completed`: el `pending`
>   quedó `cancelled`, el `completed` no se tocó.
> - `pg_publication_tables` para `supabase_realtime` ya incluye `events`.
>
> Verificado por RPC, no por la UI, tal como pedía el criterio de cierre original.

**Capa: DATOS · `supabase/migrations/` · Depende de: nada**

Pedido desde `sonopolisWeb/specs/w008-datos-guarda-cancelacion.md` (🔴 prioridad alta ahí).
Vive acá y no en `sonopolisWeb` porque es un cambio de esquema/RPC — la regla de ese repo
("un cambio de esquema es un spec de AppAll") aplica también cuando quien lo pide es la web.

## El agujero

`reservar_ticket_pending` es la única puerta de escritura de `tickets` (spec 022 borró la
policy `tickets_insert` para que fuera así). Verificado contra producción el 2026-08-13:
validaba cantidad, existencia del evento y aforo, pero **no miraba `events.status`**. Un
evento `cancelled` seguía siendo vendible: el RPC creaba el ticket `pending`,
`create-preference` generaba la preferencia de MP, el comprador pagaba por un show que no
existe, y el webhook le emitía entradas (spec 037). Lo único que lo impedía era que la
interfaz escondiera el botón — eso no es una guarda.

El agujero era asimétrico: cancelar sí estaba bien cerrado (`events_guard_protected_columns`,
spec 033, exige `can_delete_event()`). Vender no.

## Decisiones (confirmadas por Victor, 2026-08-13)

1. **`draft` también bloquea, no solo `cancelled`.** Un evento en draft está oculto del
   público (`events_select`, spec 033: `status <> 'draft' OR can_edit_event(id)`) y no hay
   evidencia en el código de un flujo de preventa que dependa de comprarlo en ese estado.
   Si aparece esa necesidad, es un spec nuevo con su propio criterio.
2. **Los `pending` en curso al cancelar se cancelan también.** Bloquear
   `reservar_ticket_pending` solo frena reservas *nuevas*. `webhook-mp` no revisa el estado
   del evento en ningún punto (verificado leyendo `supabase/functions/webhook-mp/index.ts`):
   actualiza `tickets` por `preference_id` a secas. Sin esto, un ticket que ya estaba
   `pending` cuando el evento se cancela puede completarse igual si el comprador termina el
   pago después, y el webhook emitiría entradas para un show cancelado.

## Trabajo

Migración `20260813215305_spec_044_guarda_cancelacion_realtime.sql`:

1. `reservar_ticket_pending`: after el `SELECT ... FOR UPDATE` que ya bloquea la fila del
   evento, `RAISE EXCEPTION` si `v_evento.status IN ('cancelled', 'draft')`. Después del
   lock, no antes, para que una cancelación concurrente con una compra se resuelva por el
   lock y no por azar — mismo razonamiento que el spec W-008 ya había escrito.
2. `events_guard_protected_columns` (trigger `BEFORE UPDATE ON events`, spec 033): en la
   misma rama que ya detecta `NEW.status = 'cancelled' AND OLD.status <> 'cancelled'`,
   después de confirmar `can_delete_event()`, agrega
   `UPDATE tickets SET status = 'cancelled' WHERE evento_id = OLD.id AND status = 'pending'`.
   No toca `completed` (eso es un reembolso, sigue fuera de alcance) ni lo que ya estaba
   `refunded`/`cancelled`.
3. `ALTER PUBLICATION supabase_realtime ADD TABLE public.events` — la publicación estaba
   vacía, `postgres_changes` no emitía nada para ninguna tabla. Desbloquea el aviso en vivo
   del spec W-009 de sonopolisWeb. `events` es de lectura pública, así que Realtime (que
   respeta RLS) no expone nada nuevo.

## Criterios de aceptación

- [x] La migración existe como archivo antes de aplicarse
- [x] `reservar_ticket_pending` por RPC directa sobre un evento `cancelled` falla
- [x] `reservar_ticket_pending` por RPC directa sobre un evento `draft` falla
- [x] Cancelar un evento con un ticket `pending` lo deja `cancelled`
- [x] Cancelar un evento con un ticket `completed` NO lo toca (no es un reembolso)
- [x] `select * from pg_publication_tables where pubname = 'supabase_realtime'` incluye `events`
- [x] Un evento `cancelled` sigue pudiendo cancelarse dos veces sin error raro — probado por SQL directo, segundo `UPDATE ... status = 'cancelled'` no lanza excepción

## Fuera de alcance

- **Reembolsos.** `refunded` está reservado sin escritor desde el spec 036; cancelar no
  devuelve plata, y eso es un problema de negocio antes que de código.
- **Avisar por correo a quien ya compró.** El aviso vive en la web (spec W-009); quien
  compró y no vuelve a abrirla no se entera. Resend ya está configurado (spec 028); el
  disparador natural es un trigger, no una página — spec aparte.
- **`webhook-mp` no se toca.** El punto 2 de arriba cierra el hueco desde el lado de la
  base (los `pending` dejan de existir al cancelar), así que no hace falta que el webhook
  aprenda a mirar `events.status` también.
