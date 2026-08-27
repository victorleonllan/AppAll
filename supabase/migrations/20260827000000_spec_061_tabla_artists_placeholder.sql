-- Spec 061 — Tabla `artists`: placeholder de banda simétrico al de local (`venues`).
-- Ver specs/061-tabla-artists-placeholder.md para el diseño completo.

CREATE TABLE public.artists (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  genero      TEXT,
  comuna      TEXT,
  contacto    TEXT,
  instagram   TEXT,
  image       TEXT,
  created_by  UUID REFERENCES auth.users(id),
  profile_id  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY artists_select ON public.artists FOR SELECT USING (true);

CREATE POLICY artists_insert ON public.artists FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Solo quien la creó, o el músico que ya la reclamó (profile_id), puede editarla.
-- El reclamo en sí (setear profile_id la primera vez) no tiene pantalla todavía
-- (fuera de alcance del spec 061) — la policy ya lo permite para cuando exista.
CREATE POLICY artists_update ON public.artists FOR UPDATE
  USING (auth.uid() = created_by OR auth.uid() = profile_id);

-- 1. Una fila en artists por cada músico que ya tiene cuenta — nace ya reclamada
--    (profile_id = su propio id).
INSERT INTO public.artists (name, profile_id, created_by, created_at)
SELECT p.nombre, p.id, p.id, p.created_at
FROM public.profiles p
WHERE p.role = 'musician';

-- 2. Repuntar los eventos que ya enlazaban a un profile de músico, antes de
--    cambiar el FK.
UPDATE public.events e
SET artist_id = a.id
FROM public.artists a
WHERE a.profile_id = e.artist_id;

-- 3. Cambiar events.artist_id de "apunta a profiles" a "apunta a artists".
ALTER TABLE public.events DROP CONSTRAINT events_artist_id_fkey;
ALTER TABLE public.events
  ADD CONSTRAINT events_artist_id_fkey FOREIGN KEY (artist_id)
  REFERENCES public.artists(id) ON DELETE SET NULL;
