// Spec 171 — visitas de la web para el admin de la app. Port de
// sonopolisWeb/libs/data/visitas.js (W-262, W-266, W-268), solo lectura: la app
// nativa no registra visitas (Decisión 1 del spec 171, W-261). Funciones puras, sin
// cliente de base de datos, para probarlas con `npx tsx`; las dos RPC viven en
// `src/hooks/useAdminVisitas.ts` (Decisión 3).

import { PAISES, PAIS_POR_DEFECTO } from '../constants/paises';
import { formatearFechaHoraCorta } from './redes/horario';

/** Períodos que ofrece el admin (W-263, W-266), en días. */
export const PERIODOS_VISITAS = { '7': 7, '30': 30, '90': 90, '180': 180, '365': 365 } as const;
export type ClavePeriodo = keyof typeof PERIODOS_VISITAS;
export const PERIODO_POR_DEFECTO: ClavePeriodo = '30';
export const MAX_VISITANTES = 500; // tope de admin_visitantes (W-267)

export interface VisitasPais {
  pais: string;
  visitas: number;
  visitantes: number;
  visitantesConSesion: number;
}

export interface PasoRecorrido {
  ruta: string;
  at: string;
  evento: string | null;
}

export interface Visitante {
  visitante: string;
  pais: string;
  primera: string;
  ultima: string;
  visitas: number;
  referente: string | null;
  utmSource: string | null;
  userId: string | null;
  nombre: string | null;
  email: string | null;
  compras: number;
  entradas: number;
  recorrido: PasoRecorrido[];
}

const tiene = (obj: object, clave: string) => Object.prototype.hasOwnProperty.call(obj, clave);

/**
 * Desde cuándo contar para una clave de `PERIODOS_VISITAS`. Una clave desconocida
 * cae a 30 días y no a un error. `hasOwnProperty` y no `Object.hasOwn` (Decisión 5).
 */
export function desdeDePeriodo(clave: string, ahora: number = Date.now()): Date {
  const dias = tiene(PERIODOS_VISITAS, clave)
    ? PERIODOS_VISITAS[clave as ClavePeriodo]
    : PERIODOS_VISITAS[PERIODO_POR_DEFECTO];
  return new Date(ahora - dias * 24 * 60 * 60 * 1000);
}

/** Una fila de `admin_visitas_por_pais`. `Number()` porque los conteos son `bigint`. */
export function mapVisitasPais(fila: any): VisitasPais {
  return {
    pais: fila.pais,
    visitas: Number(fila.visitas),
    visitantes: Number(fila.visitantes),
    visitantesConSesion: Number(fila.visitantes_con_sesion),
  };
}

/**
 * Una fila de `admin_visitantes` (W-267). El recorrido sale ordenado viejas primero:
 * la web lo ordena en el componente, la app en el mapeo (Decisión 6).
 */
export function mapVisitante(fila: any): Visitante {
  const recorrido: PasoRecorrido[] = ((fila.recorrido ?? []) as any[])
    .map((paso) => ({ ruta: paso.ruta, at: paso.at, evento: paso.evento ?? null }))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return {
    visitante: fila.visitante,
    pais: fila.pais,
    primera: fila.primera,
    ultima: fila.ultima,
    visitas: Number(fila.visitas),
    referente: fila.referente ?? null,
    utmSource: fila.utm_source ?? null,
    userId: fila.user_id ?? null,
    nombre: fila.nombre ?? null,
    email: fila.email ?? null,
    compras: Number(fila.compras),
    entradas: Number(fila.entradas),
    recorrido,
  };
}

const ORIGEN_POR_UTM: Record<string, string> = {
  instagram: 'Instagram',
  ig: 'Instagram',
  facebook: 'Facebook',
  fb: 'Facebook',
  whatsapp: 'WhatsApp',
  wa: 'WhatsApp',
  tiktok: 'TikTok',
  google: 'Google',
};

