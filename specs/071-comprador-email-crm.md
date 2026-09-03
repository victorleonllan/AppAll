# Spec 071 — DATOS: email del comprador en `tickets` (base del CRM)

> Estado: **aplicado (3-sep-2026)**, migración
> `20260903213000_spec_071_comprador_email.sql` en producción
> (`xluinfihjjtxkglihxqz`). Backfill verificado contra los tickets reales.

## Pedido de Victor (3-sep-2026)

> "Necesito que el local muestre el correo en el listado de tickets comprados
> […] que las entradas vengan asociadas a un correo para posteriormente armar
> un CRM y poder gestionar todos esos correos."

## Problema

Hasta hoy el local no tenía de dónde sacar el email del comprador:

- **Compra con cuenta:** el email vive en `auth.users`, que ningún cliente lee
  por RLS. El nombre podría salir de `profiles`, pero su policy (spec 020) solo
  deja ver `role='musician'` + la fila propia — un comprador `fan` llega en
  blanco. `getEntradasEvento` ya documentaba ese hueco.
- **Guest checkout:** `tickets.guest_email` sí existe, pero solo cubre ese
  camino, así que la mitad de las ventas no tenía email y la otra mitad sí, en
  una columna que por nombre no se lee como "el email de esta venta".

## Decisión

Una columna nueva, `tickets.comprador_email`, con el email **al momento de la
compra** — snapshot, no referencia viva. Dos razones, en este orden:

1. **RLS.** El equipo del evento ya puede leer la fila de `tickets`
   (`tickets_select_event_team`). Poner el dato ahí lo hace visible sin abrir
   `auth.users` ni `profiles`, que expondrían mucho más que un email.
2. **Es un dato de la venta, no del usuario.** Un CRM necesita el email con el
   que se compró. Si el fan cambia su cuenta mañana, la venta histórica no debe
   mutar debajo.

Se descartó exponer `auth.users.email` vía función `SECURITY DEFINER`: resuelve
la lectura pero no lo segundo, y deja al CRM dependiendo de que el usuario no
cambie nunca su email.

## Qué hace la migración

1. `ALTER TABLE public.tickets ADD COLUMN comprador_email text` (+ `COMMENT`).
2. **Backfill** de lo ya vendido: `auth.users.email` cuando hubo `user_id`,
   `guest_email` cuando fue compra de invitado. Dos `UPDATE` separados a
   propósito — un `COALESCE` con `JOIN` a `auth.users` deja fuera justo las
   filas con `user_id NULL`.
3. `CREATE OR REPLACE _reservar_ticket_shared(...)`: mismo cuerpo del spec 065,
   con el email resuelto antes del `INSERT` (`auth.users` cuando hay
   `p_user_id`, `p_guest_email` si no). Ya era `SECURITY DEFINER`, así que
   puede leer `auth.users`; quien llama nunca la ve, solo recibe su ticket.

Firma y grants sin cambios: `create-preference` y los dos wrappers
(`reservar_ticket_pending`, `reservar_ticket_guest`) no se tocan — el email se
resuelve dentro de la función compartida, así que ambos caminos lo guardan sin
saber que existe.

## Verificación

```sql
select id, status, user_id is not null as con_cuenta, guest_email, comprador_email
  from tickets order by created_at desc limit 5;
```

Los 5 tickets reales del evento de prueba quedaron con su `comprador_email`
correcto (`jamcafe.app@gmail.com`, `victor.leon.llanten@gmail.com`), incluidos
los `pending`.

## Fuera de alcance

- **Mostrarlo** — es capa FRONTEND, va en el spec W077 de `sonopolisWeb`
  (listado de entradas del evento + panel de ventas).
- **Exportar a CSV / integrar con un CRM externo.** Este spec deja el dato
  disponible y consultable; la herramienta de gestión encima es otro spec
  cuando Victor la pida.
- **Consentimiento del fan sobre el uso de su email por parte del local.** Hoy
  el email se guarda porque es necesario para emitir y enviar la entrada; que
  el local lo use para marketing es una decisión de producto/legal que este
  spec no resuelve ni bloquea — queda anotada acá para que exista el registro.
