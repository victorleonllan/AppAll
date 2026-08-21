# Spec 051 — Disponibilidad del músico y solicitudes de bolo (`booking_requests`)

**Capa: DATOS · `supabase/migrations/` · Depende de: nada**
> Estado: migración escrita (`20260820183953_spec_051_disponibilidad_y_solicitudes.sql`), sin aplicar en producción (2026-08-20)

Pedido desde `sonopolisWeb/specs/w031-datos-disponibilidad-y-solicitudes.md`. Vive
acá por la misma regla del spec 049: un cambio de esquema es un spec de AppAll,
aunque quien lo pida sea la web. El diseño completo —cada columna, cada policy y
por qué— está en ese spec W-031; este archivo es el registro de la migración en
este repo, no una segunda copia del razonamiento.

## El problema

El dashboard pro de `sonopolisWeb` necesita que un músico se marque disponible, y
que músico y local puedan proponerse un bolo y aceptarlo/rechazarlo sin que eso cree
un evento todavía (confirmado con Victor: son features independientes).

## Trabajo

Migración `<timestamp>_spec_051_disponibilidad_y_solicitudes.sql`:

- `ALTER TABLE profiles ADD COLUMN available boolean NOT NULL DEFAULT false`
- `CREATE TABLE booking_requests` (`musician_id` → `profiles`, `venue_id` →
  `venues`, `status` pending/accepted/declined/cancelled) + 2 índices
- `is_booking_party(p_request, p_user)` / `is_booking_recipient(p_request, p_user)`
  — `SECURITY DEFINER`, mismo motivo que `event_role_of` del spec 033: cruzan
  `venues.owner_id`
- 4 policies (`select`, `insert`, `update_respond`, `update_cancel`) — solo la
  contraparte responde, solo quien propuso cancela
- Trigger `booking_requests_set_responded_at_trg`

SQL completo, línea por línea con su porqué: `w031-datos-disponibilidad-y-solicitudes.md`.

## Fuera de alcance

Igual que W-031: notificar por email, convertir una solicitud aceptada en evento
automáticamente, calendario de disponibilidad por fecha.
