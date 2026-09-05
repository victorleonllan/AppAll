-- Spec W-106 — `whatsapp_broadcasts.segmento`.
-- Ver sonopolisWeb/specs/w106-datos-segmento-en-broadcasts.md
--
-- El historial de envíos guarda a cuántos se mandó pero no a quiénes. Mientras
-- hubo un solo destino posible (todos los opt-ins del tenant) eso alcanzaba;
-- en cuanto W-107 permite recortar por segmento, la fila deja de explicar qué
-- pasó — dos envíos con el mismo recipients_count pueden haber ido a públicos
-- distintos.
--
-- `default 'todos'` para que las filas ya escritas —y cualquier envío que no
-- especifique— queden con el valor correcto: hasta W-107, todos los broadcasts
-- fueron a la lista completa. Por eso el `not null` no necesita backfill
-- aparte: el default se aplica a las filas existentes al agregar la columna.
--
-- El `check` es un vocabulario cerrado, igual que `tenant_type` y `status` en
-- esta misma tabla (spec W-049). Un segmento nuevo es una migración, no un
-- string libre: si el conjunto de segmentos se pudiera escribir desde el
-- cliente, la fila de historial dejaría de ser evidencia de nada.
--
-- Las policies no cambian: `select` solo el dueño del tenant, todas las
-- escrituras solo `service_role` (W-049). El cliente nunca escribe acá.

alter table public.whatsapp_broadcasts
  add column if not exists segmento text not null default 'todos'
    check (segmento in ('todos', 'compradores', 'seguidores'));

comment on column public.whatsapp_broadcasts.segmento is
  'Spec W-106 — a qué recorte de los opt-ins vigentes se mandó: todos | compradores | seguidores. El segmento recorta la lista de opt-ins, nunca la amplía (W-107).';
