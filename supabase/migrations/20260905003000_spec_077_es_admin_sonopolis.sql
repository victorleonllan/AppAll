-- Spec 077 — `es_admin()` pasa a llamarse `es_admin_sonopolis()`.
--
-- "Admin" nombraba dos cosas que no se tocan: el dueño de la plataforma
-- (platform_admins, spec 074) y un co-organizador de un evento cualquiera
-- (event_collaborators.role, spec 033). event_role_of() sí lleva su ámbito en
-- el nombre; es_admin() no. Esta migración corrige esa asimetría.
--
-- NO se usa ALTER FUNCTION ... RENAME: el rename sigue las referencias de las
-- policies (guardan el OID) pero NO las de adentro de un cuerpo plpgsql, que
-- para Postgres es texto y se resuelve por nombre recién al ejecutarse. Un
-- rename dejaría las dos funciones plpgsql de abajo llamando a un nombre que ya
-- no existe, y el error no aparecería hasta que alguien intente marcar un pago.

-- 1. La función nueva. Cuerpo idéntico al del spec 074.
CREATE OR REPLACE FUNCTION public.es_admin_sonopolis(p_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = p_user);
$$;

-- 2. Las dos policies de event_payouts (spec 074). Hay que recrearlas aunque el
--    OID las seguiría: mientras una policy apunte a la función vieja, el DROP
--    del paso 4 no puede ejecutarse.
DROP POLICY IF EXISTS event_payouts_select_admin ON public.event_payouts;
CREATE POLICY event_payouts_select_admin ON public.event_payouts FOR SELECT
  USING (public.es_admin_sonopolis());

DROP POLICY IF EXISTS event_payouts_update_admin ON public.event_payouts;
CREATE POLICY event_payouts_update_admin ON public.event_payouts FOR UPDATE
  USING (public.es_admin_sonopolis()) WITH CHECK (public.es_admin_sonopolis());

-- 3. Las dos funciones plpgsql que la nombran en su cuerpo. Se copian de su
--    versión del SPEC 075 (no del 074): el 075 las superó, y traer la versión
--    vieja revertiría el reclamo de pago sin querer.
CREATE OR REPLACE FUNCTION public.event_payouts_guard_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'service_role' AND NOT public.es_admin_sonopolis() THEN

    IF NOT (OLD.status = 'pendiente' AND NEW.status = 'reclamado'
            AND public.event_role_of(NEW.event_id) = 'owner') THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'El estado de pago lo marca Sonópolis, no el organizador';
      END IF;
    END IF;

    IF NEW.pagado_at       IS DISTINCT FROM OLD.pagado_at
       OR NEW.pagado_por   IS DISTINCT FROM OLD.pagado_por
       OR NEW.monto_pagado IS DISTINCT FROM OLD.monto_pagado THEN
      RAISE EXCEPTION 'El estado de pago lo marca Sonópolis, no el organizador';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.marcar_pago_evento(p_event uuid)
RETURNS public.event_payouts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE fila public.event_payouts;
BEGIN
  IF NOT public.es_admin_sonopolis() THEN
    RAISE EXCEPTION 'Solo un admin de Sonópolis marca un pago';
  END IF;

  SELECT * INTO fila FROM public.event_payouts WHERE event_id = p_event;

  IF fila.event_id IS NULL THEN
    RAISE EXCEPTION 'Ese evento no tiene datos bancarios cargados';
  END IF;

  -- Idempotente: dos clicks seguidos no pisan monto_pagado con un número
  -- recalculado más tarde.
  IF fila.status = 'pagado' THEN
    RETURN fila;
  END IF;

  IF fila.status <> 'reclamado' THEN
    RAISE EXCEPTION 'El organizador todavía no reclamó este pago';
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

-- 4. Sin IF EXISTS, a propósito: si quedó una policy apuntando a la vieja,
--    Postgres aborta acá y la migración entera se revierte.
DROP FUNCTION public.es_admin(uuid);

-- 5. Lo que el DROP no puede probar: Postgres no registra la dependencia desde
--    adentro de un cuerpo plpgsql. Si el paso 3 se olvidó de una función, el
--    DROP pasa igual y el error saldría en producción. Este DO lo caza acá.
DO $check$
DECLARE huerfanas text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO huerfanas
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc ~ '\mes_admin\s*\(';

  IF huerfanas IS NOT NULL THEN
    RAISE EXCEPTION 'Quedaron funciones llamando a es_admin(): %', huerfanas;
  END IF;
END $check$;
