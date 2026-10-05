-- Spec 106 — Todo perfil tiene país desde que nace.
-- Ver specs/106-datos-pais-del-perfil.md
--
-- Decisión de Victor (5-oct-2026): el músico dice de qué país es; ese país filtra
-- músicos y decide en qué país (y con qué medios de pago) se crea su evento. Es de
-- todo perfil y no solo de los músicos porque el rol no está fijo al nacer la cuenta:
-- con Google nace `fan` y recién después se elige en /quien-eres (set_my_role).

-- 1. profiles.pais ------------------------------------------------------------------

-- FK a paises_cobro: es el único catálogo de países de la base, y un país que no
-- está ahí no tiene cómo cobrar.
ALTER TABLE public.profiles ADD COLUMN pais char(2) REFERENCES public.paises_cobro(pais);

-- Backfill: Victor confirmó que todas las cuentas existentes se crearon en el
-- entorno de Chile — es un hecho, no un default de conveniencia.
UPDATE public.profiles SET pais = 'CL';

ALTER TABLE public.profiles ALTER COLUMN pais SET NOT NULL;

-- Addenda del spec 106 (5-oct-2026): el spec decía "sin DEFAULT", pero la app nativa
-- guarda el perfil con `upsert` (EditarPerfilBandaScreen, PerfilMusicoScreen) sin
-- mandar `pais`, y Postgres revisa el NOT NULL de la fila propuesta aunque el upsert
-- termine en UPDATE (verificado en local): sin DEFAULT, ningún músico podría volver a
-- guardar su perfil desde la app. 'CL' porque la app nativa solo opera en Chile. El
-- UPDATE del upsert no toca `pais` (no viaja en el payload), así que no pisa el país
-- de nadie. handle_new_user lo sigue escribiendo explícito.
ALTER TABLE public.profiles ALTER COLUMN pais SET DEFAULT 'CL';

-- Público para los músicos sin policy nueva: «Perfiles de músicos son públicos» ya
-- expone su fila entera.

-- 2. handle_new_user: el país del entorno donde se registró ----------------------------
--
-- Parte de pg_get_functiondef en producción (5-oct-2026). Un solo cambio: `pais`.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- text y no char(2): con char(2), un "pais" de 3 letras en los metadatos haría
  -- fallar la asignación misma, y con ella la cuenta.
  v_pais text;
BEGIN
  -- Spec 106. Si falta o no está en el catálogo, Chile — nunca un error: si este
  -- trigger lanza, Supabase rechaza la cuenta entera con un "Database error saving
  -- new user" que no explica nada. La app nativa (solo Chile) y Google (OAuth no
  -- manda `data`) no traen país; el de Google lo corrige la web en /quien-eres.
  v_pais := NEW.raw_user_meta_data->>'pais';
  IF v_pais IS NULL OR NOT EXISTS (SELECT 1 FROM public.paises_cobro WHERE pais = v_pais) THEN
    v_pais := 'CL';
  END IF;

  INSERT INTO public.profiles (id, role, nombre, pais)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.raw_user_meta_data->>'role' = 'musician'        THEN 'musician'
      WHEN NEW.raw_user_meta_data->>'role' IN ('cafe','local') THEN 'local'
      ELSE 'fan'
    END,
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    v_pais
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
