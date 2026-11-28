// Spec 193 — lo que las fichas de músico y local calculan antes de dibujar. Port de
// sonopolisWeb/libs/perfil.js (W-316) y libs/muro.js (W-308).
//
// Puro: sin red, sin React. Las fechas van en la hora local del teléfono (convención de
// la app, spec 119), no en el huso del país como la web, y sin `Intl` ni
// `toLocaleString`: su soporte en Hermes no está garantizado.
import { formatearMonto } from './precio';

const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** Texto con contenido real: descarta null, undefined y cadenas en blanco. */
function lleno(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim() !== '';
}

function fechaValida(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface BloqueFecha { dia: string; num: string; mes: string }

/** «VIE» / «27» / «NOV». `null` sin `comienzaAt` o con fecha inválida. */
export function bloqueFecha(comienzaAt: string | null | undefined): BloqueFecha | null {
  const d = fechaValida(comienzaAt);
  if (!d) return null;
  return { dia: DIAS[d.getDay()], num: String(d.getDate()), mes: MESES[d.getMonth()] };
}

/** «21:30 · $6.000 CLP». Nunca dice «Gratis» por su cuenta: un `monto` vacío no prueba
 * que la entrada sea gratis. */
export function lineaEvento(evento: {
  comienzaAt?: string | null; hora?: string; monto?: number; moneda?: string | null; precio?: string;
}): string {
  const d = fechaValida(evento.comienzaAt);
  const hora = d
    ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : (evento.hora ?? '').trim();
  let precio = '';
  if (evento.monto !== undefined && evento.monto > 0) precio = formatearMonto(evento.monto, evento.moneda);
  else if (lleno(evento.precio)) precio = evento.precio.trim();
  return [hora, precio].filter(lleno).join(' · ');
}

/** Días de calendario entre hoy y el día del evento (0 = hoy, 1 = mañana). */
export function diasHasta(comienzaAt: string, ahora: Date): number {
  // Los dos días locales se llevan a medianoche UTC: la resta da días exactos, sin la
  // hora que mete o quita el cambio de horario de verano.
  const dia = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((dia(new Date(comienzaAt)) - dia(ahora)) / 86400000);
}

/** Lo que acompaña al sello «● En cartelera». */
export function cuandoCorto(comienzaAt: string, ahora: Date): string {
  const dias = diasHasta(comienzaAt, ahora);
  if (dias <= 0) return 'Es hoy';
  if (dias === 1) return 'Mañana';
  return `en ${dias} días`;
}

/** Saca del muro la entrada del evento destacado: un evento de hoy que ya empezó vuelve
 * como pasado en `muro_eventos_pasados` y saldría dos veces. */
export function quitarEventoDelMuro<T extends { clave: string }>(entradas: T[], eventId: string): T[] {
  return entradas.filter((entrada) => entrada.clave !== `evento:${eventId}`);
}

export interface RedPerfil { id: string; nombre: string; href: string }

type CampoRed = 'instagram' | 'spotify' | 'youtube' | 'tiktok' | 'sitioWeb' | 'telefono' | 'emailContacto';

const conEsquema = (v: string) => /^https?:\/\//i.test(v);
const hrefInstagram = (v: string) => (conEsquema(v) ? v : `https://instagram.com/${v.replace(/^@/, '')}`);
const hrefSitio = (v: string) => (conEsquema(v) ? v : `https://${v}`);
const tal = (v: string) => v;

const REDES: Record<'musician' | 'venue', [CampoRed, string, (v: string) => string][]> = {
  // Al músico no se le suman teléfono ni correo: son datos para quien contrata.
  musician: [
    ['instagram', 'Instagram', hrefInstagram],
    ['spotify', 'Spotify', tal],
    ['youtube', 'YouTube', tal],
    ['tiktok', 'TikTok', tal],
    ['sitioWeb', 'Sitio web', hrefSitio],
  ],
  venue: [
    ['instagram', 'Instagram', hrefInstagram],
    ['sitioWeb', 'Sitio web', hrefSitio],
    ['telefono', 'Llamar', (v) => `tel:${v.replace(/\s+/g, '')}`],
    ['emailContacto', 'Correo', (v) => `mailto:${v}`],
  ],
};

/** Solo las redes con valor, en orden fijo. */
export function redesDelPerfil(
  perfil: Partial<Record<CampoRed, string | null>>,
  tipo: 'musician' | 'venue'
): RedPerfil[] {
  return REDES[tipo].flatMap(([id, nombre, armar]) => {
    const valor = perfil[id];
    return lleno(valor) ? [{ id, nombre, href: armar(valor.trim()) }] : [];
  });
}

export interface EnlacesComoLlegar { direccion: string; google: string; waze: string; apple: string }

/** `Number(null)` y `Number('')` dan 0, que es una coordenada válida: se descartan antes. */
function coordenada(valor: unknown): number | null {
  if (typeof valor !== 'number' && !lleno(valor)) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Enlaces de «Cómo llegar» (W-316). Con coordenadas apuntan a ellas; sin ellas, a la
 * dirección completa codificada; sin ninguna de las dos, `null`.
 *
 * El enlace de Google duplica `urlComoLlegar` de `./mapa` (anotado para unificar).
 */
export function enlacesComoLlegar(venue: {
  lat?: unknown; lng?: unknown; address?: string | null; comuna?: string | null; ciudad?: string | null;
}): EnlacesComoLlegar | null {
  const direccion = [venue.address, venue.comuna, venue.ciudad]
    .filter(lleno)
    .map((parte) => parte.trim())
    .join(', ');
  const lat = coordenada(venue.lat);
  const lng = coordenada(venue.lng);

  if (lat !== null && lng !== null) {
    const ll = `${lat},${lng}`;
    return {
      direccion,
      google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
      waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
      apple: `https://maps.apple.com/?daddr=${ll}`,
    };
  }
  if (!lleno(venue.address)) return null;

  const q = encodeURIComponent(direccion);
  return {
    direccion,
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${q}`,
  };
}
