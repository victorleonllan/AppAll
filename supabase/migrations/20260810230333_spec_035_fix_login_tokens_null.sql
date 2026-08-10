-- Spec 035 — Fix: login roto por columnas de token NULL en auth.users
-- Ver specs/035-fix-login-tokens-null-cuentas-prueba.md para el diagnóstico completo.
--
-- GoTrue escanea confirmation_token, recovery_token, email_change_token_new,
-- email_change, email_change_token_current, phone_change, phone_change_token y
-- reauthentication_token como string no-nullable en Go. Una fila con NULL en
-- cualquiera de esas columnas revienta CUALQUIER lectura de esa fila —login,
-- admin.getUserById, admin.listUsers, búsqueda por email— con un 500 genérico
-- ("Database error querying schema" / "...loading user" / "...finding users"),
-- sin importar la contraseña.
--
-- Causa: filas insertadas directo por SQL (fuera de supabase.auth.signUp()) dejan
-- esas columnas en su default real de la tabla, que es NULL. El signUp de la API
-- sí las deja en '' porque GoTrue las inicializa así al crear el usuario.
--
-- Ya se corrigió a mano en producción la fila de musico@prueba.appall
-- (id 3e8bbba0-e2d8-4d06-a723-fdf7bac23d27) vía un UPDATE puntual. Esta migración
-- formaliza ese fix como reproducible y lo generaliza a cualquier otra fila que
-- tenga el mismo problema, presente o futura. Es un no-op para filas ya sanas
-- (COALESCE no toca lo que no es NULL), así que correrla de nuevo no rompe nada.

UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token              = COALESCE(recovery_token, ''),
  email_change_token_new      = COALESCE(email_change_token_new, ''),
  email_change                = COALESCE(email_change, ''),
  email_change_token_current  = COALESCE(email_change_token_current, ''),
  phone_change                = COALESCE(phone_change, ''),
  phone_change_token          = COALESCE(phone_change_token, ''),
  reauthentication_token      = COALESCE(reauthentication_token, '')
WHERE confirmation_token        IS NULL
   OR recovery_token             IS NULL
   OR email_change_token_new     IS NULL
   OR email_change               IS NULL
   OR email_change_token_current IS NULL
   OR phone_change               IS NULL
   OR phone_change_token         IS NULL
   OR reauthentication_token     IS NULL;
