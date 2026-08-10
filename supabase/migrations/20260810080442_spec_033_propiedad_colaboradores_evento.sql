-- Spec 033 — Propiedad y colaboradores de evento.
-- Ver specs/033-propiedad-y-colaboradores-de-evento.md para el diseño completo.
--
-- Orden de esta migración (no reordenar — el backfill tiene que ir ANTES de
-- reemplazar las policies de `events`: en cuanto dejan de mirar `created_by`,
-- un evento sin fila de owner queda inmodificable para todo el mundo):
--   1. event_collaborators + índices
--   2. ALTER TABLE events (status, cancelled_at, cancel_reason, artist_id)
--   3. Funciones de autorización (SECURITY DEFINER)
--   4. Triggers (alta al crear, columnas protegidas, guardrail de borrado)
--   5. Backfill: una fila owner por evento existente
--   6. Policies nuevas de events + policies de event_collaborators

-- ---------------------------------------------------------------- 1. tabla

CREATE TABLE IF NOT EXISTS public.event_collaborators (
  event_id    uuid        NOT NULL REFERENCES public.events(id)  ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  role        text        NOT NULL,
  can_delete  boolean     NOT NULL DEFAULT false,
  source      text        NOT NULL DEFAULT 'invited',
  invited_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id),
  CONSTRAINT event_collaborators_role_check
    CHECK (role IN ('owner','admin','editor')),
  CONSTRAINT event_collaborators_source_check
    CHECK (source IN ('claim','venue_owner','artist','invited','backfill')),
  -- El owner nunca puede quedar sin permiso de borrado: es la definición del rol.
  CONSTRAINT event_collaborators_owner_can_delete
    CHECK (role <> 'owner' OR can_delete)
);

-- Un solo owner por evento. Índice único PARCIAL: hace que "reclamar" sea una
-- operación con resultado único, no una carrera entre dos inserts concurrentes.
CREATE UNIQUE INDEX IF NOT EXISTS event_collaborators_one_owner
  ON public.event_collaborators (event_id) WHERE role = 'owner';

-- Para "mis eventos": el panel del músico y del local filtran por user_id.
CREATE INDEX IF NOT EXISTS event_collaborators_user_idx
  ON public.event_collaborators (user_id);

-- ---------------------------------------------------------------- 2. events

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS status        text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS artist_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_status_check CHECK (status IN ('draft','published','cancelled'));

-- ---------------------------------------------------------- 3. autorización
--
-- Las policies de event_collaborators necesitan consultar event_collaborators
-- ("puedes ver al equipo si eres del equipo"). Escrito directo en la policy,
-- eso es recursión infinita: Postgres evalúa la policy de la tabla para
-- resolver la subconsulta contra la misma tabla. La salida estándar es una
-- función SECURITY DEFINER: corre con los privilegios del dueño y por lo
-- tanto no dispara RLS.
--
-- ⚠️ SECURITY DEFINER es exactamente la clase de objeto que causó el agujero
-- del spec 020. Las cuatro de abajo solo devuelven booleanos sobre el
-- auth.uid() de quien llama (salvo event_role_of, de lectura), ninguna
-- escribe, y SET search_path = public no es adorno: sin él, una función
-- SECURITY DEFINER resuelve nombres contra el search_path de quien la llama
-- y se vuelve un vector de escalada.

CREATE OR REPLACE FUNCTION public.event_role_of(p_event uuid, p_user uuid DEFAULT auth.uid())
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.event_collaborators
   WHERE event_id = p_event AND user_id = p_user;
$$;

