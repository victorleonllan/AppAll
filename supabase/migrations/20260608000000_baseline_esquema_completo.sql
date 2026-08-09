-- Baseline del esquema de Sonópolis
--
-- Las tablas se crearon a mano desde el dashboard de Supabase, sin migraciones.
-- Esta migración reconstruye ese estado inicial para que `supabase db reset`
-- pueda levantar la base desde cero.
--
-- Generada por introspección del catálogo (pg_attribute, pg_constraint,
-- pg_indexes, pg_policies, pg_proc, pg_trigger) del proyecto
-- xluinfihjjtxkglihxqz el 2026-08-07, porque `supabase db pull` requiere Docker
-- y no está disponible en la máquina de desarrollo.
--
-- ⚠️ Representa el estado ANTERIOR al 12-jun-2026. Las migraciones que siguen
-- aplican sus cambios encima, así que acá aparece a propósito:
--   · profiles.genero          (se renombra a tipo_proyecto el 12-jun)
--   · profiles sin policies    (se agregan el 12-jun)
--   · venues.type ('cafe','venue')  (se amplía en el spec 018)
--   · tickets_update_own       (se elimina en el spec 020)
-- Alterar esto rompe la cadena: el RENAME COLUMN posterior fallaría.
--
-- NO incluye el esquema `auth`: lo gestiona Supabase y se crea solo.

-- ---------------------------------------------------------------- venues
CREATE TABLE IF NOT EXISTS public.venues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  type         text NOT NULL,
  owner_id     uuid REFERENCES auth.users(id),
  address      text,
  description  text,
  estilo       text,
  rating       numeric(2,1) DEFAULT 0,
  lat          numeric(10,7),
  lng          numeric(10,7),
  image        text,
  created_at   timestamptz DEFAULT now(),
  CONSTRAINT venues_type_check CHECK (type IN ('cafe','venue'))
);

-- ---------------------------------------------------------------- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id),
  role        text NOT NULL,
  nombre      text,
  created_at  timestamptz DEFAULT now(),
  genero      text,   -- renombrada a tipo_proyecto en 20260612192127
  bio         text,
  instagram   text,
  spotify     text,
  youtube     text,
  foto        text,
  CONSTRAINT profiles_role_check CHECK (role IN ('public','musician','cafe'))
);

-- ---------------------------------------------------------------- events
CREATE TABLE IF NOT EXISTS public.events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_name  text NOT NULL,
  venue_id     uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  venue_name   text NOT NULL,
  fecha        text NOT NULL,
  hora         text NOT NULL,
  genero       text NOT NULL,
  precio       text NOT NULL,
  imagen       text,
  created_by   uuid NOT NULL REFERENCES auth.users(id),
  created_at   timestamptz DEFAULT now(),
  monto        integer DEFAULT 0
);

-- ---------------------------------------------------------------- tickets
CREATE TABLE IF NOT EXISTS public.tickets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id),
  status         text NOT NULL DEFAULT 'pending',
  preference_id  text NOT NULL DEFAULT '',
  payment_id     text,
  monto          integer NOT NULL,
  cantidad       integer NOT NULL DEFAULT 1,
  created_at     timestamptz DEFAULT now(),
  CONSTRAINT tickets_status_check
    CHECK (status IN ('pending','completed','refunded','cancelled'))
);

-- ---------------------------------------------------------------- RLS
ALTER TABLE public.venues   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets  ENABLE ROW LEVEL SECURITY;

-- venues: catálogo público, escritura solo del dueño
CREATE POLICY venues_select ON public.venues FOR SELECT USING (true);
CREATE POLICY venues_insert ON public.venues FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY venues_update ON public.venues FOR UPDATE USING (auth.uid() = owner_id);

-- events: cartelera pública, escritura solo del creador
CREATE POLICY events_select ON public.events FOR SELECT USING (true);
CREATE POLICY events_insert ON public.events FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY events_update ON public.events FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY events_delete ON public.events FOR DELETE USING (auth.uid() = created_by);

-- tickets: el comprador ve los suyos; el dueño del evento ve sus ventas
CREATE POLICY tickets_insert ON public.tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY tickets_select_own ON public.tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY tickets_select_event_owner ON public.tickets FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.events
          WHERE events.id = tickets.evento_id AND events.created_by = auth.uid())
);
-- ⚠️ with_check NULL => Postgres reutiliza qual como check, permitiendo que el
-- usuario altere status/monto de sus propios tickets. El spec 020 la elimina.
CREATE POLICY tickets_update_own ON public.tickets FOR UPDATE USING (auth.uid() = user_id);

-- profiles: sin policies todavía; llegan en 20260612191547.

-- ---------------------------------------------------------------- trigger
-- Crea el perfil al registrarse un usuario. El hardening (search_path fijo,
-- ON CONFLICT, REVOKE a PUBLIC) llega en el spec 019.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, nombre)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'public'),
    COALESCE(NEW.raw_user_meta_data->>'nombre', '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
