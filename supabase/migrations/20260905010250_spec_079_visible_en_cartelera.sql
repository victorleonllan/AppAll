-- Spec 079 — un evento se puede sacar de la cartelera sin cancelarlo.
--
-- Cancelar y ocultar son independientes: cancelar es para un show que no va a
-- pasar (apaga la venta, deja "Cancelado" a propósito, spec 033); esto es para
-- un show que ya pasó y se cumplió, y que ya no necesita listarse.
--
-- Positivo con default true, no 'oculto' con default false: todo evento que
-- existía antes de esta columna sigue apareciendo igual sin backfill. Con un
-- flag negativo el mismo default (false) habría escondido de golpe todo lo
-- que ya existía.
--
-- Sin policy nueva: events_update ya exige can_edit_event(id) para cualquier
-- columna (spec 033), y ocultar del listado no es destructivo ni toca el
-- pago — no amerita la fuerza de can_delete_event().
--
-- events_select no se toca: sigue siendo status <> 'draft' OR can_edit_event(id).
-- Ocultar es una decisión de LISTADO, no de ACCESO — quien tiene el link
-- directo de una entrada vieja sigue pudiendo abrir el evento.

ALTER TABLE public.events
  ADD COLUMN visible_en_cartelera boolean NOT NULL DEFAULT true;
