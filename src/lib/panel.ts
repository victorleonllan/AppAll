/**
 * Spec 195 — los números de los paneles de músico y de local. Port de
 * `sonopolisWeb/libs/panel.js` (W-326): la regla vive acá y no repetida en cada
 * pantalla, para que dos pantallas no digan cosas distintas.
 *
 * Sin reloj (reciben `ahora`), sin Supabase y sin React: se prueba con `npx tsx`.
 */

import { PAISES, PAIS_POR_DEFECTO } from '../constants/paises';
import { formatearMonto } from './precio';
import type { TicketStatus } from '../types';

export interface VentaPanel {
  id: string;
  eventoId: string;
  status: TicketStatus;
  monto: number;
  moneda: string | null;
  cantidad: number | null;
  createdAt: string;
  compradorEmail: string | null; // ya enmascarado por `usePanel`
}

export interface EventoPanel {
  id: string;
  comienzaAt?: string | null;
  status?: string; // 'cancelled' no es un próximo show
  pais: string;
  monto?: number; // 0 o ausente = sin venta de entradas
}

export interface EntradaNumeros<S> {
  eventos: EventoPanel[]; // «mis eventos» de la pantalla
  cerrados: ReadonlySet<string>; // ids con closed_at
  ventas: VentaPanel[] | null; // null = no se pudo leer
  solicitudes: S[] | null; // null = no se pudo leer
  contactos: { primerContacto: string | null }[] | null; // null = no se pudo leer
  miUserId: string;
  pais: string; // país del tenant
  ahora: string; // ISO
}

export interface NumerosPanel<S> {
  activos: EventoPanel[]; // sin closed_at, en el orden recibido
  proximosShows: number;
  notaProximoShow: string;
  vendidasPorEvento: Record<string, number> | null;
  vendidasActivas: number | null;
  nombreMes: string;
  cobradoMes: string | null;
  entradasPagadasMes: number | null;
  porResponder: S[] | null;
  masAntiguaPorResponder: string | null;
  contactos: number | null;
  contactosNuevosMes: number | null;
  ventasRecientes: VentaPanel[] | null;
}

/** Margen de la cartelera (spec 119): un show que empezó hace menos de 6 h sigue siendo «el próximo». */
const MARGEN_SHOW_MS = 6 * 3600000;

function zonaDe(pais: string | null | undefined): string {
  return (PAISES[pais ?? PAIS_POR_DEFECTO] ?? PAISES[PAIS_POR_DEFECTO]).zonaHoraria;
}

/** Año, mes y día de un instante vistos en una zona. `en-CA` con números para no
 * depender del idioma del teléfono. `null` si la fecha no se puede leer. */
function partesEn(iso: string, zonaHoraria: string): Record<string, string> | null {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  const partes: Record<string, string> = {};
  for (const { type, value } of new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha)) {
    partes[type] = value;
  }
  return partes;
}

/** Pendientes y que no creé yo: quien creó la fila no la responde (W-034). */
export function solicitudesPorResponder<S extends { status: string; createdBy: string }>(
  solicitudes: S[] | null | undefined,
  miUserId: string,
): S[] {
  return (solicitudes ?? []).filter((s) => s.status === 'pending' && s.createdBy !== miUserId);
}

/** `{ [eventoId]: entradas }` de las ventas `completed`; 1 si falta `cantidad`. */
export function vendidasPorEvento(ventas: VentaPanel[] | null | undefined): Record<string, number> {
  const porEvento: Record<string, number> = {};
  for (const v of ventas ?? []) {
    if (v.status !== 'completed') continue;
    porEvento[v.eventoId] = (porEvento[v.eventoId] ?? 0) + (v.cantidad ?? 1);
  }
  return porEvento;
}

/** `"2026-11"` en la zona del país del tenant, no la del teléfono. `""` si no se puede leer. */
export function claveMesEn(iso: string, pais: string | null | undefined): string {
  const p = partesEn(iso, zonaDe(pais));
  return p ? `${p.year}-${p.month}` : '';
}

