-- Spec 071 — email del comprador en `tickets` (base del CRM)
--
-- Por qué una columna nueva y no leer `auth.users` al momento de mostrar:
--
-- 1. RLS. El local ve las compras de su evento por `tickets_select_event_team`,
--    pero el email del fan vive en `auth.users` (o en `profiles`, cuya policy
--    del spec 020 solo deja ver role='musician' + la fila propia). Abrir
--    cualquiera de las dos para que el local lea un email expondría bastante
--    más que el email.
-- 2. Un CRM necesita el email **con el que se compró**, no el que el fan tenga
--    hoy. Si mañana cambia su cuenta, la venta histórica no debe mutar debajo.
--
-- La columna viaja dentro de la fila de `tickets`, que el equipo del evento ya
-- puede leer — no se toca ninguna policy.

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS comprador_email text;

COMMENT ON COLUMN public.tickets.comprador_email IS
  'Email del comprador al momento de la compra (snapshot, spec 071). Guest checkout: el email que dejó. Compra con cuenta: auth.users.email de entonces. Es la base del CRM del local — no se actualiza si el usuario cambia su email después.';

-- ---------------------------------------------------------------- Backfill
-- Lo ya vendido antes de esta migración: guest_email cuando la compra fue sin
-- cuenta, auth.users.email cuando fue con sesión. COALESCE en un solo UPDATE no
-- alcanza porque el JOIN a auth.users deja fuera las filas con user_id NULL.

UPDATE public.tickets t
   SET comprador_email = u.email
  FROM auth.users u
 WHERE t.comprador_email IS NULL
   AND t.user_id IS NOT NULL
   AND u.id = t.user_id;

UPDATE public.tickets t
   SET comprador_email = t.guest_email
 WHERE t.comprador_email IS NULL
   AND t.guest_email IS NOT NULL;

-- ------------------------------------------- _reservar_ticket_shared()
--
-- CREATE OR REPLACE sobre la versión del spec 065: mismo cuerpo, con el email
-- resuelto antes del INSERT. La función ya es SECURITY DEFINER, así que puede
-- leer `auth.users` — el que llama nunca la ve, solo recibe su propio ticket.
-- Firma y grants no cambian.

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
