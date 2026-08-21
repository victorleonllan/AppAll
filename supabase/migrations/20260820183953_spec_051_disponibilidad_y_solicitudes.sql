-- Spec 051 — Disponibilidad del músico y solicitudes de bolo (booking_requests)
-- Diseño completo: sonopolisWeb/specs/w031-datos-disponibilidad-y-solicitudes.md

ALTER TABLE public.profiles
  ADD COLUMN available boolean NOT NULL DEFAULT false;

CREATE TABLE public.booking_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  musician_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  venue_id     uuid        NOT NULL REFERENCES public.venues(id)   ON DELETE CASCADE,
  proposed_at  timestamptz,
  genre        text,
  note         text,
  status       text        NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_requests_status_check
    CHECK (status IN ('pending','accepted','declined','cancelled'))
);

CREATE INDEX booking_requests_musician_idx ON public.booking_requests (musician_id);
CREATE INDEX booking_requests_venue_idx    ON public.booking_requests (venue_id);

CREATE OR REPLACE FUNCTION public.is_booking_party(p_request uuid, p_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.booking_requests br
    JOIN public.venues v ON v.id = br.venue_id
    WHERE br.id = p_request
      AND (br.musician_id = p_user OR v.owner_id = p_user)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_booking_recipient(p_request uuid, p_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.booking_requests br
    JOIN public.venues v ON v.id = br.venue_id
    WHERE br.id = p_request
      AND br.created_by <> p_user
      AND (br.musician_id = p_user OR v.owner_id = p_user)
  );
$$;

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_requests_select ON public.booking_requests FOR SELECT
  USING (public.is_booking_party(id));

CREATE POLICY booking_requests_insert ON public.booking_requests FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      musician_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_id AND v.owner_id = auth.uid())
    )
  );

CREATE POLICY booking_requests_update_respond ON public.booking_requests FOR UPDATE
  USING      (status = 'pending' AND public.is_booking_recipient(id))
  WITH CHECK (status IN ('accepted','declined'));

CREATE POLICY booking_requests_update_cancel ON public.booking_requests FOR UPDATE
  USING      (status = 'pending' AND created_by = auth.uid())
  WITH CHECK (status = 'cancelled');

CREATE OR REPLACE FUNCTION public.booking_requests_set_responded_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('accepted','declined') AND OLD.status = 'pending' THEN
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER booking_requests_set_responded_at_trg
  BEFORE UPDATE ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.booking_requests_set_responded_at();