/** `"noviembre"` en la zona del país. */
export function nombreMesEn(iso: string, pais: string | null | undefined): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return new Intl.DateTimeFormat('es', { timeZone: zonaDe(pais), month: 'long' }).format(fecha);
}

/** Las ventas `completed` del mes de `ahora`. */
export function ventasDelMes(
  ventas: VentaPanel[] | null | undefined,
  pais: string | null | undefined,
  ahora: string,
): VentaPanel[] {
  const mes = claveMesEn(ahora, pais);
  if (!mes) return [];
  return (ventas ?? []).filter((v) => v.status === 'completed' && claveMesEn(v.createdAt, pais) === mes);
}

/** Contactos con `primerContacto` en el mes de `ahora`. */
export function contactosNuevosDelMes(
  contactos: { primerContacto: string | null }[] | null | undefined,
  pais: string | null | undefined,
  ahora: string,
): number {
  const mes = claveMesEn(ahora, pais);
  if (!mes) return 0;
  return (contactos ?? []).filter((c) => c.primerContacto && claveMesEn(c.primerContacto, pais) === mes).length;
}

/** Entero redondeado; `0` si `total` es 0. */
export function porcentaje(parte: number, total: number): number {
  if (!total) return 0;
  return Math.round((parte / total) * 100);
}

/** Las primeras `n` en el orden de llegada, sin filtrar estado. */
export function ventasRecientes(ventas: VentaPanel[] | null | undefined, n = 5): VentaPanel[] {
  return (ventas ?? []).slice(0, n);
}

/** Estado de un **ticket** en castellano (no es un estado de Mercado Pago). */
export function etiquetaEstadoVenta(status: string): string {
  switch (status) {
    case 'completed':
      return 'Pagada';
    case 'pending':
      return 'Pendiente';
    case 'refunded':
      return 'Reembolsada';
    case 'cancelled':
      return 'Cancelada';
    default:
      return status;
  }
}

export function tonoEstadoVenta(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'pending':
      return 'warning';
    case 'refunded':
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Días de calendario en la zona dada. Los dos días se leen como medianoche UTC:
 * la resta da días exactos, sin el salto del cambio de horario. */
function diasEntre(desde: Record<string, string>, hasta: Record<string, string>): number {
  const dia = (p: Record<string, string>) => Date.parse(`${p.year}-${p.month}-${p.day}T00:00:00Z`);
  return Math.round((dia(hasta) - dia(desde)) / 86400000);
}

/** «Es hoy», «Es mañana», «El siguiente es el viernes» (2 a 6 días) o «…el 28 de
 * noviembre» (7 o más). `""` sin fecha. */
export function textoProximoShow(
  comienzaAt: string | null | undefined,
  ahora: string,
  pais: string | null | undefined,
): string {
  if (!comienzaAt) return '';
  const zona = zonaDe(pais);
  const desde = partesEn(ahora, zona);
  const hasta = partesEn(comienzaAt, zona);
  if (!desde || !hasta) return '';
  const dias = diasEntre(desde, hasta);
  if (dias <= 0) return 'Es hoy';
  if (dias === 1) return 'Es mañana';
  const formato: Intl.DateTimeFormatOptions =
    dias < 7 ? { timeZone: zona, weekday: 'long' } : { timeZone: zona, day: 'numeric', month: 'long' };
  return `El siguiente es el ${new Intl.DateTimeFormat('es', formato).format(new Date(comienzaAt))}`;
}

/** Port de `haceTiempo` (`sonopolisWeb/libs/fecha.js`) con `ahora` en vez de `Date.now()`. */
export function haceTiempo(iso: string | null | undefined, ahora: string): string {
  if (!iso) return '';
  const horas = Math.floor((Date.parse(ahora) - Date.parse(iso)) / 3600000);
  if (Number.isNaN(horas)) return '';
  if (horas < 1) return 'hace un momento';
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  const semanas = Math.floor(dias / 7);
  return `hace ${semanas} ${semanas === 1 ? 'semana' : 'semanas'}`;
}

/** Port de `enmascararEmail` (`sonopolisWeb/libs/privacidad.js`, W-187): 3 caracteres
 * de la parte local (1 si tiene 3 o menos), asteriscos y el dominio completo. */
export function enmascararEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const arroba = email.indexOf('@');
  if (arroba <= 0) return email;
  const local = email.slice(0, arroba);
  const visibles = local.length <= 3 ? 1 : 3;
  return local.slice(0, visibles) + '*'.repeat(local.length - visibles) + email.slice(arroba);
}

