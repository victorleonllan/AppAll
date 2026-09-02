-- Spec 069 — precio_vigente_de expone `restantes` (cupo - vendidos) de la preventa vigente.
-- Requiere spec 068 (cupo NOT NULL) para poder simplificar el WHERE a `vendidos < cupo`.

DROP FUNCTION IF EXISTS public.precio_vigente_de(uuid);

CREATE FUNCTION public.precio_vigente_de(p_evento_id uuid)
RETURNS TABLE (precio text, monto integer, preventa_id uuid, preventa_nombre text, restantes integer)
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
       AND vendidos < cupo
     ORDER BY orden
     LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_preventa.precio, v_preventa.monto, v_preventa.id,
        v_preventa.nombre, (v_preventa.cupo - v_preventa.vendidos);
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT v_evento.precio, v_evento.monto, NULL::uuid, NULL::text, NULL::integer;
END; $$;

REVOKE ALL ON FUNCTION public.precio_vigente_de(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.precio_vigente_de(uuid) TO anon, authenticated;
