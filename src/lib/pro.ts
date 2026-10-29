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
