-- Spec 074 — Admin de plataforma: quién es, y que Postgres lo haga cumplir.
--
-- Guardar el permiso acá y no en una variable de entorno de la app permite que
-- RLS autorice sola: la pantalla de /admin lee con la sesión del admin en vez de
-- saltarse RLS con la service role.

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Cada quien ve si él mismo es admin, y nada más: nadie puede listar quiénes
-- son los admins de la plataforma. Alcanza para que el layout de /admin decida
-- si deja pasar o redirige (spec W-083).
DROP POLICY IF EXISTS platform_admins_select_self ON public.platform_admins;
CREATE POLICY platform_admins_select_self ON public.platform_admins FOR SELECT
  USING (user_id = auth.uid());

-- Sin policies de INSERT, UPDATE ni DELETE, a propósito: con RLS activada y
-- ninguna policy de escritura, la tabla es inescribible desde cualquier sesión
-- de usuario. Solo entra por el SQL editor o la service role. No hace falta
-- trigger de guarda porque no hay puerta que cerrar.
--
-- Por qué tabla y no `profiles.is_admin`: `profiles` ya tiene policy de UPDATE
-- para su propio dueño, así que una columna ahí sería escribible por el propio
-- usuario — se haría admin solo. Es el agujero que el spec W-048 tuvo que
-- parchar con un trigger para `sonopolis_pro_hasta`.

-- SECURITY DEFINER acá es necesario y seguro, al revés que en W-048: solo LEE
-- una tabla que ninguna sesión puede escribir, y no decide nada a partir de
-- auth.role(). Mismo molde que event_role_of (spec 033).
CREATE OR REPLACE FUNCTION public.es_admin(p_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = p_user);
$$;

-- El monto vive en SQL y no en JS porque el mismo número lo necesitan la
-- pantalla (para mostrarlo) y la escritura (para congelarlo en monto_pagado).
-- Dos implementaciones de la misma fórmula es la manera de que un día devuelvan
-- distinto.
CREATE OR REPLACE FUNCTION public.monto_a_transferir(p_event uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- `tickets.monto` es el total de la compra con el 10% de recargo adentro
  -- (RECARGO_PLATAFORMA, sonopolisWeb/libs/mappers.js). Se le quita compra por
  -- compra y no a la suma: redondear una sola vez al final arrastra el error de
  -- todas las compras a un solo número.
  SELECT COALESCE(SUM(ROUND(monto / 1.10)), 0)::integer
    FROM public.tickets
   WHERE evento_id = p_event AND status = 'completed';
$$;

-- El admin ve todas las filas de payout; el owner sigue viendo solo la suya
-- (event_payouts_select, spec 073).
DROP POLICY IF EXISTS event_payouts_select_admin ON public.event_payouts;
CREATE POLICY event_payouts_select_admin ON public.event_payouts FOR SELECT
  USING (public.es_admin());

DROP POLICY IF EXISTS event_payouts_update_admin ON public.event_payouts;
CREATE POLICY event_payouts_update_admin ON public.event_payouts FOR UPDATE
  USING (public.es_admin()) WITH CHECK (public.es_admin());

-- Supera la condición que el spec 073 (aplicado) le puso a este trigger: decía
-- "solo service role toca las columnas de estado". Ahora el admin escribe con su
-- propia sesión, que entra como `authenticated`, así que el trigger lo estaría
-- bloqueando. El organizador sigue bloqueado exactamente igual.
CREATE OR REPLACE FUNCTION public.event_payouts_guard_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'service_role' AND NOT public.es_admin() THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.pagado_at IS DISTINCT FROM OLD.pagado_at
       OR NEW.pagado_por IS DISTINCT FROM OLD.pagado_por
       OR NEW.monto_pagado IS DISTINCT FROM OLD.monto_pagado THEN
      RAISE EXCEPTION 'El estado de pago lo marca Sonópolis, no el organizador';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Marca el pago en una sola operación atómica. El monto NO se recibe como
-- parámetro: es el registro de lo que se transfirió, y un valor que viaja desde
-- el cliente es un valor que se puede editar. Lo calcula la misma función que lo
-- mostró en pantalla.
CREATE OR REPLACE FUNCTION public.marcar_pago_evento(p_event uuid)
RETURNS public.event_payouts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE fila public.event_payouts;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo un admin de Sonópolis marca un pago';
  END IF;

  SELECT * INTO fila FROM public.event_payouts WHERE event_id = p_event;

  IF fila.event_id IS NULL THEN
    RAISE EXCEPTION 'Ese evento no tiene datos bancarios cargados';
  END IF;

  -- Idempotente: dos clicks seguidos en un botón que tarda no pueden pisar
  -- monto_pagado con un número recalculado más tarde.
  IF fila.status = 'pagado' THEN
    RETURN fila;
  END IF;

  UPDATE public.event_payouts
     SET status       = 'pagado',
         pagado_at    = now(),
         pagado_por   = auth.uid(),
         monto_pagado = public.monto_a_transferir(p_event)
   WHERE event_id = p_event
  RETURNING * INTO fila;

  RETURN fila;
END $$;
