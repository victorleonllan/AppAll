-- Spec 088 — La reserva pendiente caduca a los 30 minutos (LÓGICA)
--
-- `create-preference` inserta el ticket en 'pending' ANTES de que nadie pague:
-- la fila nace con el clic, no con el cobro. Nada la movía después si el
-- comprador cerraba la pestaña de Mercado Pago, y el conteo de aforo la sumaba
-- igual que a una entrada pagada — un 'pending' de hace una semana dejaba el
-- evento "agotado" sin una sola venta. Al escribir esto había 23 en producción,
-- el más viejo del 4-sep.
--
-- Acá el cupo deja de contar las reservas vencidas. La fila sigue existiendo:
-- se cancela aparte, en `reconciliar-pagos` y recién después de preguntarle a
-- MP si ese pago entró.

-- ------------------------------------------------------------ TTL de la reserva
--
-- Función y no un literal repetido en cada consulta: lo usan el conteo de aforo
-- (acá) y el barrido de cancelación (reconciliar-pagos). Un solo lugar es lo que
-- evita que un día queden en 30 y 120 minutos sin que nadie lo note.
--
-- 30 minutos es lo que dura una sesión de checkout de MP con tarjeta o saldo:
-- más corto le caduca la compra a alguien que está tipeando el número; más
-- largo es volver al problema, sólo que más lento.
--
-- Sin GRANT a anon/authenticated: no la llama nadie desde PostgREST, sólo
-- `_reservar_ticket_shared`, que corre SECURITY DEFINER como su owner.
CREATE OR REPLACE FUNCTION public.ticket_reserva_ttl()
RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '30 minutes' $$;

REVOKE ALL ON FUNCTION public.ticket_reserva_ttl() FROM PUBLIC;

-- ------------------------------------------------------- _reservar_ticket_shared
--
-- CREATE OR REPLACE sobre la versión del spec 083 (`pg_get_functiondef` remota
-- verificada idéntica al archivo del 083 antes de escribir esto, 16-sep-2026):
-- cambia SOLO el WHERE del conteo de ocupado. Firma, grants, guarda de aforo,
-- preventa, snapshot de email e INSERT quedan igual.

CREATE OR REPLACE FUNCTION public._reservar_ticket_shared(
  p_evento_id uuid, p_cantidad integer, p_preference_id text,
  p_user_id uuid, p_guest_email text
) RETURNS public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_evento       public.events%ROWTYPE;
  v_aforo        integer;
  v_ocupado      integer;
  v_preventa     public.event_preventas%ROWTYPE;
  v_hay_preventa boolean := false;
  v_monto        integer;
  v_preventa_id  uuid;
  v_ticket       public.tickets%ROWTYPE;
  v_email        text;
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
    -- Spec 088. Lo pagado cuenta siempre; lo reservado, sólo mientras su
    -- checkout sigue vivo. El cupo se libera acá, en la lectura — si dependiera
    -- del barrido nocturno, volvería una vez al día.
    SELECT COALESCE(SUM(cantidad), 0) INTO v_ocupado
      FROM public.tickets
     WHERE evento_id = p_evento_id
       AND (status = 'completed'
            OR (status = 'pending' AND created_at > now() - public.ticket_reserva_ttl()));
    IF v_ocupado + p_cantidad > v_aforo THEN
      RAISE EXCEPTION 'sin_cupo: quedan % de % entradas', GREATEST(v_aforo - v_ocupado, 0), v_aforo;
    END IF;
  END IF;

  -- Precio vigente: general/puerta directo, o la preventa de menor orden que
  -- siga abierta (activa, con cupo y antes de su hora de cierre — spec 083),
  -- bloqueada acá para no competir con otra compra simultánea de la misma fila.
  IF v_evento.tipo_precio = 'puerta' THEN
    SELECT * INTO v_preventa
      FROM public.event_preventas ep
     WHERE ep.event_id = p_evento_id
       AND public.preventa_abierta(ep)
     ORDER BY ep.orden
     LIMIT 1
     FOR UPDATE;
    v_hay_preventa := FOUND;
  END IF;

  IF v_hay_preventa THEN
    IF v_preventa.cupo IS NOT NULL AND v_preventa.vendidos + p_cantidad > v_preventa.cupo THEN
      RAISE EXCEPTION 'sin_cupo_preventa: quedan % entradas en %',
        v_preventa.cupo - v_preventa.vendidos, v_preventa.nombre;
    END IF;
    v_monto := v_preventa.monto * p_cantidad;
    v_preventa_id := v_preventa.id;
  ELSE
    v_monto := v_evento.monto * p_cantidad;
    v_preventa_id := NULL;
  END IF;

  -- Spec 071. Snapshot del email, no una referencia viva: si el fan cambia su
  -- cuenta después, esta venta conserva el email con el que se hizo.
  IF p_user_id IS NOT NULL THEN
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  ELSE
    v_email := p_guest_email;
  END IF;

  INSERT INTO public.tickets (evento_id, user_id, guest_email, status, preference_id,
                               monto, cantidad, preventa_id, comprador_email)
  VALUES (p_evento_id, p_user_id, p_guest_email, 'pending', p_preference_id,
          v_monto, p_cantidad, v_preventa_id, v_email)
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END; $$;

-- Índice para el conteo de ocupado y para el barrido de `reconciliar-pagos`:
-- los dos filtran por evento/estado y comparan `created_at`. Parcial sobre
-- 'pending' — las filas vivas son pocas y las viejas se cancelan.
CREATE INDEX IF NOT EXISTS tickets_pending_created_idx
  ON public.tickets (evento_id, created_at)
  WHERE status = 'pending';
