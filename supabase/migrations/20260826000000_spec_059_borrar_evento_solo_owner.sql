-- Spec 059 — Borrar evento: solo el owner, no cualquiera con can_delete.
-- can_delete_event() no cambia (lo sigue usando el trigger de cancelar);
-- solo se angosta la policy de DELETE sobre events.

DROP POLICY IF EXISTS events_delete ON public.events;
CREATE POLICY events_delete ON public.events FOR DELETE
  USING (public.event_role_of(id) = 'owner');
