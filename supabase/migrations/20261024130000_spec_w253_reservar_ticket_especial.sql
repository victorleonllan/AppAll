-- Spec W-253 (sonopolisWeb) — Ticket especial: listar packs vigentes y reservar un pack.
-- Ver sonopolisWeb/specs/w253-logica-reservar-ticket-especial.md para el diseño completo.
-- Depende de W-252 (tabla event_tickets_especiales y tickets.especial_id).

-- ------------------------------------------------------------- 1. especiales_vigentes_de

-- Los packs que se pueden comprar ahora mismo en un evento. SQL puro (no plpgsql) para
-- que las columnas de RETURNS TABLE no choquen con las de las tablas.
--
-- restantes = cupo - vendidos - packs de reservas `pending` todavía vivas. En la preventa
-- una reserva pendiente no descuenta cupo, y dos compras por la última unidad terminan
-- con una que falla por CHECK DESPUÉS de pagar (trigger del spec 064). Con packs de pocas
-- unidades ese choque es probable: contar los pendientes hace fallar a la segunda compra
-- ANTES de ir a la pasarela.
--
-- «Venta abierta» es el mismo criterio que `se_vende` en precio_vigente_de (spec 100): el
-- país del evento tiene cobro activo. El especial no cierra antes ni después de la venta
-- general. La moneda sale del evento, igual que en precio_vigente_de.
CREATE FUNCTION public.especiales_vigentes_de(p_event uuid)
RETURNS TABLE (id uuid, nombre text, multiplicador integer, precio text,
               monto integer, restantes integer, moneda char(3))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT es.id, es.nombre, es.multiplicador, es.precio, es.monto,
         (es.cupo - es.vendidos - pend.packs)::integer AS restantes,
         ev.moneda::char(3) AS moneda
    FROM public.event_tickets_especiales es
    JOIN public.events ev ON ev.id = es.event_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(t.cantidad / es.multiplicador), 0)::integer AS packs
        FROM public.tickets t
       WHERE t.especial_id = es.id
         AND t.status = 'pending'
         AND t.created_at > now() - public.ticket_reserva_ttl()
    ) pend
   WHERE es.event_id = p_event
     AND es.activa
     AND EXISTS (SELECT 1 FROM public.paises_cobro pc
                  WHERE pc.pais = ev.pais AND pc.activo)
     AND es.cupo - es.vendidos - pend.packs > 0
   ORDER BY es.multiplicador, es.created_at;
$$;

