-- Spec 038 — Quién ve las ventas de un evento: de `created_by` a `event_collaborators`
--
-- El spec 033 partió "quién creó el evento" (events.created_by, hecho histórico) de
-- "quién manda hoy sobre el evento" (event_collaborators + can_edit_event()). Reemplazó
-- events_update/events_delete/events_select para mirar al lugar nuevo, pero dejó afuera
-- a propósito tickets_select_event_owner. Esta migración cierra ese hueco: el dueño de
-- un local invitado como admin, el artista vinculado, cualquier invitado manual desde
-- EquipoEventoScreen, y el nuevo owner tras transfer_event_ownership, hoy ven 0 ventas
-- de eventos que sí administran. Detalle completo en specs/038-rls-ventas-por-colaborador.md.

DROP POLICY IF EXISTS tickets_select_event_owner ON public.tickets;

-- Mismo nombre no: el nombre viejo dice "event_owner" y ya no es el criterio. Un grep
-- futuro por el nombre viejo debe encontrar esta migración, no un cuerpo distinto bajo
-- el mismo nombre.
CREATE POLICY tickets_select_event_team ON public.tickets FOR SELECT
  USING (public.can_edit_event(evento_id));

-- tickets_select_own y tickets_insert no se tocan: se quedan tal cual el baseline.
-- Las dos policies de SELECT son OR entre sí — se ve un ticket por ser el comprador
-- o por ser del equipo del evento.
