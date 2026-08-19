-- Spec 049 — event_sources + external_events (eventos scrapeados)
--
-- Pedido desde sonopolisWeb/specs/w022-datos-eventos-externos.md. Tabla aparte de
-- `events` a propósito: un evento externo no tiene dueño, no se vende en Sonópolis
-- y no debe poder entrar nunca al embudo de compra. Detalle completo, incluida la
-- razón de cada columna, en ese spec.

-- 1. event_sources ------------------------------------------------------------

CREATE TABLE public.event_sources (
  slug        text        PRIMARY KEY,
  nombre      text        NOT NULL,
  home_url    text        NOT NULL,
  activa      boolean     NOT NULL DEFAULT true,
  last_run_at timestamptz,
  -- Separado de last_run_at a propósito: si el sitio cambia y el parseo devuelve 0,
  -- last_run_at sigue avanzando y todo parece sano. La distancia entre las dos es
  -- la única señal de que el scraper se rompió en silencio.
  last_ok_at  timestamptz,
  last_error  text
);

INSERT INTO public.event_sources (slug, nombre, home_url) VALUES
  ('portaltickets', 'PortalTickets', 'https://portaldisc.com/portaltickets');

ALTER TABLE public.event_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_sources_select_publico ON public.event_sources
  FOR SELECT USING (true);
-- Sin insert/update/delete por policy: solo la service role key escribe (salta RLS).

-- 2. external_events ------------------------------------------------------------

CREATE TABLE public.external_events (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug           text        NOT NULL REFERENCES public.event_sources(slug),
  source_uid            text        NOT NULL,
  source_url            text        NOT NULL,
  titulo                text        NOT NULL,
  comienza_at           timestamptz NOT NULL,
  venue_nombre          text,
  -- Criterio de ingesta, no adorno: el pipeline solo guarda comunas del Gran
  -- Santiago (spec W-023 de sonopolisWeb). Una fila sin comuna no se pudo
  -- clasificar y por eso no se pudo decidir si entra.
  comuna                text        NOT NULL,
  direccion             text,
  precio_texto          text,
  genero                text,
  imagen                text,
  lat                   double precision,
  lng                   double precision,
  geocoded_at           timestamptz,
  status                text        NOT NULL DEFAULT 'nuevo',
  duplicado_de_event_id uuid        REFERENCES public.events(id) ON DELETE SET NULL,
  promoted_event_id     uuid        REFERENCES public.events(id) ON DELETE SET NULL,
  raw                   jsonb,
  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now(),
  desaparecido_at       timestamptz,

  CONSTRAINT external_events_status_check
    CHECK (status IN ('nuevo', 'publicado', 'oculto'))
  -- Ningún evento externo se vende acá — no por un CHECK sobre `precio_texto`
  -- (es texto libre, no se puede validar su forma con sentido), sino porque la
  -- tabla simplemente no tiene columna de monto, tickets ni Mercado Pago.
);

-- Sin esto, la segunda corrida del pipeline duplica la cartelera entera.
CREATE UNIQUE INDEX external_events_source_uid_idx
  ON public.external_events (source_slug, source_uid);

-- La consulta de la cartelera pide status='publicado' ordenado por fecha.
CREATE INDEX external_events_status_fecha_idx
  ON public.external_events (status, comienza_at);

ALTER TABLE public.external_events ENABLE ROW LEVEL SECURITY;

-- Los 'nuevo' no son públicos: son borradores de un tercero sin moderar.
CREATE POLICY external_events_select_publicado ON public.external_events
  FOR SELECT USING (status = 'publicado');
-- Sin insert/update/delete por policy: solo la service role key escribe.
