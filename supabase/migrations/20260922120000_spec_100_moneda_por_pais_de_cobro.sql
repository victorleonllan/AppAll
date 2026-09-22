-- Spec 100 — Cada evento se cobra en la moneda de su país.
-- Ver specs/100-datos-moneda-por-pais-de-cobro.md
--
-- Hoy `create-preference` manda `currency_id: 'CLP'` fijo (spec 101 lo arregla en la
-- Edge Function). Este spec le da a la base el dato que le falta: qué moneda cobra
-- cada país y si su cuenta de Mercado Pago existe todavía.

-- 1. paises_cobro ---------------------------------------------------------------

CREATE TABLE public.paises_cobro (
  pais    char(2)  PRIMARY KEY,
  moneda  char(3)  NOT NULL,
  activo  boolean  NOT NULL DEFAULT false
);

-- México entra `activo = false`: la moneda ya se conoce (un evento mexicano
-- muestra MXN desde ya), pero la venta queda cerrada porque la cuenta mexicana
-- de Mercado Pago no existe. Encenderla es una migración de una línea aparte
-- (ver specs/100-…md, "Cómo se enciende México") — nunca a mano.
INSERT INTO public.paises_cobro (pais, moneda, activo) VALUES
  ('CL', 'CLP', true),
  ('MX', 'MXN', false);

ALTER TABLE public.paises_cobro ENABLE ROW LEVEL SECURITY;

CREATE POLICY paises_cobro_select_publico ON public.paises_cobro
  FOR SELECT USING (true);
-- Sin insert/update/delete por policy: la tabla se cambia solo por migración,
-- como event_sources (spec 081, D1).

-- 2. events.moneda ---------------------------------------------------------------

ALTER TABLE public.events ADD COLUMN moneda char(3);
-- Nullable: NULL significa "este país no tiene moneda de cobro" (un evento de un
-- país fuera de paises_cobro, p. ej. Argentina).

CREATE OR REPLACE FUNCTION public.events_set_moneda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Spec 100, Decisión 3. El W-114 (D5) permite editar events.pais. Si el evento
  -- ya tiene entradas, cambiarlo también cambiaría la moneda con la que se leen
  -- ventas ya cobradas — 5.000 CLP reinterpretados como 5.000 MXN. SECURITY
  -- DEFINER: sin esto, la RLS de `tickets` de quien edita (colaborador, spec 038)
  -- podría esconderle ventas ajenas y dejar pasar el cambio.
  IF TG_OP = 'UPDATE' AND NEW.pais IS DISTINCT FROM OLD.pais THEN
    IF EXISTS (
      SELECT 1 FROM public.tickets
       WHERE evento_id = NEW.id AND status IN ('pending', 'completed')
    ) THEN
      RAISE EXCEPTION 'pais_con_ventas: el evento % ya tiene entradas y no puede cambiar de país', NEW.id;
    END IF;
  END IF;

  NEW.moneda := (SELECT moneda FROM public.paises_cobro WHERE pais = NEW.pais);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.events_set_moneda() FROM PUBLIC;
-- Función de trigger: Postgres la rechaza fuera de contexto de trigger, pero se
-- revoca igual por el mismo motivo que claim_guest_tickets (spec 046) — no
-- depender de eso.
REVOKE EXECUTE ON FUNCTION public.events_set_moneda() FROM anon, authenticated;

CREATE TRIGGER events_set_moneda_trigger
  BEFORE INSERT OR UPDATE OF pais ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_set_moneda();

-- Backfill: todo evento existente hereda la moneda de su país.
UPDATE public.events e
   SET moneda = pc.moneda
  FROM public.paises_cobro pc
 WHERE pc.pais = e.pais;

-- 3. tickets.moneda / tickets.pais_cobro ------------------------------------------

ALTER TABLE public.tickets ADD COLUMN moneda char(3);
ALTER TABLE public.tickets ADD COLUMN pais_cobro char(2);

-- Backfill: todo ticket existente se cobró con la cuenta chilena en pesos
-- chilenos — es verdad, no un default de conveniencia.
UPDATE public.tickets SET moneda = 'CLP', pais_cobro = 'CL';

ALTER TABLE public.tickets ALTER COLUMN moneda SET NOT NULL;
ALTER TABLE public.tickets ALTER COLUMN pais_cobro SET NOT NULL;
-- Sin DEFAULT a propósito, como events.pais (spec 080): la única vía de
-- escritura es _reservar_ticket_shared: si algún día alguien inserta sin pasar
-- por ella, tiene que fallar, no inventar Chile.

-- 4. precio_vigente_de: suma moneda y se_vende -------------------------------------

DROP FUNCTION public.precio_vigente_de(uuid);

CREATE FUNCTION public.precio_vigente_de(p_evento_id uuid)
RETURNS TABLE (precio text, monto integer, preventa_id uuid, preventa_nombre text,
               restantes integer, cierra_at timestamptz,
               moneda char(3), se_vende boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_evento    public.events%ROWTYPE;
  v_preventa  public.event_preventas%ROWTYPE;
  v_se_vende  boolean;
BEGIN
  SELECT * INTO v_evento FROM public.events WHERE id = p_evento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_existe: %', p_evento_id;
  END IF;

  v_se_vende := EXISTS (
    SELECT 1 FROM public.paises_cobro WHERE pais = v_evento.pais AND activo
  );

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
        public.preventa_cierra_at(v_preventa), v_evento.moneda, v_se_vende;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT v_evento.precio, v_evento.monto, NULL::uuid, NULL::text,
    NULL::integer, NULL::timestamptz, v_evento.moneda, v_se_vende;
END; $$;

REVOKE ALL ON FUNCTION public.precio_vigente_de(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.precio_vigente_de(uuid) TO anon, authenticated;

-- 5. _reservar_ticket_shared: se niega si el país no cobra, estampa la foto -----
--
-- CREATE OR REPLACE sobre la versión del spec 088 (verificada contra
-- pg_get_functiondef en producción antes de escribir esto). Dos cambios: la
-- guarda de país-que-cobra después de validar el estado del evento, y
-- moneda/pais_cobro en el INSERT. El resto —aforo, preventa, email— queda igual.

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
                               moneda, pais_cobro)
  VALUES (p_evento_id, p_user_id, p_guest_email, 'pending', p_preference_id,
          v_monto, p_cantidad, v_preventa_id, v_email,
          v_cobro.moneda, v_cobro.pais)
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END; $$;

-- Mismo REVOKE que el spec 046: el CREATE OR REPLACE no toca grants, pero se
-- repite para que quede explícito en el historial que sigue así.
REVOKE EXECUTE ON FUNCTION public._reservar_ticket_shared(uuid, integer, text, uuid, text)
  FROM anon, authenticated;
