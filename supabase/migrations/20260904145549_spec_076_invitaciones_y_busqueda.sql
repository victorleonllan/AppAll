-- Spec 076 — Dos arreglos del equipo de evento.

-- ---------------------------------------------------------------------------
-- 1. La búsqueda de colaboradores no encontraba a los locales.
--
-- El spec 046 renombró 'cafe' → 'local' con un UPDATE sobre profiles, pero esta
-- función (spec 033) siguió filtrando por 'cafe', que hoy tiene 0 filas. O sea:
-- el buscador de "Invitar" solo devolvía músicos, y un músico no podía sumar a
-- su local al equipo del evento.
--
-- 'cafe' NO se deja "por si acaso": dejarlo es lo que mantiene vivo el
-- vocabulario muerto que causó este bug.
--
-- Los 'fan' siguen fuera a propósito: el equipo de un evento es quien lo
-- trabaja, no el público.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_collaborator_candidates(q text)
RETURNS TABLE(id uuid, nombre text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nombre, p.role
    FROM public.profiles p
   WHERE p.role IN ('musician','local')
     AND p.nombre ILIKE '%' || q || '%'
   LIMIT 20;
$$;

-- ---------------------------------------------------------------------------
-- 2. Invitar por correo a alguien que YA tiene cuenta no hacía nada.
--
-- El trigger del spec 052 es AFTER INSERT ON auth.users: reclama la invitación
-- solo cuando la persona se registra. Si ya tenía cuenta, la fila quedaba
-- 'pending' para siempre y nadie la reclamaba nunca.
--
-- Se agrega el otro momento de la vida del usuario: iniciar sesión. GoTrue
-- actualiza last_sign_in_at en cada login, así que sirve de señal.
--
-- La función NO se duplica: la del spec 052 ya usa NEW.id/NEW.email y ya es
-- idempotente, así que sirve igual disparada por INSERT o por UPDATE.
--
-- En la base y no en el código de la web porque el mismo usuario entra también
-- desde la app nativa contra esta misma base; un reclamo en la web dejaría al
-- teléfono afuera.
--
-- El WHEN evita que corra en cada UPDATE a auth.users (metadata, refresh de
-- token) y no solo cuando hubo login de verdad.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS claim_event_collaborator_invites_login_trg ON auth.users;
CREATE TRIGGER claim_event_collaborator_invites_login_trg
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at)
  EXECUTE FUNCTION public.claim_event_collaborator_invites();
