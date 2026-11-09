import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { armarCobros, recortarSuscripcionMP } from './cruce.ts';

// Spec 163 — `registrado` y el recorte de campos de Mercado Pago.

const pagoMP = (o: Record<string, unknown>) => ({
  id: 1,
  date_created: '2026-10-30T16:26:00.000-03:00',
  date_approved: null,
  status: 'approved',
  status_detail: 'accredited',
  payment_type_id: 'credit_card',
  payment_method_id: 'visa',
  transaction_amount: 20000,
  currency_id: 'CLP',
  refunds: [],
  payer: { email: 'x@y.cl', first_name: 'X', identification: { number: '1' } },
  ...o,
});

Deno.test('caso 30-oct: devuelto con débito → registrado false, refunds recortados, sin payer', () => {
  const [c] = armarCobros(
    [
      pagoMP({
        id: 185824675617,
        status: 'refunded',
        status_detail: 'refunded',
        payment_type_id: 'debit_card',
        payment_method_id: 'debvisa',
        date_approved: '2026-10-30T16:26:00.000Z',
        refunds: [{ id: 3484552408, date_created: '2026-10-30T16:34:00.000Z', amount: 20000, source: { id: '1', name: 'X' } }],
      }),
    ],
    [],
  );
  assertEquals(c.id, '185824675617');
  assertEquals(c.status, 'refunded');
  assertEquals(c.payment_type_id, 'debit_card');
  assertEquals(c.refunds, [{ id: '3484552408', date_created: '2026-10-30T16:34:00.000Z', amount: 20000 }]);
  assertEquals(c.registrado, false);
  const texto = JSON.stringify(c);
  for (const prohibido of ['payer', 'email', 'first_name', 'identification']) {
    assertEquals(texto.includes(prohibido), false, prohibido);
  }
});

Deno.test('aprobado con pro_pagos a menos de 48 h → registrado', () => {
  const [c] = armarCobros(
    [pagoMP({ id: 2, date_approved: '2026-11-01T10:00:00.000Z' })],
    [{ mp_pago_id: 'a1', pagado_at: '2026-11-02T09:00:00.000Z', hasta_despues: 'x', monto: 20000 }],
  );
  assertEquals(c.registrado, true);
});

Deno.test('aprobado sin pro_pagos cercano → no registrado', () => {
  const [c] = armarCobros(
    [pagoMP({ id: 3, date_approved: '2026-11-01T10:00:00.000Z' })],
    [{ mp_pago_id: 'a1', pagado_at: '2026-11-04T10:00:00.000Z', hasta_despues: 'x', monto: 20000 }],
  );
  assertEquals(c.registrado, false);
});

Deno.test('rechazado nunca cuenta como registrado aunque haya pro_pagos ese día', () => {
  const [c] = armarCobros(
    [pagoMP({ id: 4, status: 'rejected', status_detail: 'cc_rejected_insufficient_amount', date_approved: null, date_created: '2026-11-01T10:00:00.000Z' })],
    [{ mp_pago_id: 'a1', pagado_at: '2026-11-01T10:00:00.000Z', hasta_despues: 'x', monto: 20000 }],
  );
  assertEquals(c.registrado, false);
});

Deno.test('un pro_pagos empareja una sola vez; orden de salida = el de MP (más nuevo primero)', () => {
  const cobros = armarCobros(
    [
      pagoMP({ id: 6, date_approved: '2026-11-01T12:00:00.000Z' }),
      pagoMP({ id: 5, date_approved: '2026-11-01T10:00:00.000Z' }),
    ],
    [{ mp_pago_id: 'a1', pagado_at: '2026-11-01T11:00:00.000Z', hasta_despues: 'x', monto: 20000 }],
  );
  assertEquals(cobros.map((c) => [c.id, c.registrado]), [['6', false], ['5', true]]);
});

Deno.test('suscripción de MP recortada a los campos del spec', () => {
  const s = recortarSuscripcionMP({
    id: 'pre1', status: 'cancelled', date_created: 'a', last_modified: 'b',
    next_payment_date: 'c', payment_method_id: 'debvisa', payer_email: 'x@y.cl', payer_first_name: 'X',
  });
  assertEquals(s, {
    id: 'pre1', status: 'cancelled', date_created: 'a', last_modified: 'b',
    next_payment_date: 'c', payment_method_id: 'debvisa',
  });
});
