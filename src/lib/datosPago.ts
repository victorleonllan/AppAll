import { supabase } from './supabase';

/**
 * Spec 135 — la cuenta a la que Sonópolis transfiere lo recaudado de un evento.
 * Port de sonopolisWeb/libs/data/pagos.js. Vive en `event_payouts` y no en
 * `events` porque `events_select` deja leer un evento publicado a `anon`, y la
 * RLS filtra filas, no columnas: un número de cuenta en `events` viajaría a
 * cualquier visitante de la cartelera.
 */

/** El CHECK de `event_payouts.tipo_cuenta` (spec 073). */
export type TipoCuenta = 'corriente' | 'vista' | 'ahorro' | 'rut';

export interface DatosPago {
  banco: string;
  tipoCuenta: TipoCuenta | ''; // '' mientras el formulario no elige
  numeroCuenta: string;
  titular: string;
  rut: string;
  emailContacto: string | null;
}

export type EstadoPayout = 'pendiente' | 'reclamado' | 'pagado';

export interface Payout extends DatosPago {
  eventoId: string;
  status: EstadoPayout;
  reclamadoAt: string | null;
  pagadoAt: string | null;
  montoPagado: number | null;
}

export const TIPOS_CUENTA: { valor: TipoCuenta; etiqueta: string }[] = [
  { valor: 'corriente', etiqueta: 'Cuenta corriente' },
  { valor: 'vista', etiqueta: 'Cuenta vista' },
  { valor: 'ahorro', etiqueta: 'Cuenta de ahorro' },
  { valor: 'rut', etiqueta: 'Cuenta RUT' },
];

type CamposBanco = Pick<DatosPago, 'banco' | 'numeroCuenta' | 'titular' | 'rut'>;

function lleno(v: string | null | undefined): boolean {
  return Boolean(v?.trim());
}

/** Si quien organiza empezó a llenar la cuenta (para avisar que está incompleta en
 * vez de ignorarla). Mismo criterio que `FormEvento.js` de la web. */
export function hayAlgunDatoPago(d: CamposBanco): boolean {
  return lleno(d.banco) || lleno(d.numeroCuenta) || lleno(d.titular) || lleno(d.rut);
}

export function datosPagoCompletos(d: CamposBanco & Pick<DatosPago, 'tipoCuenta'>): boolean {
  return lleno(d.banco) && lleno(d.numeroCuenta) && lleno(d.titular) && lleno(d.rut) && Boolean(d.tipoCuenta);
}

/** Spec 135 — `reclamadoAt` va mapeado a propósito: la web lo omite y por eso nunca
 * muestra «Lo pediste el…». */
export function mapPayoutFromDB(db: any): Payout {
  return {
    eventoId: db.event_id,
    banco: db.banco,
    tipoCuenta: db.tipo_cuenta,
    numeroCuenta: db.numero_cuenta,
    titular: db.titular,
    rut: db.rut,
    emailContacto: db.email_contacto ?? null,
    status: (db.status as EstadoPayout) ?? 'pendiente',
    reclamadoAt: db.reclamado_at ?? null,
    pagadoAt: db.pagado_at ?? null,
    montoPagado: db.monto_pagado ?? null,
  };
}

/** `null` si el evento no tiene cuenta cargada. La RLS solo le da la fila al owner,
 * así que para cualquier otro también es `null`, sin chequear permisos acá. */
export async function getPayout(eventoId: string): Promise<Payout | null> {
  const { data, error } = await supabase
    .from('event_payouts')
    .select('*')
    .eq('event_id', eventoId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPayoutFromDB(data) : null;
}

/**
 * Crea o actualiza la fila del evento con un `upsert` sobre la PK: el formulario
 * guarda igual al crear y al editar, y no hacen falta dos consultas para elegir.
 *
 * Manda SOLO `event_id` y las seis columnas de datos. Las de estado (`status`,
 * `pagado_at`, `pagado_por`, `monto_pagado`) las escribe Sonópolis con la service
 * role: el trigger `event_payouts_guard_estado` (spec 073) hace fallar el guardado
 * entero si vienen desde una sesión de usuario, aunque traigan el mismo valor.
 */
export async function guardarDatosPago(eventoId: string, datos: DatosPago): Promise<Payout> {
  const { data, error } = await supabase
    .from('event_payouts')
    .upsert(
      {
        event_id: eventoId,
        banco: datos.banco.trim(),
        tipo_cuenta: datos.tipoCuenta,
        numero_cuenta: datos.numeroCuenta.trim(),
        titular: datos.titular.trim(),
        rut: datos.rut.trim(),
        email_contacto: datos.emailContacto?.trim() || null,
      },
      { onConflict: 'event_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return mapPayoutFromDB(data);
}
