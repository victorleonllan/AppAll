-- Spec 107 — El registro de banda de Santiago Samba Club pasa a la cuenta de la banda.
-- Ver specs/107-datos-santiago-samba-club-a-su-cuenta.md
--
-- El backfill del spec 061 enlazó el registro «Santiago samba club» de `artists` a
-- leonmusic.lab@gmail.com (cuenta de prueba de Victor, que el 7-ago se llamaba así),
-- y el trigger events_claim_owner hizo admin a esa cuenta en los 2 eventos de la banda.
-- Corrección de filas, sin esquema. Filtra por los ids exactos: la segunda corrida no
-- hace nada.

DO $$
DECLARE
  prueba constant uuid := '65766e7e-8b0a-43dd-85c7-7785f0a1b319'; -- leonmusic.lab
  banda  constant uuid := 'ad1f7193-eefe-426a-9b18-a148a625f851'; -- s.sambacluboficial
  registro uuid;
BEGIN
  SELECT id INTO registro
    FROM public.artists
   WHERE profile_id = prueba AND name ILIKE 'santiago samba club';

  IF registro IS NULL THEN
    RAISE NOTICE 'spec 107: no hay registro enlazado a la cuenta de prueba, nada que hacer';
    RETURN;
  END IF;

  -- La PK es (event_id, user_id): si la banda ya figurara en el evento, el UPDATE de
  -- abajo fallaría. Se corta antes con un mensaje claro.
  IF EXISTS (
    SELECT 1 FROM public.event_collaborators ec
      JOIN public.events e ON e.id = ec.event_id
     WHERE e.artist_id = registro AND ec.user_id = banda
  ) THEN
    RAISE EXCEPTION 'spec 107: la banda ya es colaboradora de un evento de su registro; revisar a mano';
  END IF;

  UPDATE public.event_collaborators ec
     SET user_id = banda
    FROM public.events e
   WHERE e.id = ec.event_id
     AND e.artist_id = registro
     AND ec.user_id = prueba;

  UPDATE public.artists
     SET profile_id = banda,
         name = 'Santiago Samba Club'
   WHERE id = registro;
END $$;
