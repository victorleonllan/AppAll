-- Spec 083 — La preventa cierra por reloj en el cobro (LÓGICA)
--
-- Las columnas del 082 no cierran nada solas. Acá el criterio "esta preventa
-- está abierta" pasa a mirar la hora, y entra SOLO en los dos lugares que
-- deciden precio (spec 065): la cotización (precio_vigente_de) y la reserva
-- con lock (_reservar_ticket_shared). Esconder el badge en pantalla no
-- alcanza — una ficha abierta desde antes compra igual.

-- ------------------------------------------------------------ funciones de fila
--
-- Reciben la fila de event_preventas. Una función con la fila como único
-- argumento es lo que PostgREST expone como columna calculada: desde la web,
-- .select("*, preventa_cierra_at") trae el instante sin reimplementar la
-- resta en JS. El criterio vive en un solo lugar.

-- Instante en que cierra por tiempo. NULL solo cuando la regla es
-- 'horas_antes' y el evento no tiene comienza_at (spec 045 lo dejó nullable;
-- la app móvil no lo escribe).
CREATE OR REPLACE FUNCTION public.preventa_cierra_at(p public.event_preventas)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p.cierre_tipo
    WHEN 'fecha' THEN p.cierre_at
    WHEN 'horas_antes' THEN (
      SELECT e.comienza_at - make_interval(hours => p.cierre_horas_antes)
        FROM public.events e WHERE e.id = p.event_id
    )
  END;
$$;

-- Abierta = activa, con cupo y antes de la hora de cierre. Las tres a la vez.
-- Falla cerrado: sin instante de cierre (comienza_at NULL), se considera
-- cerrada y se cobra puerta. Cobrar de más a quien llegó a tiempo es el error
-- barato; cobrar preventa en la puerta es el del incidente.
CREATE OR REPLACE FUNCTION public.preventa_abierta(p public.event_preventas)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.activa
     AND p.vendidos < p.cupo
     AND public.preventa_cierra_at(p) IS NOT NULL
     AND public.preventa_cierra_at(p) > now();
$$;

REVOKE ALL ON FUNCTION public.preventa_cierra_at(public.event_preventas) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preventa_abierta(public.event_preventas)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preventa_cierra_at(public.event_preventas) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preventa_abierta(public.event_preventas)  TO anon, authenticated;

-- ------------------------------------------------------------ precio_vigente_de
--
-- Misma firma de entrada que el 069; agrega `cierra_at` a la salida para que
-- la ficha pueda decir "preventa hasta el …" sin otra consulta. Cambia
-- RETURNS TABLE, así que DROP + CREATE (Postgres no deja CREATE OR REPLACE
-- con otro tipo de retorno) y los GRANT se vuelven a dar.

DROP FUNCTION IF EXISTS public.precio_vigente_de(uuid);

CREATE FUNCTION public.precio_vigente_de(p_evento_id uuid)
RETURNS TABLE (precio text, monto integer, preventa_id uuid, preventa_nombre text,
               restantes integer, cierra_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_evento    public.events%ROWTYPE;
  v_preventa  public.event_preventas%ROWTYPE;
BEGIN
  SELECT * INTO v_evento FROM public.events WHERE id = p_evento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_existe: %', p_evento_id;
  END IF;

  IF v_evento.tipo_precio = 'puerta' THEN
    SELECT * INTO v_preventa
      FROM public.event_preventas ep
     WHERE ep.event_id = p_evento_id
       AND public.preventa_abierta(ep)
     ORDER BY ep.orden
     LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_preventa.precio, v_preventa.monto, v_preventa.id,
        v_preventa.nombre, (v_preventa.cupo - v_preventa.vendidos),
        public.preventa_cierra_at(v_preventa);
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT v_evento.precio, v_evento.monto, NULL::uuid, NULL::text,
    NULL::integer, NULL::timestamptz;
END; $$;

REVOKE ALL ON FUNCTION public.precio_vigente_de(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.precio_vigente_de(uuid) TO anon, authenticated;

-- ------------------------------------------------------- _reservar_ticket_shared
--
-- CREATE OR REPLACE sobre la versión del spec 071 (verificada igual a la
-- remota antes de escribir esto): cambia solo el WHERE del SELECT de la
-- preventa. Firma, grants, aforo, email e INSERT quedan igual.

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
    SELECT COALESCE(SUM(cantidad), 0) INTO v_ocupado
      FROM public.tickets
     WHERE evento_id = p_evento_id AND status IN ('pending', 'completed');
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
