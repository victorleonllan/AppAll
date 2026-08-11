-- Spec 040 — Canje atómico: redeem_ticket_item(token)
--
-- ticket_items (spec 036) no tiene policy de UPDATE: con RLS activa, ausencia de
-- policy es negación total. La única vía de escritura es esta función SECURITY
-- DEFINER, que mete la condición dentro del propio UPDATE (WHERE status = 'valid')
-- para que dos escaneos simultáneos del mismo QR den exactamente un 'ok' y un
-- 'ya_usada' — nunca dos 'ok'. Detalle completo en specs/040-canje-atomico-de-entradas.md.

-- 1. comprador_de(ticket_id) --------------------------------------------------
--
-- Tras el spec 020, un SELECT normal contra profiles de otro usuario no devuelve
-- nada. Este helper expone solo el nombre del comprador — nunca teléfono ni email,
-- que son las columnas que el spec 030 agregó y el 020 protege.
CREATE OR REPLACE FUNCTION public.comprador_de(p_ticket uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.nombre
    FROM public.tickets t
    JOIN public.profiles p ON p.id = t.user_id
   WHERE t.id = p_ticket;
$$;

REVOKE ALL ON FUNCTION public.comprador_de(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.comprador_de(uuid) TO authenticated;

-- 2. redeem_ticket_item(token) — el canje ------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_ticket_item(p_token text)
RETURNS TABLE (
  resultado   text,
  folio       integer,
  evento_id   uuid,
  comprador   text,
  redeemed_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item   public.ticket_items%ROWTYPE;
  v_estado text;
  v_id     uuid;
BEGIN
  SELECT * INTO v_item FROM public.ticket_items WHERE qr_token = p_token;

  IF NOT FOUND THEN
    -- Sin fila no hay evento, y sin evento no hay contra qué autorizar. Se responde
    -- lo mismo a cualquiera: quien prueba tokens al azar no aprende si acertó el formato.
    RETURN QUERY SELECT 'no_existe'::text, NULL::integer, NULL::uuid, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- Autorización explícita: SECURITY DEFINER apaga RLS, así que el permiso se chequea acá
  -- o no se chequea en ninguna parte.
  IF NOT public.can_edit_event(v_item.evento_id) THEN
    RETURN QUERY SELECT 'sin_permiso'::text, NULL::integer, NULL::uuid, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT status INTO v_estado FROM public.events WHERE id = v_item.evento_id;
  IF v_estado = 'cancelled' THEN
    RETURN QUERY SELECT 'evento_cancelado'::text, v_item.folio, v_item.evento_id,
                        NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- Se guarda el id antes del UPDATE: "... RETURNING * INTO v_item" dEja v_item
  -- entero en NULL cuando el UPDATE no afecta ninguna fila (mismo comportamiento
  -- que un SELECT INTO sin resultados). Sin esta variable aparte, la re-lectura
  -- de más abajo quedaría buscando "WHERE id = NULL" y no encontraría nada —
  -- bug real, encontrado probando este spec: el segundo canje del mismo token
  -- devolvía 'anulada' con todos los campos vacíos en vez de 'ya_usada'.
  v_id := v_item.id;

  -- El canje: condición y escritura en una sola sentencia. Postgres evalúa
  -- status = 'valid' con la fila ya bloqueada; un segundo escáner concurrente
  -- recibe cero filas afectadas, no un error.
  UPDATE public.ticket_items ti
     SET status = 'used', redeemed_at = now(), redeemed_by = auth.uid()
   WHERE ti.id = v_id AND ti.status = 'valid'
   RETURNING * INTO v_item;

  IF NOT FOUND THEN
    -- Perdió la carrera, o ya estaba usada/anulada. Se relee para decir cuándo entró.
    SELECT * INTO v_item FROM public.ticket_items WHERE id = v_id;
    RETURN QUERY SELECT
      CASE v_item.status WHEN 'used' THEN 'ya_usada' ELSE 'anulada' END,
      v_item.folio, v_item.evento_id, public.comprador_de(v_item.ticket_id), v_item.redeemed_at;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'ok'::text, v_item.folio, v_item.evento_id,
                      public.comprador_de(v_item.ticket_id), v_item.redeemed_at;
END; $$;

REVOKE ALL ON FUNCTION public.redeem_ticket_item(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.redeem_ticket_item(text) TO authenticated;

-- 3. peek_ticket_item(token) — la misma lectura, sin canjear -----------------
--
-- Existe para que el spec 041 pueda confirmar antes de marcar sin quemar una
-- entrada por un escaneo accidental. Misma autorización y las mismas cinco
-- respuestas que redeem_ticket_item, sin el UPDATE.
CREATE OR REPLACE FUNCTION public.peek_ticket_item(p_token text)
RETURNS TABLE (
  resultado   text,
  folio       integer,
  evento_id   uuid,
  comprador   text,
  redeemed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item   public.ticket_items%ROWTYPE;
  v_estado text;
BEGIN
  SELECT * INTO v_item FROM public.ticket_items WHERE qr_token = p_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no_existe'::text, NULL::integer, NULL::uuid, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF NOT public.can_edit_event(v_item.evento_id) THEN
    RETURN QUERY SELECT 'sin_permiso'::text, NULL::integer, NULL::uuid, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT status INTO v_estado FROM public.events WHERE id = v_item.evento_id;
  IF v_estado = 'cancelled' THEN
    RETURN QUERY SELECT 'evento_cancelado'::text, v_item.folio, v_item.evento_id,
                        NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    CASE v_item.status
      WHEN 'valid' THEN 'ok'
      WHEN 'used'  THEN 'ya_usada'
      ELSE 'anulada'
    END,
    v_item.folio, v_item.evento_id, public.comprador_de(v_item.ticket_id), v_item.redeemed_at;
END; $$;

REVOKE ALL ON FUNCTION public.peek_ticket_item(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.peek_ticket_item(text) TO authenticated;
