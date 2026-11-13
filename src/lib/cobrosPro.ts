/**
 * Spec 168 — port de sonopolisWeb/libs/cobrosPro.js (W-270): traduce los cobros de Pro
 * que devuelve la Edge Function `cobros-pro` (spec 163) a qué pasó, en palabras.
 * Puro y solo con `import type`: se prueba con `npx tsx` sin levantar Supabase.
 *
 * Los códigos llegan crudos de Mercado Pago a propósito: este mapa se corrige con un
 * build de la app, sin tocar la función. Mismas tablas y textos que la web.
 */

export interface DevolucionMP { id: string; date_created: string | null; amount: number | null }
export interface CobroMP {
  id: string; date_created: string | null; date_approved: string | null;
  status: string | null; status_detail: string | null;
  payment_type_id: string | null; payment_method_id: string | null;
  transaction_amount: number | null; currency_id: string | null;
  refunds: DevolucionMP[]; registrado: boolean;
}
export interface SuscripcionMP {
  id: string; status: string | null; date_created: string | null; last_modified: string | null;
  next_payment_date: string | null; payment_method_id: string | null;
}
export interface PagoSonopolis { mp_pago_id: string; pagado_at: string; hasta_despues: string; monto: number }
export interface SuscripcionConCobros {
  id: string; codigo: string; estado: string; monto: number; moneda: string;
  created_at: string; link_pedido_at: string | null; mp_plan_id: string | null;
  mp_preapproval_id: string | null; mp_error: string | null;
  suscripciones_mp: SuscripcionMP[]; cobros: CobroMP[]; pagos_sonopolis: PagoSonopolis[];
}
export type TonoCobro = 'success' | 'danger' | 'neutral';

const MEDIOS: Record<string, string> = {
  credit_card: 'Tarjeta de crédito',
  debit_card: 'Tarjeta de débito',
  prepaid_card: 'Tarjeta de prepago',
  account_money: 'Saldo de Mercado Pago',
};

const MOTIVOS: Record<string, string> = {
  accredited: 'Cobro aprobado',
  cc_rejected_insufficient_amount: 'Fondos insuficientes',
  cc_rejected_bad_filled_security_code: 'Código de seguridad incorrecto',
  cc_rejected_bad_filled_date: 'Fecha de vencimiento incorrecta',
  cc_rejected_bad_filled_card_number: 'Datos de la tarjeta incorrectos',
  cc_rejected_bad_filled_other: 'Datos de la tarjeta incorrectos',
  cc_rejected_call_for_authorize: 'El banco pide autorizar el pago',
  cc_rejected_card_disabled: 'Tarjeta desactivada',
  cc_rejected_duplicated_payment: 'Pago duplicado',
  cc_rejected_high_risk: 'Rechazado por prevención de fraude de Mercado Pago',
  cc_rejected_max_attempts: 'Demasiados intentos',
  cc_rejected_blacklist: 'Tarjeta bloqueada por Mercado Pago',
  cc_rejected_other_reason: 'El banco rechazó el pago sin dar motivo',
  pending_contingency: 'Mercado Pago lo está revisando',
  pending_review_manual: 'Mercado Pago lo está revisando',
  refunded: 'Devuelto',
  by_collector: 'Anulado por el vendedor',
  expired: 'Venció sin pagarse',
};

// Un cobro se mira por la hora de Chile, como en la actividad de Mercado Pago.
// `hourCycle: 'h23'`: sin él, es-CL puede dar 12 horas (addenda de W-270). La app ya
// depende de `Intl` con `timeZone` en src/lib/redes/horario.ts (spec 157).
const FORMATO_FECHA = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** «30 oct, 13:26» en hora de Chile; «—» sin fecha o inválida. */
export function fechaCobro(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : FORMATO_FECHA.format(d);
}

/** «Tarjeta de débito (debvisa)». Código desconocido → el código; sin dato → «—». */
export function medioDePago(cobro: Pick<CobroMP, 'payment_type_id' | 'payment_method_id'> | null | undefined): string {
  const tipo = cobro?.payment_type_id;
  const base = tipo ? MEDIOS[tipo] ?? tipo : '—';
  const marca = cobro?.payment_method_id;
  return marca && base !== '—' ? `${base} (${marca})` : base;
}

