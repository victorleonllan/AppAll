-- Spec 064 — Precio general/puerta + preventas agregables.
-- Ver specs/064-precio-general-puerta-y-preventas.md para el diseño completo.

-- ------------------------------------------------------------- 1. events.tipo_precio

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS tipo_precio text NOT NULL DEFAULT 'general';

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_tipo_precio_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_tipo_precio_check CHECK (tipo_precio IN ('general', 'puerta'));

-- ------------------------------------------------------------- 2. event_preventas

CREATE TABLE IF NOT EXISTS public.event_preventas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  nombre      text        NOT NULL,
  orden       integer     NOT NULL,
  precio      text        NOT NULL,
  monto       integer     NOT NULL,
  cupo        integer,
  vendidos    integer     NOT NULL DEFAULT 0,
  activa      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_preventas_orden_unico UNIQUE (event_id, orden),
  CONSTRAINT event_preventas_cupo_valido CHECK (cupo IS NULL OR vendidos <= cupo)
);

CREATE INDEX IF NOT EXISTS event_preventas_event_idx ON public.event_preventas (event_id);

ALTER TABLE public.event_preventas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_preventas_select ON public.event_preventas;
CREATE POLICY event_preventas_select ON public.event_preventas FOR SELECT USING (true);

DROP POLICY IF EXISTS event_preventas_insert ON public.event_preventas;
CREATE POLICY event_preventas_insert ON public.event_preventas FOR INSERT
  WITH CHECK (public.can_edit_event(event_id));

DROP POLICY IF EXISTS event_preventas_update ON public.event_preventas;
CREATE POLICY event_preventas_update ON public.event_preventas FOR UPDATE
  USING (public.can_edit_event(event_id));

DROP POLICY IF EXISTS event_preventas_delete ON public.event_preventas;
CREATE POLICY event_preventas_delete ON public.event_preventas FOR DELETE
  USING (public.can_edit_event(event_id));

-- ------------------------------------------------------------- 3. tickets.preventa_id

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS preventa_id uuid REFERENCES public.event_preventas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tickets_preventa_idx ON public.tickets (preventa_id)
  WHERE preventa_id IS NOT NULL;

-- ------------------------------------------------------------- 4. vendidos se mantiene solo

CREATE OR REPLACE FUNCTION public.tickets_track_preventa_vendidos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Entra a 'completed': suma la cantidad comprada al contador de su preventa.
  IF NEW.preventa_id IS NOT NULL AND NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.event_preventas SET vendidos = vendidos + NEW.cantidad
     WHERE id = NEW.preventa_id;
  END IF;

  -- Sale de 'completed' por reembolso o cancelación: libera el cupo.
  IF TG_OP = 'UPDATE' AND OLD.preventa_id IS NOT NULL AND OLD.status = 'completed'
     AND NEW.status IN ('refunded', 'cancelled') THEN
    UPDATE public.event_preventas SET vendidos = vendidos - OLD.cantidad
     WHERE id = OLD.preventa_id;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tickets_track_preventa_vendidos_trg ON public.tickets;
CREATE TRIGGER tickets_track_preventa_vendidos_trg
  AFTER INSERT OR UPDATE OF status ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tickets_track_preventa_vendidos();
