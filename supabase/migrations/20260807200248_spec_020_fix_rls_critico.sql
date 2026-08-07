-- Spec 020 — Dos agujeros críticos de RLS

-- Agujero 1: policy con roles={public}, cmd=ALL, qual=true.
-- Pese al nombre, {public} en Postgres significa TODOS los roles (incluido anon):
-- concedía lectura/escritura/borrado de CUALQUIER perfil a CUALQUIERA.
-- El service role bypassa RLS por definición: esta policy nunca fue necesaria.
DROP POLICY IF EXISTS "Service role can manage all profiles" ON public.profiles;

-- VerMusicoScreen necesita que un local vea el perfil de un músico.
-- Los perfiles 'public' y 'cafe' quedan visibles solo para su dueño.
CREATE POLICY "Perfiles de músicos son públicos"
  ON public.profiles FOR SELECT
  USING (role = 'musician');

-- Agujero 2: with_check NULL en UPDATE => Postgres reutiliza qual como check,
-- así que un usuario podía setear status='completed' en su propio ticket
-- sin pasar por Mercado Pago (y alterar monto, cantidad y payment_id).
-- El cliente solo lee tickets; únicamente webhook-mp escribe, vía service role.
DROP POLICY IF EXISTS tickets_update_own ON public.tickets;
