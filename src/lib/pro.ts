// Spec 148 — Sonópolis Pro en la app. Port de sonopolisWeb/libs/pro.js (W-048, W-243),
// mismos nombres y misma semántica. Funciones puras: la app solo lee el estado, nunca
// lo escribe ni lo vende.

import { formatearFechaEs, separarFechaHora } from './fecha';

type ConPro = { sonopolisProHasta?: string | null } | null | undefined;

/** W-242 — Pro sin vencimiento es la fecha centinela 9999-12-31: sigue siendo una
 * fecha, así que `esPro()` no cambia. Esto solo sirve para mostrarlo. */
export const PRO_SIN_VENCIMIENTO_DESDE_ANIO = 9999;

/** Pro vigente: hay fecha y es futura. Sin la columna (undefined) → false, el lado seguro. */
export function esPro(tenant: ConPro): boolean {
  const hasta = tenant?.sonopolisProHasta;
  if (!hasta) return false;
  return new Date(hasta) > new Date();
}

/** Pro con la fecha centinela (año UTC ≥ 9999, W-242). En UTC como la web: en la hora
 * de Chile `9999-12-31T00:00Z` cae el 30 de diciembre, pero sigue siendo 9999 en UTC. */
export function esProSinVencimiento(tenant: ConPro): boolean {
  if (!esPro(tenant)) return false;
  return new Date(tenant!.sonopolisProHasta!).getUTCFullYear() >= PRO_SIN_VENCIMIENTO_DESDE_ANIO;
}

/** Días que faltan, redondeado hacia arriba (Math.ceil). null si no es Pro. */
export function diasRestantesPro(tenant: ConPro): number | null {
  if (!esPro(tenant)) return null;
  const ms = new Date(tenant!.sonopolisProHasta!).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/** «5 de noviembre de 2026» en la hora del dispositivo. null si no es Pro o si es sin
 * vencimiento. Sin `toLocaleDateString`: el soporte de locales de `Intl` en Hermes no
 * está garantizado en todos los builds (misma razón que `formatearMonto`). */
export function fechaHastaPro(tenant: ConPro): string | null {
  if (!esPro(tenant) || esProSinVencimiento(tenant)) return null;
  const { fechaISO } = separarFechaHora(tenant!.sonopolisProHasta);
  return `${formatearFechaEs(fechaISO)} de ${fechaISO.slice(0, 4)}`;
}

// Spec 168 — la suscripción del dueño (RPC `pro_mi_suscripcion`, spec 161). El tipo vive
// acá y no en `proSuscripcion.ts` para que las fechas se prueben con `tsx` sin red.

export type EstadoSuscripcionPro = 'activa' | 'pausada' | 'cancelada';
export interface MiSuscripcionPro {
  estado: EstadoSuscripcionPro; monto: number; moneda: string;
  ultimoPagoAt: string | null; proximoCobroAt: string | null;
  proHasta: string | null; canceladaAt: string | null;
}

/** Los 3 días que `pro_cerrar_suscripcion` quita al cancelar (spec 161). */
export const GRACIA_MS = 3 * 86_400_000;

/** «26 de noviembre de 2026» en UTC, como `fechaLargaPro` de la web (W-265): así dice
 * el mismo día que la web. `toISOString` ya es UTC; sin `Intl`, igual que `fechaHastaPro`. */
export function fechaLargaPro(iso: string): string {
  const fechaISO = new Date(iso).toISOString().slice(0, 10);
  return `${formatearFechaEs(fechaISO)} de ${fechaISO.slice(0, 4)}`;
}

/** La fecha (ISO) hasta la que queda Pro si el dueño cancela ahora; null si Pro termina
 * hoy. Port de `finSiCancela` (sonopolisWeb/components/CardSonopolisPro.js) sin el
 * texto, que es del spec 169. Activa: el fin del mes pagado. Pausada: sin la gracia. */
export function fechaFinSiCancela(s: MiSuscripcionPro, ahora: Date = new Date()): string | null {
  if (s.estado === 'activa' && s.proximoCobroAt) return s.proximoCobroAt;
  if (!s.proHasta) return null;
  const fin = new Date(new Date(s.proHasta).getTime() - GRACIA_MS);
  if (fin <= ahora) return null;
  return fin.toISOString();
}
