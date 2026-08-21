# Spec 052 — Invitar a un colaborador de evento que todavía no tiene cuenta

**Capa: DATOS · `supabase/migrations/` · Depende de: nada**
> Estado: aplicado en producción (2026-08-20) — `20260820183954_spec_052_invitar_colaborador_email.sql` corrida contra `xluinfihjjtxkglihxqz`
**Extiende: spec 033** (no lo edita — los specs aplicados no se editan) — cierra el
punto que el 033 dejó fuera de alcance ("invitar por correo a quien no tiene
cuenta — depende del 028"), ya resuelto: el 028 (SMTP/Resend) está aplicado.

Pedido desde `sonopolisWeb/specs/w032-datos-invitar-colaborador-email.md`. El diseño
completo está ahí; este archivo es el registro de la migración en este repo.

## El problema

`event_collaborators` (spec 033) solo admite invitar a alguien que ya tiene perfil.
Falta invitar por email a alguien sin cuenta, y que al crearla quede en el equipo
del evento automáticamente.

## Decisión: mismo patrón que el guest checkout (spec 046)

No se crea una fila en `auth.users` de antemano — mismo argumento que el 046 usó
para tickets de invitado (cita en W-032): una cuenta placeholder agrega superficie
de ataque sin eliminar el paso que se quería evitar. Es una tabla de invitaciones
pendientes + un trigger hermano de `on_auth_user_created_claim_guest_tickets` que
resuelve el claim al signup, por email sin verificar (mismo riesgo aceptado que 046).

## Trabajo

Migración `<timestamp>_spec_052_invitar_colaborador_email.sql`:

- `CREATE TABLE event_collaborator_invites` (`role` admin/editor —owner no se
  invita, igual que `event_collaborators`—, índice único parcial "un pending por
  email y evento")
- 3 policies (`select`, `insert`, `update_revoke`) — reutilizan `can_manage_team`,
  `can_delete_event`, `event_role_of` del spec 033, **sin funciones nuevas de
  permisos**
- `claim_event_collaborator_invites()` + trigger `AFTER INSERT ON auth.users`
  (hermano de `on_auth_user_created`, no lo edita)

⚠️ **Aditivo puro.** No toca `event_collaborators`, `events`, ni ninguna función o
policy del spec 033.

SQL completo, línea por línea con su porqué: `w032-datos-invitar-colaborador-email.md`.

## Fuera de alcance

Igual que W-032: reenvío de invitación, expiración automática, confirmación de
email previa al claim.
