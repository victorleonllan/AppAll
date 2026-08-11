-- Spec 036 — Entradas individuales: ticket_items, folio y token QR
--
-- tickets sigue significando "la compra" (monto, payment_id, estado de MP) y no se
-- toca ni una columna del baseline. Encima cuelga ticket_items: una fila por persona
-- que entra, con folio correlativo por evento y token QR opaco para el canje en
-- puerta. Es el primero de la serie 036-041: los otros cinco lo necesitan antes de
-- empezar. Detalle completo en specs/036-entradas-individuales-qr.md.

-- 1. ticket_items + índices ------------------------------------------------

CREATE TABLE public.ticket_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  evento_id   uuid        NOT NULL REFERENCES public.events(id)  ON DELETE CASCADE,
  folio       integer     NOT NULL,
  -- Calificado con "extensions." porque la conexión de `supabase db push` pasa por
  -- el pooler (Supavisor), cuyo rol no trae ese esquema en el search_path por
  -- defecto — sin el prefijo, la migración falla en push aunque funcione en el
  -- editor SQL del dashboard.
  qr_token    text        NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  status      text        NOT NULL DEFAULT 'valid',
  redeemed_at timestamptz,
  redeemed_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ticket_items_status_check
    CHECK (status IN ('valid','used','void')),
  -- Un ticket usado sin fecha de canje, o una fecha sin estado 'used', es un dato
  -- que miente. El CHECK lo hace imposible en vez de dejarlo a la disciplina del código.
  CONSTRAINT ticket_items_redeem_coherente
    CHECK ((status = 'used') = (redeemed_at IS NOT NULL))
);

-- El folio es por evento: el folio 1 existe una vez por evento, no una vez en toda
-- la base. Es lo que hace que "entrada 7 de 40" signifique algo en la puerta.
CREATE UNIQUE INDEX ticket_items_folio_evento ON public.ticket_items (evento_id, folio);

-- El token es la llave de canje: único global, con su propio índice porque el
-- escáner entra siempre por acá y por nada más.
CREATE UNIQUE INDEX ticket_items_qr_token ON public.ticket_items (qr_token);

-- El dashboard del evento cuenta por estado; el escáner lista pendientes del evento.
CREATE INDEX ticket_items_evento_status_idx ON public.ticket_items (evento_id, status);
CREATE INDEX ticket_items_ticket_idx ON public.ticket_items (ticket_id);

-- 2. Contador de folios ------------------------------------------------------

-- Postgres no permite una secuencia por evento sin DDL en tiempo de ejecución. La
-- fila-contador con UPDATE ... RETURNING sirve el mismo propósito: bloquea solo la
-- fila del evento hasta el commit, así que compras del mismo evento se serializan
-- y compras de eventos distintos no se ven entre sí.
CREATE TABLE public.event_folio_counters (
  evento_id  uuid    PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  next_folio integer NOT NULL DEFAULT 1
);
ALTER TABLE public.event_folio_counters ENABLE ROW LEVEL SECURITY;
-- Sin policies: nadie la toca por API. Solo la escribe issue_ticket_items.

-- 3. Función de emisión -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_ticket_items(p_ticket uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_evento   uuid;
  v_cantidad integer;
  v_status   text;
  v_ya       integer;
  v_faltan   integer;
  v_desde    integer;
BEGIN
  -- FOR UPDATE es la guarda de idempotencia real: dos entregas simultáneas del
  -- mismo webhook de MP se serializan acá, y la segunda ve el conteo que dejó la
  -- primera.
  SELECT evento_id, cantidad, status INTO v_evento, v_cantidad, v_status
    FROM public.tickets WHERE id = p_ticket FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket;
  END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'Ticket % está en %, solo se emiten entradas de compras completed',
      p_ticket, v_status;
  END IF;

  SELECT count(*) INTO v_ya FROM public.ticket_items WHERE ticket_id = p_ticket;
  v_faltan := v_cantidad - v_ya;
  IF v_faltan <= 0 THEN
    RETURN 0;                    -- ya emitido: reentrada silenciosa, no error
  END IF;

  INSERT INTO public.event_folio_counters (evento_id) VALUES (v_evento)
    ON CONFLICT DO NOTHING;

  UPDATE public.event_folio_counters
     SET next_folio = next_folio + v_faltan
   WHERE evento_id = v_evento
   RETURNING next_folio - v_faltan INTO v_desde;

  INSERT INTO public.ticket_items (ticket_id, evento_id, folio)
  SELECT p_ticket, v_evento, v_desde + g
    FROM generate_series(0, v_faltan - 1) AS g;

  RETURN v_faltan;
END; $$;

-- SECURITY DEFINER y escribe: nadie debe poder llamarla desde el cliente. El único
-- que la invoca es la Edge Function con el service role (spec 037), que ignora los
-- grants.
REVOKE ALL ON FUNCTION public.issue_ticket_items(uuid) FROM public, anon, authenticated;

-- 4. Trigger de coherencia -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticket_items_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.evento_id <> (SELECT evento_id FROM public.tickets WHERE id = NEW.ticket_id) THEN
    RAISE EXCEPTION 'ticket_items.evento_id no coincide con el de su compra';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.folio <> OLD.folio OR NEW.qr_token <> OLD.qr_token
                           OR NEW.ticket_id <> OLD.ticket_id) THEN
    RAISE EXCEPTION 'folio, qr_token y ticket_id son inmutables';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER ticket_items_guard_trg
  BEFORE INSERT OR UPDATE ON public.ticket_items
  FOR EACH ROW EXECUTE FUNCTION public.ticket_items_guard();

-- 5. RLS -------------------------------------------------------------------

ALTER TABLE public.ticket_items ENABLE ROW LEVEL SECURITY;

-- Lo ve el comprador (es su entrada) y el equipo del evento (la tiene que
-- controlar). can_edit_event() es del spec 033 y ya está en producción: cubre
-- owner, admin y editor.
CREATE POLICY ti_select ON public.ticket_items FOR SELECT USING (
  public.can_edit_event(evento_id)
  OR EXISTS (SELECT 1 FROM public.tickets t
              WHERE t.id = ticket_items.ticket_id AND t.user_id = auth.uid())
);

-- Sin policy de INSERT, UPDATE ni DELETE: con RLS activa la ausencia de policy es
-- negación total. Las únicas escrituras legítimas son la emisión (esta función) y
-- el canje (spec 040), ambas SECURITY DEFINER con su propia autorización adentro.
