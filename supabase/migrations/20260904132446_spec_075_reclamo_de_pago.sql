-- Spec 075 — El organizador reclama su pago.
--
-- El spec 073 modeló `pendiente → pagado`: un evento entraba a la cola de pagos
-- solo por haber terminado. Eso mete en "hay que transferir" plata que nadie
-- pidió. Ahora el ciclo es:
--
--   pendiente  ──(el organizador reclama)──▶  reclamado  ──(Victor paga)──▶  pagado

ALTER TABLE public.event_payouts DROP CONSTRAINT IF EXISTS event_payouts_status_check;
ALTER TABLE public.event_payouts ADD CONSTRAINT event_payouts_status_check
  CHECK (status IN ('pendiente','reclamado','pagado'));

-- Aparte del status por lo mismo que pagado_at: el estado dice dónde está, la
-- fecha dice cuándo pasó. Sirve para saber cuánto lleva esperando un reclamo sin
-- responder, que es el reproche que un local va a hacer.
ALTER TABLE public.event_payouts ADD COLUMN IF NOT EXISTS reclamado_at timestamptz;

-- El índice parcial del spec 073 apuntaba a 'pendiente', que ya no es el estado
-- de la cola: ahora la cola son los 'reclamado'.
DROP INDEX IF EXISTS event_payouts_pendientes_idx;
CREATE INDEX IF NOT EXISTS event_payouts_reclamados_idx
  ON public.event_payouts (status)
  WHERE status = 'reclamado';

-- Se abre SOLO la transición pendiente → reclamado para el owner. Abrirle
-- `status` entero lo dejaría marcarse `pagado` a sí mismo, que es justo lo que
-- el spec 073 fue a impedir.
CREATE OR REPLACE FUNCTION public.event_payouts_guard_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'service_role' AND NOT public.es_admin() THEN

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

CREATE OR REPLACE FUNCTION public.reclamar_pago_evento(p_event uuid)
RETURNS public.event_payouts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  fila public.event_payouts;
  ev   public.events;
BEGIN
  -- Solo el owner. Ni los colaboradores admin/editor: es plata, mismo criterio
  -- con que el spec 073 dejó la cuenta bancaria fuera del alcance de quien
  -- puede editar el póster.
  IF public.event_role_of(p_event) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Solo el dueño del evento puede reclamar el pago';
  END IF;

  SELECT * INTO ev FROM public.events WHERE id = p_event;

  -- No se reclama un show que no ocurrió: hasta que termine se pueden vender
  -- más entradas, así que el monto todavía no es final.
  IF ev.comienza_at IS NULL OR ev.comienza_at > now() THEN
    RAISE EXCEPTION 'El show todavía no termina';
  END IF;

  SELECT * INTO fila FROM public.event_payouts WHERE event_id = p_event;
  IF fila.event_id IS NULL THEN
    RAISE EXCEPTION 'Faltan los datos bancarios del evento';
  END IF;

  -- Idempotente, y no reabre un pago ya hecho.
  IF fila.status IS DISTINCT FROM 'pendiente' THEN
    RETURN fila;
  END IF;

  UPDATE public.event_payouts
     SET status = 'reclamado', reclamado_at = now()
   WHERE event_id = p_event
  RETURNING * INTO fila;

  RETURN fila;
END $$;

-- Pagar algo que nadie pidió es lo que este spec vino a evitar: marcar_pago_evento
-- (spec 074) ahora exige que el evento esté reclamado.
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
