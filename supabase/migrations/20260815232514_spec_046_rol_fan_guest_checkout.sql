-- Spec 046 — Rol fan, rename cafe→local, guest checkout y claim por email
--
-- Orden (no reordenar):
--   1. profiles.role: backfill 'public'→'fan' y 'cafe'→'local' + CHECK nuevo
--   2. auth.users.raw_user_meta_data: mismo backfill del lado del JWT (cierra W-013 y la
--      deuda que spec 032 dejó abierta a propósito)
--   3. handle_new_user(): default pasa a 'fan'; 'cafe' se acepta como alias de 'local'
--   4. set_my_role(p_role) — el RPC que W-013 dejó especificado, valida {fan,musician,local}
--   5. search_collaborator_candidates(q): CREATE OR REPLACE, 'cafe'→'local' (spec 033
--      no se edita retroactivamente, se reemplaza acá)
--   6. tickets: user_id nullable + guest_email + CHECK XOR + índice parcial
--   7. _reservar_ticket_shared(): la lógica de reserva de reservar_ticket_pending, factorizada
--   8. reservar_ticket_pending(): pasa a ser un wrapper delgado sobre 7 (mismo comportamiento externo)
--   9. reservar_ticket_pending_guest(): mismo wrapper, para compradores sin sesión
--  10. claim_guest_tickets() + trigger en auth.users
--  11. guest_ticket_status() / guest_ticket_items(): lectura para el invitado antes de reclamar
--  12. comprador_de(): ajustada para mostrar guest_email cuando el ticket no tiene dueño aún

-- ---------------------------------------------------------- 1. profiles.role
-- El DROP va antes del backfill: el CHECK viejo ({public,musician,cafe}) rechaza
-- 'fan'/'local' si el UPDATE corre primero (encontrado al aplicar esta migración
-- el 2026-08-15 — el orden original del plan estaba invertido).
ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;

UPDATE public.profiles SET role = 'fan'   WHERE role = 'public';
UPDATE public.profiles SET role = 'local' WHERE role = 'cafe';

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['fan','musician','local']));

-- ---------------------------------------------------------- 2. auth.users (drift W-013 + rename)
UPDATE auth.users
   SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role','fan')
 WHERE raw_user_meta_data->>'role' = 'public';

UPDATE auth.users
   SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role','local')
 WHERE raw_user_meta_data->>'role' = 'cafe';

