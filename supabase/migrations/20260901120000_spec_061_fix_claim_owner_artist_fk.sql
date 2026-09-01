-- Spec 061 (fix) — events_claim_owner() insertaba NEW.artist_id como user_id
-- de event_collaborators, pero desde el spec 061 artist_id ya no apunta a
-- una cuenta (profiles/auth.users) sino a `artists.id` (placeholder de
-- banda, tabla propia). event_collaborators.user_id sigue con FK a
-- auth.users(id), así que cualquier evento creado con artista elegido vía
-- ArtistaSelect (spec w045) violaba event_collaborators_user_id_fkey al
-- cerrar "Crear Evento" — ver bug reportado 2026-09-01, detalle en
-- specs/061-tabla-artists-placeholder.md → "Bugs encontrados al aplicar".
--
-- Fix: solo agregar al equipo al músico real detrás del artista, si existe
-- (artists.profile_id, seteado cuando el placeholder ya fue reclamado por
-- una cuenta). Si el artista es un placeholder sin reclamar, no hay a quién
-- agregar — el evento igual se crea, solo que sin ese tercer colaborador.

CREATE OR REPLACE FUNCTION public.events_claim_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.event_collaborators (event_id, user_id, role, can_delete, source)
  VALUES (NEW.id, NEW.created_by, 'owner', true, 'claim');

  -- El dueño del local, si existe y no es el mismo que creó.
  INSERT INTO public.event_collaborators (event_id, user_id, role, can_delete, source)
  SELECT NEW.id, v.owner_id, 'admin', false, 'venue_owner'
    FROM public.venues v
   WHERE v.id = NEW.venue_id AND v.owner_id IS NOT NULL AND v.owner_id <> NEW.created_by
  ON CONFLICT DO NOTHING;

  -- El músico real detrás del artista (spec 061: artist_id apunta a
  -- `artists`, no a una cuenta — solo hay a quién agregar si el placeholder
  -- ya fue reclamado, es decir artists.profile_id no es null).
  INSERT INTO public.event_collaborators (event_id, user_id, role, can_delete, source)
  SELECT NEW.id, a.profile_id, 'admin', false, 'artist'
    FROM public.artists a
   WHERE a.id = NEW.artist_id
     AND a.profile_id IS NOT NULL
     AND a.profile_id <> NEW.created_by
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;