/** Motivo legible del `status_detail`. Desconocido → el código, para buscarlo en MP. */
export function motivoDe(statusDetail: string | null | undefined): string {
  if (!statusDetail) return '—';
  return MOTIVOS[statusDetail] ?? statusDetail;
}

function detalleDevuelto(cobro: CobroMP): string {
  const devolucion = (cobro.refunds ?? [])[0];
  const devueltoAt = devolucion?.date_created;
  if (!devueltoAt) return 'Devuelto';
  const minutos = Math.round(
    (new Date(devueltoAt).getTime() - new Date(cobro.date_approved as string).getTime()) / 60000
  );
  const despues =
    cobro.date_approved && Number.isFinite(minutos) && minutos >= 0
      ? `, ${minutos} min después del cobro`
      : '';
  return `Devuelto el ${fechaCobro(devueltoAt)}${despues}`;
}

/** → { texto, tone, detalle }, con `tone` del Badge. */
export function diagnosticoCobro(cobro: CobroMP): { texto: string; tone: TonoCobro; detalle: string } {
  const status = cobro?.status;
  switch (status) {
    case 'approved':
      return cobro.registrado
        ? { texto: 'Recibido y registrado', tone: 'success', detalle: 'Pro se activó con este cobro' }
        : {
            texto: 'Cobrado, pero Sonópolis no lo registró',
            tone: 'danger',
            detalle: 'Revisar webhook-mp-pro',
          };
    case 'refunded':
    case 'charged_back': {
      const detalle = detalleDevuelto(cobro);
      return {
        texto: 'Devuelto',
        tone: 'danger',
        detalle: status === 'charged_back' ? `Contracargo del banco. ${detalle}` : detalle,
      };
    }
    case 'rejected':
      return { texto: 'Rechazado', tone: 'danger', detalle: motivoDe(cobro.status_detail) };
    case 'in_process':
    case 'pending':
    case 'authorized':
      return { texto: 'En proceso', tone: 'neutral', detalle: motivoDe(cobro.status_detail) };
    case 'cancelled':
      return { texto: 'Anulado', tone: 'neutral', detalle: motivoDe(cobro.status_detail) };
    default:
      return { texto: status ?? '—', tone: 'neutral', detalle: motivoDe(cobro?.status_detail) };
  }
}

const ESTADO_EN_MP: Record<string, string> = {
  authorized: 'activa en Mercado Pago',
  paused: 'pausada en Mercado Pago',
  cancelled: 'cancelada en Mercado Pago',
};

/** Una línea por suscripción → { texto, tone }. Gana la primera regla que aplica. */
export function resumenSuscripcion(s: SuscripcionConCobros): { texto: string; tone: TonoCobro } {
  const cobros = s?.cobros ?? [];
  const enMP = s?.suscripciones_mp ?? [];

  if (s?.mp_error) {
    return { texto: `No se pudo consultar Mercado Pago: ${s.mp_error}`, tone: 'neutral' };
  }
  if (!cobros.length) {
    return s?.estado === 'esperando' && s?.link_pedido_at
      ? { texto: 'Abrió el pago; Mercado Pago no registra ningún cobro', tone: 'neutral' }
      : { texto: 'No ha abierto el pago', tone: 'neutral' };
  }
  const huboDevolucion = cobros.some((c) => c.status === 'refunded' || c.status === 'charged_back');
  if (huboDevolucion && !enMP.some((x) => x.status === 'authorized')) {
    return { texto: 'Mercado Pago cobró y lo devolvió; la suscripción no quedó creada', tone: 'danger' };
  }

  // La más reciente: cobros y suscripciones_mp vienen de MP del más nuevo al más viejo.
  const ultimo = diagnosticoCobro(cobros[0]);
  const estadoMP = enMP.length
    ? ESTADO_EN_MP[enMP[0].status ?? ''] ?? `${enMP[0].status} en Mercado Pago`
    : 'Mercado Pago no creó la suscripción';
  return { texto: `${ultimo.texto} · ${estadoMP}`, tone: ultimo.tone };
}