-- ---------------------------------------------------------- 3. handle_new_user()
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
    -- 'public' ya no es legal: cualquier cosa que no sea reconocida cae a 'fan'.
    -- 'cafe' se acepta como alias de 'local': AppAll (la app móvil, React Native)
    -- todavía tiene role === 'cafe' sin actualizar en navigation/index.tsx,
    -- AuthScreen.tsx y RegisterScreen.tsx (deuda señalada por el spec 032, no
    -- resuelta) — sin este alias, un dueño de local que se registra desde la app
    -- quedaría clasificado como 'fan'. sonopolisWeb ya manda 'local' y no necesita
    -- el alias, pero dejarlo puesto no le hace daño.
    CASE
      WHEN NEW.raw_user_meta_data->>'role' = 'musician'        THEN 'musician'
      WHEN NEW.raw_user_meta_data->>'role' IN ('cafe','local') THEN 'local'
      ELSE 'fan'
    END,
    COALESCE(NEW.raw_user_meta_data->>'nombre', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
-- El REVOKE de PUBLIC/anon/authenticated ya está aplicado (spec 019);
-- CREATE OR REPLACE no lo resetea, no hace falta repetirlo.

-- ---------------------------------------------------------- 4. set_my_role() — spec W-013
CREATE OR REPLACE FUNCTION public.set_my_role(p_role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no_autenticado';
  END IF;
  -- Sin alias para 'cafe' acá a propósito: este RPC no existe todavía en producción,
  -- no tiene ningún caller legado que lo invoque con el valor viejo. Quien lo llame
  -- lo escribe contra este contrato desde el día uno.
  IF p_role NOT IN ('fan','musician','local') THEN
    RAISE EXCEPTION 'rol_invalido: % no es un rol válido', p_role;
  END IF;

  UPDATE public.profiles SET role = p_role, updated_at = now() WHERE id = auth.uid();

  UPDATE auth.users
     SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', p_role)
   WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_role(text) TO authenticated;

-- ---------------------------------------------------------- 5. search_collaborator_candidates(): cafe→local
-- Definida en spec 033 (20260810080442_spec_033_propiedad_colaboradores_evento.sql).
-- Los specs aplicados no se editan retroactivamente: esta migración la reemplaza con
-- CREATE OR REPLACE, mismo cuerpo salvo el rol buscado. Grants sin cambios respecto al
-- spec 033 (no tenía REVOKE explícito; get_advisors ya marca esto como WARN
-- preexistente, no introducido por esta migración).
CREATE OR REPLACE FUNCTION public.search_collaborator_candidates(q text)
RETURNS TABLE(id uuid, nombre text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nombre, p.role
    FROM public.profiles p
   WHERE p.role IN ('musician','local')
     AND p.nombre ILIKE '%' || q || '%'
   LIMIT 20;
$$;

-- ---------------------------------------------------------- 6. tickets: guest checkout
ALTER TABLE public.tickets ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.tickets ADD COLUMN guest_email text;

ALTER TABLE public.tickets ADD CONSTRAINT tickets_owner_xor_guest
  CHECK ((user_id IS NULL) <> (guest_email IS NULL));
ALTER TABLE public.tickets ADD CONSTRAINT tickets_guest_email_lower
  CHECK (guest_email IS NULL OR guest_email = lower(guest_email));

CREATE INDEX tickets_guest_email_idx ON public.tickets (guest_email)
  WHERE guest_email IS NOT NULL;

-- ---------------------------------------------------------- 7. lógica de reserva compartida
CREATE OR REPLACE FUNCTION public._reservar_ticket_shared(
  p_evento_id uuid, p_cantidad integer, p_preference_id text,
  p_user_id uuid, p_guest_email text
) RETURNS public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_evento   public.events%ROWTYPE;
  v_aforo    integer;
  v_ocupado  integer;
  v_ticket   public.tickets%ROWTYPE;
BEGIN
  IF (p_user_id IS NULL) = (p_guest_email IS NULL) THEN
    RAISE EXCEPTION 'identidad_invalida: se requiere exactamente uno de user_id o guest_email';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 10 THEN
    RAISE EXCEPTION 'cantidad_invalida: % no es válida', p_cantidad;
  END IF;

  SELECT * INTO v_evento FROM public.events WHERE id = p_evento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_existe: %', p_evento_id;
  END IF;
  IF v_evento.status IN ('cancelled', 'draft') THEN
    RAISE EXCEPTION 'evento_no_vende: % está en estado %', p_evento_id, v_evento.status;
  END IF;

  SELECT v.aforo INTO v_aforo FROM public.venues v WHERE v.id = v_evento.venue_id;
  IF v_aforo IS NOT NULL THEN
    SELECT COALESCE(SUM(cantidad), 0) INTO v_ocupado
      FROM public.tickets
     WHERE evento_id = p_evento_id AND status IN ('pending', 'completed');
    IF v_ocupado + p_cantidad > v_aforo THEN
      RAISE EXCEPTION 'sin_cupo: quedan % de % entradas', GREATEST(v_aforo - v_ocupado, 0), v_aforo;
    END IF;
  END IF;

  INSERT INTO public.tickets (evento_id, user_id, guest_email, status, preference_id, monto, cantidad)
  VALUES (p_evento_id, p_user_id, p_guest_email, 'pending', p_preference_id, v_evento.monto * p_cantidad, p_cantidad)
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END; $$;

REVOKE ALL ON FUNCTION public._reservar_ticket_shared(uuid, integer, text, uuid, text) FROM PUBLIC;
-- Sin GRANT: solo la llaman los dos wrappers de abajo, que corren como el dueño de
-- la función (SECURITY DEFINER) y no necesitan permiso propio para invocarla.

-- ---------------------------------------------------------- 8. reservar_ticket_pending() — con sesión
CREATE OR REPLACE FUNCTION public.reservar_ticket_pending(p_evento_id uuid, p_cantidad integer, p_preference_id text)
RETURNS public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no_autenticado';
  END IF;
  RETURN public._reservar_ticket_shared(p_evento_id, p_cantidad, p_preference_id, auth.uid(), NULL);
END; $$;
-- Firma y grants sin cambios respecto al spec 022: sigue SECURITY DEFINER,
-- sigue ejecutable solo por authenticated.

-- ---------------------------------------------------------- 9. reservar_ticket_pending_guest() — sin sesión
CREATE OR REPLACE FUNCTION public.reservar_ticket_pending_guest(
  p_evento_id uuid, p_cantidad integer, p_preference_id text, p_email text
) RETURNS public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_email IS NULL OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'email_invalido: %', p_email;
  END IF;
  RETURN public._reservar_ticket_shared(p_evento_id, p_cantidad, p_preference_id, NULL, lower(trim(p_email)));
END; $$;

REVOKE ALL ON FUNCTION public.reservar_ticket_pending_guest(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reservar_ticket_pending_guest(uuid, integer, text, text) TO anon, authenticated;

-- ---------------------------------------------------------- 10. claim al crear cuenta real
CREATE OR REPLACE FUNCTION public.claim_guest_tickets()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    UPDATE public.tickets
       SET user_id = NEW.id, guest_email = NULL
     WHERE guest_email = lower(NEW.email) AND user_id IS NULL;
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.claim_guest_tickets() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created_claim_guest_tickets ON auth.users;
CREATE TRIGGER on_auth_user_created_claim_guest_tickets
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.claim_guest_tickets();
-- Trigger hermano de on_auth_user_created (handle_new_user): mismo evento, responsabilidad
-- separada a propósito — mismo criterio que events_claim_owner_trg del spec 033.

-- ---------------------------------------------------------- 11. lectura para el invitado
CREATE OR REPLACE FUNCTION public.guest_ticket_status(p_ticket_id uuid)
RETURNS TABLE (id uuid, evento_id uuid, status text, cantidad integer, monto integer, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.evento_id, t.status, t.cantidad, t.monto, t.created_at
    FROM public.tickets t
   WHERE t.id = p_ticket_id AND t.user_id IS NULL;
$$;

REVOKE ALL ON FUNCTION public.guest_ticket_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_ticket_status(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.guest_ticket_items(p_ticket_id uuid)
RETURNS TABLE (id uuid, folio integer, qr_token text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ti.id, ti.folio, ti.qr_token, ti.status
    FROM public.ticket_items ti
    JOIN public.tickets t ON t.id = ti.ticket_id
   WHERE ti.ticket_id = p_ticket_id AND t.user_id IS NULL;
$$;

REVOKE ALL ON FUNCTION public.guest_ticket_items(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_ticket_items(uuid) TO anon, authenticated;

-- ---------------------------------------------------------- 12. comprador_de(): guest_email si aún no hay dueño
CREATE OR REPLACE FUNCTION public.comprador_de(p_ticket uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(p.nombre, t.guest_email)
    FROM public.tickets t
    LEFT JOIN public.profiles p ON p.id = t.user_id
   WHERE t.id = p_ticket;
$$;
-- GRANT/REVOKE de comprador_de no cambian (spec 040, solo authenticated):
-- CREATE OR REPLACE no los resetea. El INNER JOIN original pasa a LEFT JOIN
-- porque con user_id NULL el INNER no traía fila — perdía guest_email entero.
