-- Spec 044 — La cancelación tiene que vivir en la base (pedido por W-008 de sonopolisWeb).
-- reservar_ticket_pending es la única puerta de escritura de tickets (spec 022) y no
-- miraba el estado del evento: un evento cancelado o en draft seguía siendo vendible,
-- la UI era la única guarda. Además cierra el hueco de los tickets 'pending' que ya
-- estaban en curso al momento de cancelar — webhook-mp no revisa el estado del evento,
-- así que sin esto un pago en vuelo se completaba igual después de cancelar el show.

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
  -- es la única puerta de escritura real (ver el DROP de tickets_insert, spec 022)
  -- y tiene que sostenerse sola contra una llamada directa al RPC.
  IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 10 THEN
    RAISE EXCEPTION 'cantidad_invalida: % no es válida', p_cantidad;
  END IF;

  -- Bloquea la fila del evento: dos compras del mismo evento se serializan
  -- acá, igual que event_folio_counters serializa la emisión de folios en el
  -- spec 036. Compras de eventos distintos no se ven entre sí. El lock también
  -- resuelve la carrera con una cancelación concurrente por el orden del lock,
  -- no por azar.
  SELECT * INTO v_evento FROM public.events WHERE id = p_evento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_existe: %', p_evento_id;
  END IF;

  -- Spec 044: 'cancelled' es el agujero que motivó el spec (se podía cobrar por
  -- un show que ya no existe). 'draft' entra por la misma lógica — está oculto
  -- del público (events_select, spec 033), así que nada que no lo pueda ver
  -- debería poder comprarlo tampoco.
  IF v_evento.status IN ('cancelled', 'draft') THEN
    RAISE EXCEPTION 'evento_no_vende: % está en estado %, no vende entradas',
      p_evento_id, v_evento.status;
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

-- Spec 044, segunda parte: cerrar el hueco de los 'pending' que ya estaban en curso.
-- Bloquear reservar_ticket_pending solo frena reservas NUEVAS. Un ticket que ya estaba
-- 'pending' cuando el evento se cancela sigue teniendo una preferencia de Mercado Pago
-- viva: si el comprador completa el pago después, webhook-mp lo marca 'completed' y
-- emite entradas (spec 037) sin mirar el estado del evento en ningún momento. Se
-- extiende el trigger que ya vive acá (spec 033, guarda de columnas protegidas) porque
-- ya corre exactamente en la transición que importa: NEW.status = 'cancelled' AND
-- OLD.status <> 'cancelled', después de confirmar can_delete_event().
CREATE OR REPLACE FUNCTION public.events_guard_protected_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'created_by es inmutable';
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    IF NOT public.can_delete_event(OLD.id) THEN
      RAISE EXCEPTION 'Solo quien tiene permiso de borrado puede cancelar el evento';
    END IF;

    -- Spec 044: los 'pending' de este evento ya no tienen destino. No se tocan
    -- 'completed' (eso es un reembolso, fuera de alcance — reservado sin
    -- escritor desde el spec 036) ni 'refunded'/'cancelled', que ya están cerrados.
    UPDATE public.tickets
       SET status = 'cancelled'
     WHERE evento_id = OLD.id AND status = 'pending';
  END IF;

  RETURN NEW;
END; $$;

-- El trigger ya existe (spec 033) y apunta a esta función por nombre — no hace falta
-- volver a crearlo, CREATE OR REPLACE FUNCTION alcanza.

-- Habilita Realtime en events: hoy la publicación está vacía y postgres_changes no
-- emite nada para ninguna tabla (verificado contra producción, 2026-08-13). Desbloquea
-- el aviso en vivo del spec W-009 de sonopolisWeb. events es de lectura pública
-- (events_select, spec 033), así que Realtime — que respeta RLS — no expone nada nuevo.
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
