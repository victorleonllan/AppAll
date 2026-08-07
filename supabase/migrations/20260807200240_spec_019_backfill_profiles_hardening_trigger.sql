-- Spec 019 — Perfiles huérfanos

-- 1. Backfill: replica la lógica de handle_new_user() para usuarios previos al trigger.
--    on_auth_user_created es AFTER INSERT: nunca rellenó a los que ya existían.
INSERT INTO public.profiles (id, role, nombre)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'role', 'public'),
  COALESCE(u.raw_user_meta_data->>'nombre', '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- 2. Hardening del trigger: search_path fijo + ON CONFLICT.
--    Sin ON CONFLICT, un perfil duplicado aborta el registro del usuario completo,
--    porque el trigger corre dentro de la transacción del INSERT en auth.users.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, nombre)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'public'),
    COALESCE(NEW.raw_user_meta_data->>'nombre', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3. La función es un trigger, no una RPC pública.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
