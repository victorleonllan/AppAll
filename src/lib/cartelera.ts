// Spec 196 — las cuentas de la Cartelera como funciones puras, port de
// sonopolisWeb/libs/cartelera.js (W-312). No leen el reloj (reciben `ahora`) y no
// importan React ni Supabase. Hora local del teléfono, como `fechaCartelera.ts`.

import { claveDiaLocal, formatearDiaLargo, rangoFecha, type FiltroFecha } from './fechaCartelera';

export interface ConFecha {
  comienzaAt?: string | null;
}

export interface ConteoFechas {
  hoy: number;
  finde: number;
  semana: number;
  todos: number;
}

export interface GrupoDia<T> {
  clave: string; // "YYYY-MM-DD" local, o "sin-fecha"
  titulo: string; // «Sábado 18 de octubre» o «Sin fecha»
  etiqueta: 'hoy' | 'manana' | null;
  items: T[];
}

export interface MensajeVacio {
  titulo: string;
  detalle: string;
  salidaFecha: string | null;
}

/** `items` llega ya filtrado por todo menos la fecha: cada número es lo que se
 * verá al tocar esa fecha. Un rango nunca incluye un evento sin fecha; «todos» sí. */
export function contarPorFecha(items: ConFecha[], ahora: Date): ConteoFechas {
  const contar = (filtro: FiltroFecha): number => {
    const rango = rangoFecha(filtro, ahora);
    if (!rango) return items.length;
    const [inicio, fin] = rango;
    return items.filter((item) => {
      if (!item.comienzaAt) return false;
      const comienzo = new Date(item.comienzaAt);
      return comienzo >= inicio && comienzo < fin;
    }).length;
  };

  return { hoy: contar('hoy'), finde: contar('finde'), semana: contar('semana'), todos: items.length };
}

/** Agrupa por día local conservando el orden de `items`. */
export function agruparPorDia<T extends ConFecha>(items: T[], ahora: Date): GrupoDia<T>[] {
  const claveHoy = claveDiaLocal(ahora.toISOString());
  // Por calendario y no sumando 24 h: el día del cambio de horario dura 23 o 25.
  const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
  const claveManana = claveDiaLocal(manana.toISOString());

  const porDia = new Map<string, GrupoDia<T>>();
  for (const item of items) {
    const clave = item.comienzaAt ? claveDiaLocal(item.comienzaAt) : 'sin-fecha';
    let grupo = porDia.get(clave);
    if (!grupo) {
      grupo = {
        clave,
        titulo: item.comienzaAt ? formatearDiaLargo(item.comienzaAt) : 'Sin fecha',
        etiqueta: clave === claveHoy ? 'hoy' : clave === claveManana ? 'manana' : null,
        items: [],
      };
      porDia.set(clave, grupo);
    }
    grupo.items.push(item);
  }
  return [...porDia.values()];
}

/** «19:00», 24 h, hora local; "" sin fecha o con una ilegible. */
export function horaCorta(comienzaAt: string | null | undefined): string {
  if (!comienzaAt) return '';
  const d = new Date(comienzaAt);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const CUANDO: Record<Exclude<FiltroFecha, 'todos'>, string> = {
  hoy: 'Hoy',
  finde: 'Este finde',
  semana: 'Esta semana',
};

/** Qué decir cuando no queda nada. `salidaFecha` es el texto del botón que pone
 * la fecha en «Todos» sin tocar los demás filtros. */
export function mensajeVacio(e: {
  fecha: FiltroFecha;
  genero: string | null;
  nombrePais: string | null;
  paisSinCartelera: boolean;
}): MensajeVacio {
  // Sin nombre de país no se afirma nada de «el país» (spec W-113).
  if (e.paisSinCartelera && e.nombrePais) {
    return {
      titulo: `Todavía no hay eventos en ${e.nombrePais}`,
      detalle: 'Estamos sumando locales y ticketeras.',
      salidaFecha: null,
    };
  }

  if (e.fecha === 'todos') {
    return {
      titulo: 'Ningún evento calza con estos filtros',
      detalle: 'Prueba quitando algún filtro.',
      salidaFecha: null,
    };
  }

  const cuando = CUANDO[e.fecha];
  const enPais = e.nombrePais ? ` en ${e.nombrePais}` : '';

  if (e.genero) {
    const genero = e.genero.toLowerCase();
    return {
      titulo: `${cuando} no hay ${genero}${enPais}`,
      detalle: 'Ningún evento calza con estos filtros. Prueba con otra fecha o quita el género.',
      salidaFecha: `Ver ${genero} en otras fechas`,
    };
  }

  return {
    titulo: `${cuando} no hay shows con estos filtros`,
    detalle: 'Prueba con otra fecha o quita algún filtro.',
    salidaFecha: 'Ver todas las fechas',
  };
}

/** Salida del vacío: próximos eventos de Sonópolis (nunca externos, W-024) del
 * `genero` si hay uno. Ignora los demás filtros a propósito. */
export function proximosParaVacio<T extends ConFecha & { genero?: string | null }>(
  internos: T[],
  e: { genero: string | null; ahora: Date; max?: number },
): T[] {
  return internos
    .filter((item) => {
      if (!item.comienzaAt || !(new Date(item.comienzaAt) >= e.ahora)) return false;
      return !e.genero || item.genero === e.genero;
    })
    .slice(0, e.max ?? 3);
}