REVOKE ALL ON FUNCTION public.especiales_vigentes_de(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.especiales_vigentes_de(uuid) TO anon, authenticated;

-- ------------------------------------------------------------- 2. DROP de la reserva y sus wrappers

-- Cambio de firma = DROP + CREATE. Un CREATE OR REPLACE con un argumento más crearía una
-- sobrecarga y PostgREST no sabría cuál llamar (spec 104). Primero los wrappers.
DROP FUNCTION public.reservar_ticket_pending(uuid, integer, text, text);
DROP FUNCTION public.reservar_ticket_pending_guest(uuid, integer, text, text, text);
DROP FUNCTION public._reservar_ticket_shared(uuid, integer, text, uuid, text, text);

-- ------------------------------------------------------------- 3. _reservar_ticket_shared con p_especial_id

-- Parte de la versión del spec 104. Con p_especial_id NULL el comportamiento es idéntico.
-- Con p_especial_id, p_cantidad son PACKS y tickets.cantidad guarda ENTRADAS
-- (packs × multiplicador), porque issue_ticket_items emite `cantidad` entradas.
CREATE FUNCTION public._reservar_ticket_shared(
  p_evento_id uuid, p_cantidad integer, p_preference_id text,
  p_user_id uuid, p_guest_email text, p_pasarela text,
  p_especial_id uuid DEFAULT NULL
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
  v_cobro        public.paises_cobro%ROWTYPE;
  v_especial     public.event_tickets_especiales%ROWTYPE;
  v_entradas     integer := p_cantidad;
  v_pend_packs   integer;
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

  -- Spec 100. La guarda que importa de verdad: aunque la Edge Function tuviera
  -- un bug, un ticket de un país sin cuenta activa no puede nacer.
  SELECT * INTO v_cobro FROM public.paises_cobro
   WHERE pais = v_evento.pais AND activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pais_sin_cobro: la venta de entradas en % no está habilitada', v_evento.pais;
  END IF;

  -- Spec 104. Misma idea, una capa más abajo.
  IF NOT EXISTS (SELECT 1 FROM public.pasarelas_cobro
                  WHERE pais = v_evento.pais AND pasarela = p_pasarela AND activo) THEN
    RAISE EXCEPTION 'pasarela_inactiva: % no cobra en %', p_pasarela, v_evento.pais;
  END IF;

  -- Spec W-253. El evento ya está bloqueado arriba, así que el orden de locks es siempre
  -- evento -> especial y dos compras del mismo pack se serializan acá.
  IF p_especial_id IS NOT NULL THEN
    SELECT * INTO v_especial FROM public.event_tickets_especiales
     WHERE id = p_especial_id AND event_id = p_evento_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'especial_invalido: % no es un ticket especial de este evento', p_especial_id;
    END IF;
    -- La venta del evento ya se comprobó arriba (país con cobro activo): acá solo queda
    -- el interruptor propio del pack.
    IF NOT v_especial.activa THEN
      RAISE EXCEPTION 'especial_cerrado: % no está a la venta', v_especial.nombre;
    END IF;

    v_entradas := p_cantidad * v_especial.multiplicador;
    -- Mismo tope por compra de arriba, pero medido en entradas, no en packs.
    IF v_entradas > 10 THEN
      RAISE EXCEPTION 'cantidad_invalida: % entradas superan el tope de 10 por compra', v_entradas;
    END IF;
  END IF;

  SELECT v.aforo INTO v_aforo FROM public.venues v WHERE v.id = v_evento.venue_id;
  IF v_aforo IS NOT NULL THEN
    -- Spec 088. Lo pagado cuenta siempre; lo reservado, sólo mientras su
    -- checkout sigue vivo. Con un especial se valida con las ENTRADAS.
    SELECT COALESCE(SUM(cantidad), 0) INTO v_ocupado
      FROM public.tickets
     WHERE evento_id = p_evento_id
       AND (status = 'completed'
            OR (status = 'pending' AND created_at > now() - public.ticket_reserva_ttl()));
    IF v_ocupado + v_entradas > v_aforo THEN
      RAISE EXCEPTION 'sin_cupo: quedan % de % entradas', GREATEST(v_aforo - v_ocupado, 0), v_aforo;
    END IF;
  END IF;

  IF p_especial_id IS NOT NULL THEN
    -- Cupo del pack: vendidos + packs en reservas pendientes vivas (ver
    -- especiales_vigentes_de). Fila bloqueada arriba, así que el conteo no se mueve.
    SELECT COALESCE(SUM(t.cantidad / v_especial.multiplicador), 0)::integer INTO v_pend_packs
      FROM public.tickets t
     WHERE t.especial_id = v_especial.id
       AND t.status = 'pending'
       AND t.created_at > now() - public.ticket_reserva_ttl();
    IF v_especial.vendidos + v_pend_packs + p_cantidad > v_especial.cupo THEN
      RAISE EXCEPTION 'especial_agotado: quedan % packs de %',
        GREATEST(v_especial.cupo - v_especial.vendidos - v_pend_packs, 0), v_especial.nombre;
    END IF;
    v_monto := v_especial.monto * p_cantidad;
    v_preventa_id := NULL;
  ELSE
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
  END IF;

  -- Spec 071. Snapshot del email, no una referencia viva.
  IF p_user_id IS NOT NULL THEN
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  ELSE
    v_email := p_guest_email;
  END IF;

  INSERT INTO public.tickets (evento_id, user_id, guest_email, status, preference_id,
                               monto, cantidad, preventa_id, especial_id, comprador_email,
                               moneda, pais_cobro, pasarela)
  VALUES (p_evento_id, p_user_id, p_guest_email, 'pending', p_preference_id,
          v_monto, v_entradas, v_preventa_id, p_especial_id, v_email,
          v_cobro.moneda, v_cobro.pais, p_pasarela)
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END; $$;

-- El DROP se llevó los grants: se repite el REVOKE de los specs 046, 100 y 104. Sin GRANT:
-- solo la llaman los wrappers (SECURITY DEFINER). Sin el REVOKE por rol, anon podría
-- llamarla directo con un p_user_id arbitrario (spec 046).
REVOKE ALL ON FUNCTION public._reservar_ticket_shared(uuid, integer, text, uuid, text, text, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._reservar_ticket_shared(uuid, integer, text, uuid, text, text, uuid)
  FROM anon, authenticated;

-- ------------------------------------------------------------- 4. Wrappers con p_especial_id

-- p_especial_id va al final y con DEFAULT NULL: las llamadas actuales (create-preference
-- y create-payment-flow en producción, la app nativa) siguen funcionando sin cambios.
CREATE FUNCTION public.reservar_ticket_pending(
  p_evento_id uuid, p_cantidad integer, p_preference_id text,
  p_pasarela text DEFAULT 'mercadopago', p_especial_id uuid DEFAULT NULL
) RETURNS public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no_autenticado';
  END IF;
  RETURN public._reservar_ticket_shared(p_evento_id, p_cantidad, p_preference_id,
                                        auth.uid(), NULL, p_pasarela, p_especial_id);
END; $$;

-- Mismos grants de hoy (spec 022/044): solo authenticated.
REVOKE ALL ON FUNCTION public.reservar_ticket_pending(uuid, integer, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_ticket_pending(uuid, integer, text, text, uuid)
  TO authenticated;

CREATE FUNCTION public.reservar_ticket_pending_guest(
  p_evento_id uuid, p_cantidad integer, p_preference_id text, p_email text,
  p_pasarela text DEFAULT 'mercadopago', p_especial_id uuid DEFAULT NULL
) RETURNS public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_email IS NULL OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'email_invalido: %', p_email;
  END IF;
  RETURN public._reservar_ticket_shared(p_evento_id, p_cantidad, p_preference_id,
                                        NULL, lower(trim(p_email)), p_pasarela, p_especial_id);
END; $$;

-- Mismos grants de hoy (spec 046): anon y authenticated.
REVOKE ALL ON FUNCTION public.reservar_ticket_pending_guest(uuid, integer, text, text, text, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reservar_ticket_pending_guest(uuid, integer, text, text, text, uuid)
  TO anon, authenticated;
