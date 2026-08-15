-- Spec 047 — Seguir músicos y locales
-- Independiente del spec 046 (no depende de sus columnas ni funciones).

CREATE TABLE public.follows_musicians (
  follower_id  uuid        NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  musician_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, musician_id)
);
CREATE INDEX follows_musicians_musician_idx ON public.follows_musicians (musician_id);

CREATE TABLE public.follows_venues (
  follower_id  uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  venue_id     uuid        NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, venue_id)
);
CREATE INDEX follows_venues_venue_idx ON public.follows_venues (venue_id);

ALTER TABLE public.follows_musicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows_venues    ENABLE ROW LEVEL SECURITY;

CREATE POLICY follows_musicians_select ON public.follows_musicians FOR SELECT
  USING ((select auth.uid()) = follower_id);
CREATE POLICY follows_musicians_insert ON public.follows_musicians FOR INSERT
  WITH CHECK (
    (select auth.uid()) = follower_id
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = musician_id AND role = 'musician')
  );
CREATE POLICY follows_musicians_delete ON public.follows_musicians FOR DELETE
  USING ((select auth.uid()) = follower_id);

CREATE POLICY follows_venues_select ON public.follows_venues FOR SELECT
  USING ((select auth.uid()) = follower_id);
CREATE POLICY follows_venues_insert ON public.follows_venues FOR INSERT
  WITH CHECK ((select auth.uid()) = follower_id);
CREATE POLICY follows_venues_delete ON public.follows_venues FOR DELETE
  USING ((select auth.uid()) = follower_id);
