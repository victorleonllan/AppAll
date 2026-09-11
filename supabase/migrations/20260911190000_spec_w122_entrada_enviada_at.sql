-- Spec W-122 — `tickets.entrada_enviada_at`: la marca de que el correo ya salió
--
-- El correo de confirmación (spec W-123) se dispara desde los dos caminos que
-- confirman un pago: `confirm-payment` —que el polling de /compra/confirmacion
-- llama CADA 3 SEGUNDOS durante 3 minutos— y `webhook-mp`, que Mercado Pago
-- reintenta ante cualquier respuesta que no sea 2xx.
--
-- Los dos ya son idempotentes para el ticket (UPDATE ... WHERE status='pending',
-- issue_ticket_items que emite cantidad - ya_emitidas). Mandar un correo no
-- tiene esa propiedad: Resend acepta cada llamada y el buzón acumula copias. La
-- idempotencia hay que construirla, y el único lugar donde dos ejecuciones
-- concurrentes se ven entre sí es la base.
--
-- En `tickets` y no en `ticket_items`: una compra de 4 entradas manda UN correo
-- con los 4 talones, así que la unidad de envío es la compra.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS entrada_enviada_at timestamptz;

COMMENT ON COLUMN public.tickets.entrada_enviada_at IS
  'Momento en que salió el correo de confirmación con las entradas (spec W-122). NULL = no se mandó todavía. Lo reclama /api/entradas/enviar-confirmacion con un UPDATE condicional antes de llamar a Resend: es el candado que evita correos duplicados, no un dato de auditoría. El reenvío manual (W-124) NO lo pisa si ya tiene fecha.';

-- El barrido de "compras pagadas a las que nunca les salió el correo" filtra por
-- estas dos condiciones juntas. Índice parcial y no uno sobre la columna entera:
-- las filas que interesan son las pocas que fallaron, no todas las que ya se
-- mandaron.
CREATE INDEX IF NOT EXISTS tickets_entrada_sin_enviar_idx
  ON public.tickets (created_at)
  WHERE status = 'completed' AND entrada_enviada_at IS NULL;

-- Sin backfill a propósito: las compras ya pagadas quedan en NULL, que es la
-- verdad —a esa gente nunca le llegó el correo— y es exactamente el filtro que
-- hace falta si algún día se decide mandárselo retroactivamente.