/** `host` es `dominio` o un subdominio suyo (`l.instagram.com`). */
function esDe(host: string, dominio: string): boolean {
  return host === dominio || host.endsWith(`.${dominio}`);
}

/**
 * W-268 — de dónde llegó un visitante, como etiqueta legible.
 *
 * `utmSource` gana: lo pone quien arma el link, así que dice la intención aunque
 * el navegador mande otro referente. Sin ninguno de los dos es «Directo», que
 * **no** significa «escribió la dirección»: WhatsApp y muchas apps no mandan
 * referrer, así que un link compartido por WhatsApp sin `utm_source` también cae
 * acá. La pantalla (spec 172) tiene que decirlo.
 */
export function origenDeVisita({
  referente,
  utmSource,
}: { referente?: string | null; utmSource?: string | null } = {}): string {
  if (utmSource) return tiene(ORIGEN_POR_UTM, utmSource) ? ORIGEN_POR_UTM[utmSource] : utmSource;
  if (!referente) return 'Directo';
  if (esDe(referente, 'instagram.com')) return 'Instagram';
  if (esDe(referente, 'facebook.com') || esDe(referente, 'fb.com')) return 'Facebook';
  if (esDe(referente, 'whatsapp.com') || esDe(referente, 'wa.me')) return 'WhatsApp';
  if (esDe(referente, 'tiktok.com')) return 'TikTok';
  if (referente.includes('google.')) return 'Google';
  if (esDe(referente, 't.co') || esDe(referente, 'x.com') || esDe(referente, 'twitter.com')) {
    return 'X';
  }
  return referente;
}

const ETIQUETA_POR_RUTA: Record<string, string> = {
  '/': 'Inicio',
  '/cartelera': 'Cartelera',
  '/compra/confirmacion': 'Confirmación de compra',
  '/musicos': 'Músicos',
  '/locales': 'Locales',
};

/** W-268 — una ruta del recorrido como texto; `evento` es el título si la ruta es de un evento. */
export function etiquetaDeRuta({ ruta, evento = null }: { ruta: string; evento?: string | null }): string {
  if (tiene(ETIQUETA_POR_RUTA, ruta)) return ETIQUETA_POR_RUTA[ruta];
  if (/^\/cartelera\/[^/]+$/.test(ruta)) return evento ? `Evento: ${evento}` : 'Evento';
  if (/^\/musicos\/[^/]+$/.test(ruta)) return 'Perfil de músico';
  if (/^\/locales\/[^/]+$/.test(ruta)) return 'Perfil de local';
  return ruta;
}

/**
 * «27 oct, 21:53» — cuándo pasó una visita, en la zona del país de la cartelera del
 * visitante (la misma regla de la web). País desconocido → zona del país por defecto.
 * Reusa `formatearFechaHoraCorta` para no repetir las opciones de `Intl` (Decisión 4).
 */
export function formatearMomento(iso: string, pais: string | null | undefined): string {
  const clave = pais ?? '';
  const zona = (tiene(PAISES, clave) ? PAISES[clave] : PAISES[PAIS_POR_DEFECTO]).zonaHoraria;
  return formatearFechaHoraCorta(iso, zona);
}

/**
 * Los números de la cabecera de `/admin/visitas` (web, `page.js:56-65`): visitantes
 * del período, cuántos compraron, entradas compradas y el visitante más antiguo (dice
 * desde cuándo hay datos).
 */
export function resumirVisitas(
  porPais: VisitasPais[],
  visitantes: Visitante[]
): { total: number; compraron: number; entradas: number; primero: Visitante | null } {
  const total = porPais.reduce((s, f) => s + f.visitantes, 0);
  const compraron = visitantes.filter((v) => v.compras > 0).length;
  const entradas = visitantes.reduce((s, v) => s + v.entradas, 0);
  const primero = visitantes.reduce<Visitante | null>(
    (min, v) => (!min || new Date(v.primera) < new Date(min.primera) ? v : min),
    null
  );
  return { total, compraron, entradas, primero };
}
