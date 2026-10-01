-- Spec 102 — El admin da un evento por pagado y lo cierra, en una sola acción.
--
-- Depende de: spec 074/077 (es_admin_sonopolis, monto_a_transferir, policies
-- event_payouts_*_admin), spec 075 (estados de pago), spec 078 (el admin edita
-- cualquier evento vía can_edit_event).

-- 1. El cierre vive en `events` y no en `event_payouts`: el músico colaborador
--    tiene que verlo (pinta su card en gris) y `event_payouts` solo lo leen el
--    owner y el admin, porque ahí hay un número de cuenta. NULL = abierto.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES auth.users(id);

-- 2. Solo el admin escribe el cierre. Trigger aparte y SECURITY INVOKER, no
--    dentro de events_guard_protected_columns: esa es SECURITY DEFINER, y ahí
--    current_user sería siempre su dueño (lección del spec W-048). Sin esto,
--    un colaborador con can_edit_event podría cerrarse su propio evento.
CREATE OR REPLACE FUNCTION public.events_guard_cierre()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF (NEW.closed_at IS DISTINCT FROM OLD.closed_at
      OR NEW.closed_by IS DISTINCT FROM OLD.closed_by)
     AND NOT public.es_admin_sonopolis()
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'El cierre de un evento lo marca Sonópolis';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS events_guard_cierre_trg ON public.events;
CREATE TRIGGER events_guard_cierre_trg
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_guard_cierre();

-- 3. Paga si hace falta y cierra, en una sola transacción. SECURITY INVOKER,
--    como marcar_pago_evento: el admin escribe con su sesión y lo dejan pasar
--    event_payouts_update_admin y events_update (can_edit_event, spec 078).
--
--    A diferencia de marcar_pago_evento, NO exige que el organizador haya
--    reclamado: decisión de Victor (30-sep-2026), p. ej. si se le transfirió
--    por fuera. marcar_pago_evento sigue igual.
CREATE OR REPLACE FUNCTION public.cerrar_evento(p_event uuid)
RETURNS public.events
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_evento public.events;
  v_payout public.event_payouts;
  v_monto  integer;
BEGIN
  IF NOT public.es_admin_sonopolis() THEN
    RAISE EXCEPTION 'Solo un admin de Sonópolis cierra un evento';
  END IF;

  SELECT * INTO v_evento FROM public.events WHERE id = p_event;
  IF v_evento.id IS NULL THEN
    RAISE EXCEPTION 'Ese evento no existe';
  END IF;

  -- Idempotente: dos clicks seguidos no mueven closed_at ni pagado_at.
  IF v_evento.closed_at IS NOT NULL THEN
    RETURN v_evento;
  END IF;

  -- Un cancelado con ventas es un reembolso: fuera de alcance.
  IF v_evento.status = 'cancelled' THEN
    RAISE EXCEPTION 'Un evento cancelado no se cierra';
  END IF;

  -- No se cierra lo que no pasó: el monto todavía puede cambiar.
  IF v_evento.comienza_at IS NULL OR v_evento.comienza_at > now() THEN
    RAISE EXCEPTION 'El evento todavía no ocurre';
  END IF;

  v_monto := public.monto_a_transferir(p_event);

  IF v_monto > 0 THEN
    SELECT * INTO v_payout FROM public.event_payouts WHERE event_id = p_event;

    -- Cerrarlo igual borraría la única señal de que a alguien se le debe plata.
    IF v_payout.event_id IS NULL THEN
      RAISE EXCEPTION 'Ese evento tiene plata por transferir y no tiene datos bancarios';
    END IF;

    IF v_payout.status <> 'pagado' THEN
      UPDATE public.event_payouts
         SET status       = 'pagado',
             pagado_at    = now(),
             pagado_por   = auth.uid(),
             monto_pagado = v_monto
       WHERE event_id = p_event;
    END IF;
  END IF;

  UPDATE public.events
     SET closed_at = now(),
         closed_by = auth.uid()
   WHERE id = p_event
  RETURNING * INTO v_evento;

  RETURN v_evento;
END $$;

REVOKE EXECUTE ON FUNCTION public.cerrar_evento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerrar_evento(uuid) TO authenticated;
