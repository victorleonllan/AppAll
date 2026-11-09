// Spec 163 — lógica pura de cobros-pro: recortar lo que llega de Mercado Pago a los
// campos del spec (nunca datos del pagador) y decidir si Sonópolis registró cada cobro.

// deno-lint-ignore no-explicit-any
type MP = Record<string, any>;

export interface PagoSonopolis {
  mp_pago_id: string;
  pagado_at: string;
  hasta_despues: string;
  monto: number;
}

export interface Cobro {
  id: string;
  date_created: string | null;
  date_approved: string | null;
  status: string | null;
  status_detail: string | null;
  payment_type_id: string | null;
  payment_method_id: string | null;
  transaction_amount: number | null;
  currency_id: string | null;
  refunds: { id: string; date_created: string | null; amount: number | null }[];
  registrado: boolean;
}

// `pro_pagos.mp_pago_id` es el id del authorized_payment, no el del pago, y MP no
// documenta una búsqueda de authorized_payments por suscripción: se cruza por fecha.
// Con un cobro al mes, dos cobros aprobados de una suscripción nunca quedan a < 48 h.
const VENTANA_MS = 48 * 60 * 60 * 1000;

const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

function recortarCobro(p: MP): Omit<Cobro, 'registrado'> {
  return {
    id: String(p.id),
    date_created: p.date_created ?? null,
    date_approved: p.date_approved ?? null,
    status: p.status ?? null,
    status_detail: p.status_detail ?? null,
    payment_type_id: p.payment_type_id ?? null,
    payment_method_id: p.payment_method_id ?? null,
    transaction_amount: p.transaction_amount == null ? null : Number(p.transaction_amount),
    currency_id: p.currency_id ?? null,
    refunds: (Array.isArray(p.refunds) ? p.refunds : []).map((r: MP) => ({
      id: String(r.id),
      date_created: r.date_created ?? null,
      amount: r.amount == null ? null : Number(r.amount),
    })),
  };
}

/**
 * Pagos de MP (en el orden en que llegan, más nuevo primero) → cobros con `registrado`.
 * Se empareja de más antiguo a más nuevo y cada pro_pagos se usa una sola vez.
 */
export function armarCobros(pagosMP: MP[], pagosSonopolis: PagoSonopolis[]): Cobro[] {
  const cobros: Cobro[] = pagosMP.map((p) => ({ ...recortarCobro(p), registrado: false }));
  const usados = new Set<number>();

  const porAntiguedad = cobros
    .map((c, i) => ({ c, i }))
    .sort((a, b) => t(a.c.date_approved ?? a.c.date_created) - t(b.c.date_approved ?? b.c.date_created));

  for (const { c } of porAntiguedad) {
    if (c.status !== 'approved') continue;
    const aprobado = t(c.date_approved);
    if (Number.isNaN(aprobado)) continue;
    let mejor = -1;
    let mejorDist = Infinity;
    pagosSonopolis.forEach((ps, j) => {
      if (usados.has(j)) return;
      const dist = Math.abs(t(ps.pagado_at) - aprobado);
      if (dist <= VENTANA_MS && dist < mejorDist) {
        mejor = j;
        mejorDist = dist;
      }
    });
    if (mejor >= 0) {
      usados.add(mejor);
      c.registrado = true;
    }
  }
  return cobros;
}

export function recortarSuscripcionMP(s: MP) {
  return {
    id: String(s.id),
    status: s.status ?? null,
    date_created: s.date_created ?? null,
    last_modified: s.last_modified ?? null,
    next_payment_date: s.next_payment_date ?? null,
    payment_method_id: s.payment_method_id ?? null,
  };
}
