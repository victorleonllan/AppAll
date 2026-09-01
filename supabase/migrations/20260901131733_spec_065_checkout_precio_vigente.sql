-- Spec 065 — El checkout cobra el precio vigente, sin decidirlo él.
-- Ver specs/065-checkout-precio-vigente.md para el diseño completo.

-- ------------------------------------------------------------- 1. precio_vigente_de()
--
-- Única fuente de verdad de "cuánto se cobra ahora mismo" para un evento: general,
-- puerta, o la preventa de menor `orden` que siga activa y con cupo. Solo lee (STABLE):
-- es una cotización, no una reserva — quien se compromete de verdad con lock es
-- _reservar_ticket_shared, abajo.

CREATE OR REPLACE FUNCTION public.precio_vigente_de(p_evento_id uuid)
RETURNS TABLE (precio text, monto integer, preventa_id uuid, preventa_nombre text)
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
      FROM public.event_preventas
     WHERE event_id = p_evento_id
       AND activa = true
       AND (cupo IS NULL OR vendidos < cupo)
     ORDER BY orden
     LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_preventa.precio, v_preventa.monto, v_preventa.id, v_preventa.nombre;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT v_evento.precio, v_evento.monto, NULL::uuid, NULL::text;
END; $$;

REVOKE ALL ON FUNCTION public.precio_vigente_de(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.precio_vigente_de(uuid) TO anon, authenticated;

-- ------------------------------------------------------------- 2. _reservar_ticket_shared()
--
-- Mismo criterio que precio_vigente_de, pero con FOR UPDATE: evita que dos compras
-- simultáneas agoten la misma preventa antes de que el CHECK de cupo (spec 064) las
-- frene. CREATE OR REPLACE sobre la versión del spec 046 — firma y grants no cambian.

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

  -- Precio vigente: general/puerta directo, o la preventa de menor orden activa y con
  -- cupo, bloqueada acá para no competir con otra compra simultánea de la misma fila.
  IF v_evento.tipo_precio = 'puerta' THEN
    SELECT * INTO v_preventa
      FROM public.event_preventas
     WHERE event_id = p_evento_id AND activa = true
       AND (cupo IS NULL OR vendidos < cupo)
     ORDER BY orden
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

  INSERT INTO public.tickets (evento_id, user_id, guest_email, status, preference_id,
                               monto, cantidad, preventa_id)
  VALUES (p_evento_id, p_user_id, p_guest_email, 'pending', p_preference_id,
          v_monto, p_cantidad, v_preventa_id)
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END; $$;
