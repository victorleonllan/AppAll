-- Spec 104 — Cada país cobra con una o más pasarelas, y cada ticket recuerda con cuál se pagó.
-- Ver specs/104-datos-pasarelas-por-pais.md
--
-- Hasta hoy "el país cobra" (paises_cobro, spec 100) significaba "el país cobra con
-- Mercado Pago". Este spec separa las dos cosas: pasarelas_cobro dice qué pasarelas
-- tiene activas cada país, y tickets.pasarela guarda con cuál se cobró cada venta, para
-- que confirm-payment y la reconciliación (spec 105) le pregunten a la API correcta.
--
-- Un solo archivo = una sola transacción: supabase db push aplica cada migración
-- completa o nada, así que no queda un estado intermedio con la reserva sin wrappers.

-- 1. pasarelas_cobro -------------------------------------------------------------

CREATE TABLE public.pasarelas_cobro (
  pais      char(2)  NOT NULL REFERENCES public.paises_cobro(pais),
  pasarela  text     NOT NULL CHECK (pasarela IN ('mercadopago', 'flow')),
  activo    boolean  NOT NULL DEFAULT false,
  orden     smallint NOT NULL,
  PRIMARY KEY (pais, pasarela)
);

-- Flow entra apagado en los dos países: se enciende con un spec DATOS de una línea
-- cuando el spec 105 esté desplegado y sus secrets cargados — nunca a mano, igual que
-- paises_cobro (spec 100) y event_sources (spec 081, D1). Mercado Pago va primero en
-- Chile porque es la pasarela que ya cobró de verdad.
INSERT INTO public.pasarelas_cobro (pais, pasarela, activo, orden) VALUES
  ('CL', 'mercadopago', true,  1),
  ('CL', 'flow',        false, 2),
  ('MX', 'flow',        false, 1);

ALTER TABLE public.pasarelas_cobro ENABLE ROW LEVEL SECURITY;

-- La web lee la tabla sin sesión para mostrar las opciones de pago.
CREATE POLICY pasarelas_cobro_select_publico ON public.pasarelas_cobro
  FOR SELECT TO anon, authenticated USING (true);
-- Sin insert/update/delete por policy: la tabla se cambia solo por migración.
--
-- Invariante (spec 104, Decisión 4): todo país con paises_cobro.activo = true tiene
-- al menos una fila activa acá. Si se rompe, precio_vigente_de.se_vende dice que sí
-- pero toda reserva falla con pasarela_inactiva. No se fuerza con trigger: cada
-- migración que toque cualquiera de las dos tablas lo verifica.

-- 2. tickets.pasarela --------------------------------------------------------------

ALTER TABLE public.tickets ADD COLUMN pasarela text
  CHECK (pasarela IN ('mercadopago', 'flow'));

-- Backfill: todo ticket existente se creó con create-preference, la única vía de venta
-- hasta hoy — es un hecho, no un default de conveniencia.
UPDATE public.tickets SET pasarela = 'mercadopago';

ALTER TABLE public.tickets ALTER COLUMN pasarela SET NOT NULL;
-- Sin DEFAULT a propósito, como tickets.pais_cobro (spec 100): la única vía de
-- escritura es _reservar_ticket_shared. Un INSERT por otro lado tiene que fallar, no
-- inventar Mercado Pago.

-- 3. DROP de la reserva y sus wrappers ----------------------------------------------
--
-- Cambio de firma = DROP + CREATE. Un CREATE OR REPLACE con un argumento más crearía
-- una sobrecarga y PostgREST no sabría cuál llamar (pasó con el RPC de W-103).
-- Primero los wrappers, que llaman a la compartida.

DROP FUNCTION public.reservar_ticket_pending(uuid, integer, text);
DROP FUNCTION public.reservar_ticket_pending_guest(uuid, integer, text, text);
DROP FUNCTION public._reservar_ticket_shared(uuid, integer, text, uuid, text);

-- 4. _reservar_ticket_shared con p_pasarela -----------------------------------------
--
-- Parte de pg_get_functiondef en producción (03-oct-2026), idéntica a la del spec 100.
-- Dos cambios: la guarda de pasarela después de la de país, y pasarela en el INSERT.
-- El resto —aforo, preventa, email, moneda, pais_cobro— queda igual.

CREATE FUNCTION public._reservar_ticket_shared(
  p_evento_id uuid, p_cantidad integer, p_preference_id text,
  p_user_id uuid, p_guest_email text, p_pasarela text
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

  -- Spec 104. Misma idea, una capa más abajo: aunque una Edge Function tenga un bug,
  -- no nace un ticket de Flow en un país donde Flow está apagado. Un p_pasarela NULL
  -- tampoco pasa: no hay fila con pasarela NULL.
  IF NOT EXISTS (SELECT 1 FROM public.pasarelas_cobro
                  WHERE pais = v_evento.pais AND pasarela = p_pasarela AND activo) THEN
    RAISE EXCEPTION 'pasarela_inactiva: % no cobra en %', p_pasarela, v_evento.pais;
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
                               monto, cantidad, preventa_id, comprador_email,
                               moneda, pais_cobro, pasarela)
  VALUES (p_evento_id, p_user_id, p_guest_email, 'pending', p_preference_id,
          v_monto, p_cantidad, v_preventa_id, v_email,
          v_cobro.moneda, v_cobro.pais, p_pasarela)
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END; $$;

-- El DROP se llevó los grants: se repite el REVOKE de los specs 046 y 100. Sin GRANT:
-- solo la llaman los wrappers, que corren como dueño (SECURITY DEFINER). Sin el REVOKE
-- por rol, anon podría llamarla directo con un p_user_id arbitrario (spec 046).
REVOKE ALL ON FUNCTION public._reservar_ticket_shared(uuid, integer, text, uuid, text, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._reservar_ticket_shared(uuid, integer, text, uuid, text, text)
  FROM anon, authenticated;

-- 5. Wrappers con p_pasarela al final y DEFAULT 'mercadopago' -----------------------
--
-- Por qué el DEFAULT: create-preference en producción y la app nativa llaman con tres
-- (o cuatro) argumentos con nombre. Entre el db push de este spec y el deploy del 105
-- esa llamada tiene que seguir vendiendo con Mercado Pago, la única pasarela activa.

CREATE FUNCTION public.reservar_ticket_pending(
  p_evento_id uuid, p_cantidad integer, p_preference_id text,
  p_pasarela text DEFAULT 'mercadopago'
) RETURNS public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no_autenticado';
  END IF;
  RETURN public._reservar_ticket_shared(p_evento_id, p_cantidad, p_preference_id,
                                        auth.uid(), NULL, p_pasarela);
END; $$;

-- Mismos grants de hoy (spec 022/044): solo authenticated.
REVOKE ALL ON FUNCTION public.reservar_ticket_pending(uuid, integer, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_ticket_pending(uuid, integer, text, text)
  TO authenticated;

CREATE FUNCTION public.reservar_ticket_pending_guest(
  p_evento_id uuid, p_cantidad integer, p_preference_id text, p_email text,
  p_pasarela text DEFAULT 'mercadopago'
) RETURNS public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_email IS NULL OR p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'email_invalido: %', p_email;
  END IF;
  RETURN public._reservar_ticket_shared(p_evento_id, p_cantidad, p_preference_id,
                                        NULL, lower(trim(p_email)), p_pasarela);
END; $$;

-- Mismos grants de hoy (spec 046): anon y authenticated.
REVOKE ALL ON FUNCTION public.reservar_ticket_pending_guest(uuid, integer, text, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reservar_ticket_pending_guest(uuid, integer, text, text, text)
  TO anon, authenticated;
