-- Spec 103 — Un evento cancelado también se cierra, sin marcar pago.
--
-- Supera la guarda 4 del spec 102 ('Un evento cancelado no se cierra'). Un
-- solo cambio en cerrar_evento: si el evento está cancelado, se cierra y se
-- devuelve sin pasar por la guarda de fecha ni por el paso de pago.
--
-- Por qué sin pago: monto_a_transferir cuenta entradas 'completed', y en un
-- cancelado esa plata es de los compradores (reembolso), no del organizador.
-- Marcar el payout 'pagado' registraría una transferencia que no corresponde.
-- Sin guarda de fecha: un cancelado ya no vende (spec 044), su monto no cambia.
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

  -- Spec 103: el cancelado se cierra sin tocar event_payouts.
  IF v_evento.status = 'cancelled' THEN
    UPDATE public.events
       SET closed_at = now(),
           closed_by = auth.uid()
     WHERE id = p_event
    RETURNING * INTO v_evento;
    RETURN v_evento;
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
