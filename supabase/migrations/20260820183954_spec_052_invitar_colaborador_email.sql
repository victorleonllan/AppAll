-- Spec 052 — Invitar a un colaborador de evento que todavía no tiene cuenta
-- Diseño completo: sonopolisWeb/specs/w032-datos-invitar-colaborador-email.md
-- Aditivo puro: no toca event_collaborators, events ni ninguna función del spec 033.

CREATE TABLE public.event_collaborator_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL,
  can_delete  boolean     NOT NULL DEFAULT false,
  invited_by  uuid        NOT NULL REFERENCES auth.users(id),
  status      text        NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT event_collaborator_invites_role_check
    CHECK (role IN ('admin','editor')),
  CONSTRAINT event_collaborator_invites_status_check
    CHECK (status IN ('pending','accepted','revoked')),
  CONSTRAINT event_collaborator_invites_email_lower
    CHECK (email = lower(email))
);

CREATE UNIQUE INDEX event_collaborator_invites_one_pending
  ON public.event_collaborator_invites (event_id, email) WHERE status = 'pending';

CREATE INDEX event_collaborator_invites_email_idx
  ON public.event_collaborator_invites (email) WHERE status = 'pending';

ALTER TABLE public.event_collaborator_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY eci_select ON public.event_collaborator_invites FOR SELECT
  USING (public.can_manage_team(event_id));

CREATE POLICY eci_insert ON public.event_collaborator_invites FOR INSERT
  WITH CHECK (
    public.can_manage_team(event_id)
    AND invited_by = auth.uid()
    AND (can_delete = false OR public.event_role_of(event_id) = 'owner')
  );

CREATE POLICY eci_update_revoke ON public.event_collaborator_invites FOR UPDATE
  USING      (status = 'pending' AND public.can_manage_team(event_id))
  WITH CHECK (status = 'revoked');

CREATE OR REPLACE FUNCTION public.claim_event_collaborator_invites()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.event_collaborators (event_id, user_id, role, can_delete, source, invited_by)
  SELECT i.event_id, NEW.id, i.role, i.can_delete, 'invited', i.invited_by
    FROM public.event_collaborator_invites i
   WHERE i.status = 'pending' AND i.email = lower(NEW.email)
  ON CONFLICT (event_id, user_id) DO NOTHING;

  UPDATE public.event_collaborator_invites
     SET status = 'accepted', accepted_at = now()
   WHERE status = 'pending' AND email = lower(NEW.email);

  RETURN NEW;
END; $$;

CREATE TRIGGER claim_event_collaborator_invites_trg
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.claim_event_collaborator_invites();
