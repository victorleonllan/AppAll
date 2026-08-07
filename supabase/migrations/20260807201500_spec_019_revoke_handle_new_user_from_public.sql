-- Spec 019 (corrección) — el REVOKE de la migración anterior no bastaba.
--
-- Postgres concede EXECUTE a PUBLIC por defecto al crear una función.
-- anon y authenticated heredaban el privilegio de ahí, así que revocárselo
-- a ellos directamente no cambiaba nada: has_function_privilege seguía dando true.
-- Hay que revocar a PUBLIC.
--
-- Esto NO rompe el registro de usuarios: PostgreSQL comprueba el privilegio
-- EXECUTE al CREAR el trigger, no al dispararlo. Verificado con una sonda
-- transaccional revertida: el trigger creó el perfil con los tres roles
-- (anon, authenticated, supabase_auth_admin) ya sin privilegio EXECUTE.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
