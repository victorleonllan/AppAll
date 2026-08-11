-- Spec 037 — Backfill: emite entradas para compras completed que quedaron sin ticket_items
--
-- Toda compra ya confirmada que no tenga entradas emitidas. Hoy son 0 filas: el flujo
-- de compra nunca se cerró de punta a punta (specs/README.md, spec 021). Va igual
-- porque el 021 puede cerrarlo antes de que esta migración se aplique, y entonces
-- habría compras pagadas sin entrada. Detalle en specs/037-emision-entradas-al-confirmar-pago.md.
--
-- El bucle en vez de una sola sentencia es porque issue_ticket_items reserva folios
-- fila por fila; ese es justamente el mecanismo que garantiza que no se repitan.
-- Correrlo es idempotente: una segunda aplicación no encuentra compras sin entradas.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.id FROM public.tickets t
     WHERE t.status = 'completed'
       AND NOT EXISTS (SELECT 1 FROM public.ticket_items ti WHERE ti.ticket_id = t.id)
  LOOP
    PERFORM public.issue_ticket_items(r.id);
  END LOOP;
END $$;
