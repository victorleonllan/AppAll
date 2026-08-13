-- Spec 022 — Endurecer webhook y creación de preferencias.
-- Cierra el INSERT directo a tickets y mueve la reserva (cantidad + aforo) a una
-- función SECURITY DEFINER que bloquea la fila del evento antes de contar, mismo
-- patrón que event_folio_counters (spec 036) y el canje atómico (spec 040).

DROP POLICY IF EXISTS tickets_insert ON public.tickets;
-- Sin policy de INSERT: con RLS activa, ausencia de policy es negación total.
-- La única vía de escritura queda reservar_ticket_pending(), abajo.

CREATE OR REPLACE FUNCTION public.reservar_ticket_pending(
  p_evento_id uuid, p_cantidad integer, p_preference_id text
) RETURNS public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_evento   public.events%ROWTYPE;
  v_aforo    integer;
  v_ocupado  integer;
  v_ticket   public.tickets%ROWTYPE;
BEGIN
  -- cantidad se revalida acá: create-preference ya la revisó, pero esta función
  -- es la única puerta de escritura real (ver el DROP de tickets_insert arriba)
  -- y tiene que sostenerse sola contra una llamada directa al RPC.
  IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 10 THEN
    RAISE EXCEPTION 'cantidad_invalida: % no es válida', p_cantidad;
  END IF;

  -- Bloquea la fila del evento: dos compras del mismo evento se serializan
  -- acá, igual que event_folio_counters serializa la emisión de folios en el
  -- spec 036. Compras de eventos distintos no se ven entre sí.
  SELECT * INTO v_evento FROM public.events WHERE id = p_evento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_existe: %', p_evento_id;
  END IF;

  SELECT v.aforo INTO v_aforo FROM public.venues v WHERE v.id = v_evento.venue_id;

  -- aforo NULL = sin tope, el comportamiento de hoy. No es un descuido: no
  -- todos los locales cargaron su aforo (spec 031), y bloquear la venta de
  -- quien no lo hizo sería peor que no tener el control.
  IF v_aforo IS NOT NULL THEN
    SELECT COALESCE(SUM(cantidad), 0) INTO v_ocupado
      FROM public.tickets
     WHERE evento_id = p_evento_id AND status IN ('pending', 'completed');

    IF v_ocupado + p_cantidad > v_aforo THEN
      RAISE EXCEPTION 'sin_cupo: quedan % de % entradas', GREATEST(v_aforo - v_ocupado, 0), v_aforo;
    END IF;
  END IF;

  -- monto se deriva del evento acá adentro, no se recibe del caller: es la
  -- misma razón por la que 021 (problema 0c) conecta precio → monto en un
  -- solo lugar. Confiar en un monto que mandó el cliente reabriría esa puerta.
  INSERT INTO public.tickets (evento_id, user_id, status, preference_id, monto, cantidad)
  VALUES (p_evento_id, auth.uid(), 'pending', p_preference_id, v_evento.monto * p_cantidad, p_cantidad)
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END; $$;

REVOKE ALL ON FUNCTION public.reservar_ticket_pending(uuid, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reservar_ticket_pending(uuid, integer, text) TO authenticated;
