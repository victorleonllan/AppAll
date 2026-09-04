-- Spec 073 — Liquidación de eventos: a qué cuenta se transfiere y si ya se pagó.
--
-- Tabla aparte y no columnas en `events` porque `events_select` (spec 033) es
-- `status <> 'draft' OR can_edit_event(id)`: cualquier evento publicado lo lee
-- `anon`, que es lo que hace funcionar la Cartelera. RLS filtra filas, no
-- columnas — un número de cuenta ahí viajaría al navegador de cualquier
-- visitante junto con el póster del show.

CREATE TABLE IF NOT EXISTS public.event_payouts (
  event_id        uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,

  -- Datos que carga el organizador al crear el evento (spec W-082).
  banco           text NOT NULL,
  tipo_cuenta     text NOT NULL CHECK (tipo_cuenta IN ('corriente','vista','ahorro','rut')),
  numero_cuenta   text NOT NULL,
  titular         text NOT NULL,
  rut             text NOT NULL,
  email_contacto  text,

  -- Estado de la liquidación. Lo escribe SOLO Sonópolis (service role, W-083).
  -- `monto_pagado` se congela al marcar pagado en vez de recalcularse siempre:
  -- el monto sale de sumar tickets, y una devolución posterior cambiaría el
  -- número que se muestra sobre una transferencia que ya salió.
  status          text NOT NULL DEFAULT 'pendiente'
                    CHECK (status IN ('pendiente','pagado')),
  pagado_at       timestamptz,
  pagado_por      uuid REFERENCES auth.users(id),
  monto_pagado    integer,
  -- Sin esta marca el cron diario (W-084) manda el mismo aviso todas las
  -- mañanas hasta que Victor pague.
  avisado_at      timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- La cola del back office (W-083) y el barrido del aviso (W-084) filtran por
-- estado; sin esto los dos hacen seq scan sobre la tabla entera.
CREATE INDEX IF NOT EXISTS event_payouts_pendientes_idx
  ON public.event_payouts (status)
  WHERE status = 'pendiente';

ALTER TABLE public.event_payouts ENABLE ROW LEVEL SECURITY;

-- Lee y escribe SOLO el owner del evento. No los colaboradores admin/editor:
-- `can_edit_event` incluye a quien puede editar el póster, y una cuenta
-- bancaria no es del mismo orden que un póster (mismo criterio con que el spec
-- 033 separó `can_manage_team` de `can_edit_event`).
DROP POLICY IF EXISTS event_payouts_select ON public.event_payouts;
CREATE POLICY event_payouts_select ON public.event_payouts FOR SELECT
  USING (public.event_role_of(event_id) = 'owner');

DROP POLICY IF EXISTS event_payouts_insert ON public.event_payouts;
CREATE POLICY event_payouts_insert ON public.event_payouts FOR INSERT
  WITH CHECK (public.event_role_of(event_id) = 'owner');

DROP POLICY IF EXISTS event_payouts_update ON public.event_payouts;
CREATE POLICY event_payouts_update ON public.event_payouts FOR UPDATE
  USING      (public.event_role_of(event_id) = 'owner')
  WITH CHECK (public.event_role_of(event_id) = 'owner');

-- Sin policy de DELETE: la fila se va con el evento por el ON DELETE CASCADE.

-- El owner no puede marcarse como pagado a sí mismo. La policy de UPDATE le da
-- la fila entera, así que la separación entre "sus datos bancarios" y "el
-- estado que marca Sonópolis" la sostiene este trigger.
CREATE OR REPLACE FUNCTION public.event_payouts_guard_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- `current_user` = 'service_role' cuando escribe el back office (W-083);
  -- cualquier sesión de usuario entra como 'authenticated'. Se usa
  -- `current_user` y no `auth.role()` por la lección del spec W-048: ahí
  -- `auth.role()` + SECURITY DEFINER anularon la guarda entera.
  IF current_user <> 'service_role' THEN
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

DROP TRIGGER IF EXISTS event_payouts_guard_estado ON public.event_payouts;
CREATE TRIGGER event_payouts_guard_estado
  BEFORE UPDATE ON public.event_payouts
  FOR EACH ROW EXECUTE FUNCTION public.event_payouts_guard_estado();
