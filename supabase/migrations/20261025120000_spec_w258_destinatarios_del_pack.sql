-- Spec W-258 (sonopolisWeb) — Pack especial: a quién va cada entrada extra.
-- Ver sonopolisWeb/specs/w258-datos-destinatarios-del-pack.md para el diseño completo.
--
-- La columna vive en tickets y no en ticket_items: los correos se capturan al reservar,
-- cuando el ticket está 'pending' y los ticket_items todavía no existen.

-- ------------------------------------------------------------- 1. correos_validos

-- true si cada correo tiene forma usuario@dominio.tld, mide 254 caracteres o menos y ya
-- viene normalizado (minúsculas, sin espacios alrededor). Un NULL dentro del arreglo no pasa.
CREATE OR REPLACE FUNCTION public.correos_validos(p_correos text[])
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM unnest(p_correos) AS c
     WHERE c IS NULL
        OR c !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
        OR length(c) > 254
        OR c <> lower(btrim(c))
  );
$$;

-- ------------------------------------------------------------- 2. tickets.destinatarios_extra

-- Correos de las entradas 2..N de un pack; el correo k recibe el ticket_item de folio k+1.
-- NULL = todas las entradas van al comprador, como hasta ahora.
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS destinatarios_extra text[];

-- Solo packs, y como mucho cantidad - 1 correos: la primera entrada es del comprador.
ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_destinatarios_extra_validos;
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_destinatarios_extra_validos
  CHECK (
    destinatarios_extra IS NULL
    OR (especial_id IS NOT NULL
        AND cardinality(destinatarios_extra) BETWEEN 1 AND cantidad - 1
        AND public.correos_validos(destinatarios_extra))
  );