-- Cualquier miembro del equipo edita.
CREATE OR REPLACE FUNCTION public.can_edit_event(p_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.event_role_of(p_event) IS NOT NULL;
$$;

-- owner y admin gestionan el equipo.
CREATE OR REPLACE FUNCTION public.can_manage_team(p_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.event_role_of(p_event) IN ('owner','admin');
$$;

-- El owner siempre; los demás solo con el permiso explícito.
CREATE OR REPLACE FUNCTION public.can_delete_event(p_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_collaborators
     WHERE event_id = p_event AND user_id = auth.uid()
       AND (role = 'owner' OR can_delete)
  );
$$;

-- ---------------------------------------------------------------- 4a. alta

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

  -- El artista, si está vinculado a un perfil real.
  INSERT INTO public.event_collaborators (event_id, user_id, role, can_delete, source)
  SELECT NEW.id, NEW.artist_id, 'admin', false, 'artist'
   WHERE NEW.artist_id IS NOT NULL AND NEW.artist_id <> NEW.created_by
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS events_claim_owner_trg ON public.events;
CREATE TRIGGER events_claim_owner_trg
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_claim_owner();

-- ------------------------------------------------------- 4b. columnas protegidas
--
-- RLS decide SI se puede escribir la fila, nunca QUÉ columnas cambiaron (no ve
-- OLD). Dos reglas que las policies no pueden expresar quedan en trigger:
--   - created_by es inmutable: un editor no reescribe la historia del evento.
--   - pasar a 'cancelled' exige can_delete_event(), no solo can_edit_event():
--     sin esto, cualquier editor cancela el show por la puerta de atrás de un UPDATE.

CREATE OR REPLACE FUNCTION public.events_guard_protected_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'created_by es inmutable';
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    IF NOT public.can_delete_event(OLD.id) THEN
      RAISE EXCEPTION 'Solo quien tiene permiso de borrado puede cancelar el evento';
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS events_guard_protected_columns_trg ON public.events;
CREATE TRIGGER events_guard_protected_columns_trg
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_guard_protected_columns();

-- --------------------------------------------------- 4c. guardrail de borrado
--
-- Un evento sin entradas se borra; un evento con entradas solo se cancela.
-- `pending` cuenta igual que `completed`: puede haber un pago de Mercado Pago
-- en vuelo, y borrar el evento debajo de una compra en curso deja al
-- comprador sin destino.

CREATE OR REPLACE FUNCTION public.events_block_delete_with_tickets()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tickets
              WHERE evento_id = OLD.id AND status IN ('pending','completed')) THEN
    RAISE EXCEPTION
      'El evento tiene entradas vendidas o en proceso: cancélalo en vez de borrarlo';
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS events_block_delete_with_tickets_trg ON public.events;
CREATE TRIGGER events_block_delete_with_tickets_trg
  BEFORE DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_block_delete_with_tickets();

-- ------------------------------------------------------------- 5. backfill
--
-- Tiene que correr ANTES de reemplazar las policies de events (paso 6): en
-- cuanto events_update/events_delete dejan de mirar created_by, un evento sin
-- fila de owner queda inmodificable para todo el mundo, incluido quien lo creó.

INSERT INTO public.event_collaborators (event_id, user_id, role, can_delete, source)
SELECT id, created_by, 'owner', true, 'backfill' FROM public.events
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------- 6. policies events

DROP POLICY IF EXISTS events_select ON public.events;
CREATE POLICY events_select ON public.events FOR SELECT
  USING (status <> 'draft' OR public.can_edit_event(id));

DROP POLICY IF EXISTS events_update ON public.events;
CREATE POLICY events_update ON public.events FOR UPDATE
  USING      (public.can_edit_event(id))
  WITH CHECK (public.can_edit_event(id));   -- explícito: la lección del spec 020

DROP POLICY IF EXISTS events_delete ON public.events;
CREATE POLICY events_delete ON public.events FOR DELETE
  USING (public.can_delete_event(id));

-- events_insert NO cambia: sigue exigiendo auth.uid() = created_by.
-- El reclamo del rol owner ocurre después, en events_claim_owner_trg.

-- ------------------------------------------------- 6b. policies collaborators

ALTER TABLE public.event_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY ec_select ON public.event_collaborators FOR SELECT
  USING (public.can_edit_event(event_id));

-- Un admin invita, pero no puede repartir can_delete: eso es del owner.
CREATE POLICY ec_insert ON public.event_collaborators FOR INSERT
  WITH CHECK (
    public.can_manage_team(event_id)
    AND role <> 'owner'
    AND (can_delete = false OR public.event_role_of(event_id) = 'owner')
  );

CREATE POLICY ec_update ON public.event_collaborators FOR UPDATE
  USING (public.can_manage_team(event_id) AND role <> 'owner')
  WITH CHECK (
    public.can_manage_team(event_id)
    AND role <> 'owner'
    AND (can_delete = false OR public.event_role_of(event_id) = 'owner')
  );

-- Quitar a alguien, o renunciar uno mismo. Al owner no lo saca nadie: para
-- sacarlo hay que transferir primero (ver transfer_event_ownership abajo).
CREATE POLICY ec_delete ON public.event_collaborators FOR DELETE
  USING (role <> 'owner' AND (public.can_manage_team(event_id) OR user_id = auth.uid()));

-- ------------------------------------------------ 7. transferir propiedad
--
-- El índice único parcial se evalúa por fila, no al final de la transacción:
-- si el cliente promueve al nuevo owner antes de degradar al viejo, el
-- segundo owner choca contra el índice y la operación falla a medias. El
-- orden correcto no puede quedar en manos de la app.

CREATE OR REPLACE FUNCTION public.transfer_event_ownership(p_event uuid, p_new_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.event_role_of(p_event) <> 'owner' THEN
    RAISE EXCEPTION 'Solo el dueño del evento puede transferir la propiedad';
  END IF;

  UPDATE public.event_collaborators                        -- 1. degradar
     SET role = 'admin'
   WHERE event_id = p_event AND role = 'owner';

  INSERT INTO public.event_collaborators                    -- 2. promover
         (event_id, user_id, role, can_delete, source, invited_by)
  VALUES (p_event, p_new_owner, 'owner', true, 'claim', auth.uid())
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET role = 'owner', can_delete = true;
END; $$;

-- ------------------------------------------- 8. buscar a quién invitar
--
-- Tras el spec 020, `profiles` solo expone role='musician' a terceros. Un
-- dueño de local es invisible para todos menos para sí mismo, así que no se
-- lo puede encontrar por nombre para invitarlo. Esta función SECURITY DEFINER
-- devuelve solo id, nombre y role — nunca teléfono ni email, que son las
-- columnas que el spec 030 agregó y que el 020 protege.

CREATE OR REPLACE FUNCTION public.search_collaborator_candidates(q text)
RETURNS TABLE(id uuid, nombre text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nombre, p.role
    FROM public.profiles p
   WHERE p.role IN ('musician','cafe')
     AND p.nombre ILIKE '%' || q || '%'
   LIMIT 20;
$$;
