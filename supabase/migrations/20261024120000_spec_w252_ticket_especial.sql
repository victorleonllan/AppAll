-- Spec W-252 (sonopolisWeb) — Ticket especial: tabla de packs NxN con cupo propio.
-- Ver sonopolisWeb/specs/w252-datos-ticket-especial.md para el diseño completo.
--
-- Tabla aparte de event_preventas a propósito: la escalera de preventas se elige con
-- ORDER BY orden LIMIT 1, y un pack en esa tabla se vendería como preventa vigente en
-- cualquier consulta que olvide filtrarlo.

-- ------------------------------------------------------------- 1. event_tickets_especiales

CREATE TABLE IF NOT EXISTS public.event_tickets_especiales (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  nombre         text        NOT NULL,
  multiplicador  integer     NOT NULL,
  precio         text        NOT NULL,
  monto          integer     NOT NULL,
  cupo           integer     NOT NULL,
  vendidos       integer     NOT NULL DEFAULT 0,
  activa         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Entradas por pack: 2x1 a 5x1.
  CONSTRAINT event_tickets_especiales_multiplicador CHECK (multiplicador BETWEEN 2 AND 5),
  CONSTRAINT event_tickets_especiales_monto CHECK (monto > 0),
  -- cupo y vendidos cuentan packs, no entradas.
  CONSTRAINT event_tickets_especiales_cupo CHECK (cupo > 0),
  CONSTRAINT event_tickets_especiales_vendidos CHECK (vendidos >= 0 AND vendidos <= cupo)
);

CREATE INDEX IF NOT EXISTS event_tickets_especiales_event_idx
  ON public.event_tickets_especiales (event_id);

ALTER TABLE public.event_tickets_especiales ENABLE ROW LEVEL SECURITY;

-- Mismas policies que event_preventas (spec 064).
DROP POLICY IF EXISTS event_tickets_especiales_select ON public.event_tickets_especiales;
CREATE POLICY event_tickets_especiales_select ON public.event_tickets_especiales
  FOR SELECT USING (true);

DROP POLICY IF EXISTS event_tickets_especiales_insert ON public.event_tickets_especiales;
CREATE POLICY event_tickets_especiales_insert ON public.event_tickets_especiales
  FOR INSERT WITH CHECK (public.can_edit_event(event_id));

DROP POLICY IF EXISTS event_tickets_especiales_update ON public.event_tickets_especiales;
CREATE POLICY event_tickets_especiales_update ON public.event_tickets_especiales
  FOR UPDATE USING (public.can_edit_event(event_id));

DROP POLICY IF EXISTS event_tickets_especiales_delete ON public.event_tickets_especiales;
CREATE POLICY event_tickets_especiales_delete ON public.event_tickets_especiales
  FOR DELETE USING (public.can_edit_event(event_id));

-- ------------------------------------------------------------- 2. tickets.especial_id

-- RESTRICT: un pack con compras no se borra, se cierra con activa = false.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS especial_id uuid
  REFERENCES public.event_tickets_especiales(id) ON DELETE RESTRICT;

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_preventa_o_especial;
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_preventa_o_especial
  CHECK (preventa_id IS NULL OR especial_id IS NULL);

CREATE INDEX IF NOT EXISTS tickets_especial_idx ON public.tickets (especial_id)
  WHERE especial_id IS NOT NULL;

-- ------------------------------------------------------------- 3. vendidos se mantiene solo

-- tickets.cantidad son entradas (packs × multiplicador); vendidos cuenta packs.
CREATE OR REPLACE FUNCTION public.tickets_track_especial_vendidos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Entra a 'completed': suma los packs comprados al contador de su especial.
  IF NEW.especial_id IS NOT NULL AND NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.event_tickets_especiales
       SET vendidos = vendidos + NEW.cantidad / multiplicador
     WHERE id = NEW.especial_id;
  END IF;

  -- Sale de 'completed' por reembolso o cancelación: libera el cupo.
  IF TG_OP = 'UPDATE' AND OLD.especial_id IS NOT NULL AND OLD.status = 'completed'
     AND NEW.status IN ('refunded', 'cancelled') THEN
    UPDATE public.event_tickets_especiales
       SET vendidos = vendidos - OLD.cantidad / multiplicador
     WHERE id = OLD.especial_id;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tickets_track_especial_vendidos_trg ON public.tickets;
CREATE TRIGGER tickets_track_especial_vendidos_trg
  AFTER INSERT OR UPDATE OF status ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tickets_track_especial_vendidos();
