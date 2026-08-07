-- Spec 018 — Taxonomía de venues: de "cafés" a "locales"
-- El DROP va primero: los nuevos valores violan el CHECK viejo,
-- y el valor actual 'venue' violaría el CHECK nuevo.

ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_type_check;

UPDATE public.venues SET type = 'bar'             WHERE name = 'Bar La Peña';
UPDATE public.venues SET type = 'centro_cultural' WHERE name = 'Quintal Clandesta';

-- Red de seguridad: cualquier 'venue' restante pasa a centro_cultural
UPDATE public.venues SET type = 'centro_cultural' WHERE type = 'venue';

ALTER TABLE public.venues ADD CONSTRAINT venues_type_check
  CHECK (type IN ('cafe','bar','sala','centro_cultural'));