/** Suma por moneda en el orden en que aparece y une con " + " (W-168). Copia a
 * propósito de `formatearTotales` de `useAdminPagos.ts`: ese módulo importa Supabase. */
export function totalesPorMoneda(filas: { monto: number; moneda: string | null }[]): string {
  const totales = new Map<string | null, number>(); // Map conserva el orden de inserción
  for (const f of filas) {
    const moneda = f.moneda ?? null;
    totales.set(moneda, (totales.get(moneda) ?? 0) + (f.monto ?? 0));
  }
  if (totales.size === 0) return formatearMonto(0, null);
  return Array.from(totales, ([moneda, monto]) => formatearMonto(monto, moneda)).join(' + ');
}

/** Todos los números de un panel. Un dato que no se pudo leer queda en `null`, nunca en 0. */
export function armarNumerosPanel<S extends { status: string; createdBy: string; createdAt: string }>(
  e: EntradaNumeros<S>,
): NumerosPanel<S> {
  const activos = e.eventos.filter((ev) => !e.cerrados.has(ev.id));

  // Desviación de la web (`activos[0]`): el más cercano desde `ahora − 6 h`, así un
  // evento pasado sin cerrar no es el próximo y el orden de llegada no importa.
  const corte = Date.parse(e.ahora) - MARGEN_SHOW_MS;
  const proximos = activos.filter(
    (ev) => ev.status !== 'cancelled' && (!ev.comienzaAt || Date.parse(ev.comienzaAt) >= corte),
  );
  let siguiente: EventoPanel | undefined;
  for (const ev of proximos) {
    if (!ev.comienzaAt) continue;
    if (!siguiente || Date.parse(ev.comienzaAt) < Date.parse(siguiente.comienzaAt!)) siguiente = ev;
  }

  const porEvento = e.ventas ? vendidasPorEvento(e.ventas) : null;
  const delMes = e.ventas ? ventasDelMes(e.ventas, e.pais, e.ahora) : null;
  const porResponder = e.solicitudes ? solicitudesPorResponder(e.solicitudes, e.miUserId) : null;

  let masAntigua: string | null = null;
  for (const s of porResponder ?? []) {
    if (!masAntigua || Date.parse(s.createdAt) < Date.parse(masAntigua)) masAntigua = s.createdAt;
  }

  return {
    activos,
    proximosShows: proximos.length,
    notaProximoShow: siguiente ? textoProximoShow(siguiente.comienzaAt, e.ahora, siguiente.pais) : '',
    vendidasPorEvento: porEvento,
    vendidasActivas: porEvento ? activos.reduce((suma, ev) => suma + (porEvento[ev.id] ?? 0), 0) : null,
    nombreMes: nombreMesEn(e.ahora, e.pais),
    cobradoMes: delMes ? totalesPorMoneda(delMes) : null,
    entradasPagadasMes: delMes ? delMes.reduce((suma, v) => suma + (v.cantidad ?? 1), 0) : null,
    porResponder,
    masAntiguaPorResponder: masAntigua,
    contactos: e.contactos ? e.contactos.length : null,
    contactosNuevosMes: e.contactos ? contactosNuevosDelMes(e.contactos, e.pais, e.ahora) : null,
    ventasRecientes: e.ventas ? ventasRecientes(e.ventas, 5) : null,
  };
}
