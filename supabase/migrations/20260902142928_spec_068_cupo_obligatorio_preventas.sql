-- Spec 068 — Cupo obligatorio en preventas
-- Verificado antes de aplicar: única fila existente en event_preventas ya tenía cupo (25).

ALTER TABLE public.event_preventas
  ALTER COLUMN cupo SET NOT NULL;

ALTER TABLE public.event_preventas
  DROP CONSTRAINT event_preventas_cupo_valido;

ALTER TABLE public.event_preventas
  ADD CONSTRAINT event_preventas_cupo_valido CHECK (cupo > 0 AND vendidos <= cupo);
