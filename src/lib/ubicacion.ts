// Spec 191 — funciones puras para ubicar un local con pin: distancia, margen de
// ajuste y si la calle que devolvió el mapa es la que se escribió. Port de
// sonopolisWeb/libs/ubicacion.js (W-339). Sin imports a propósito: se prueba con
// `npx tsx` sin arrastrar el cliente de Supabase.

export interface Punto {
  lat: number;
  lng: number;
}

/** Cuánto se puede mover el pin desde el punto que encontró el mapa. Alcanza para
 * llevarlo de la mitad de la cuadra a la puerta o la esquina sin que el punto
 * contradiga la dirección; si el error es mayor, el mapa se equivocó de lugar y
 * eso lo resuelve «Ubicar a mano» (spec 200), no el margen. */
export const MARGEN_PIN_METROS = 150;

/** Radio medio de la Tierra. Lo comparten `distanciaMetros` y `limitarAlMargen`
 * para que un punto puesto a `metros` del centro mida exactamente `metros`. */
const RADIO_TIERRA_M = 6371000;

const aRadianes = (grados: number) => (grados * Math.PI) / 180;
const aGrados = (radianes: number) => (radianes * 180) / Math.PI;

/** Distancia sobre la esfera entre dos puntos (fórmula de haversine), en metros. */
export function distanciaMetros(a: Punto, b: Punto): number {
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** `punto` si está a `metros` o menos de `centro`; si no, el punto del borde del
 * círculo en la misma dirección (rumbo) desde `centro`. */
export function limitarAlMargen(
  centro: Punto,
  punto: Punto,
  metros: number = MARGEN_PIN_METROS
): Punto {
  if (distanciaMetros(centro, punto) <= metros) return punto;

  const lat1 = aRadianes(centro.lat);
  const lng1 = aRadianes(centro.lng);
  const lat2 = aRadianes(punto.lat);
  const dLng = aRadianes(punto.lng - centro.lng);

  // Rumbo inicial desde el centro hacia el punto.
  const rumbo = Math.atan2(
    Math.sin(dLng) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  );
  const d = metros / RADIO_TIERRA_M;

  const latBorde = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(rumbo)
  );
  const lngBorde =
    lng1 +
    Math.atan2(
      Math.sin(rumbo) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(latBorde)
    );

  return { lat: aGrados(latBorde), lng: aGrados(lngBorde) };
}

/** Tipos de vía que se escriben delante del nombre y no lo identifican. */
const PREFIJOS_VIA = new Set(['calle', 'avenida', 'av', 'pasaje', 'psje']);
/** Artículos y preposiciones: no pueden ser «la palabra principal» del nombre. */
const RELLENO = new Set(['el', 'la', 'los', 'las', 'de', 'del']);

/** Las palabras que identifican la calle: minúsculas, sin tildes, sin `#`, sin
 * tokens con números y sin prefijo de tipo de vía. */
function palabrasDeCalle(texto: string | null | undefined): string[] {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !/\d/.test(p) && !PREFIJOS_VIA.has(p) && !RELLENO.has(p));
}

/**
 * ¿La calle que encontró el mapa es la que se escribió? Dice si las dos comparten
 * alguna palabra del nombre (después de quitar tipo de vía, números y rellenos).
 *
 * `calleEncontrada` nula devuelve `true`: no hay con qué contradecir. Si lo escrito
 * no tiene nombre de calle propio («calle 124 #1040» es solo un número), no puede
 * coincidir con una calle que sí tiene nombre: devuelve `false`.
 */
export function calleCoincide(direccionEscrita: string, calleEncontrada: string | null): boolean {
  if (calleEncontrada == null) return true;
  const encontradas = palabrasDeCalle(calleEncontrada);
  if (encontradas.length === 0) return true;
  const escritas = new Set(palabrasDeCalle(direccionEscrita));
  return encontradas.some((p) => escritas.has(p));
}

/** Centro del país para «Ubicar a mano» cuando no hay ningún punto. Es la ciudad
 * donde está la cartelera, no el centro geográfico (`libs/pais.js` de la web).
 * Quien llama hace `CENTRO_PAIS[pais] ?? CENTRO_PAIS.CL`. */
export const CENTRO_PAIS: Record<string, Punto> = {
  CL: { lat: -33.4489, lng: -70.6693 }, // Santiago
  MX: { lat: 31.737, lng: -106.4869 }, // Ciudad Juárez
};

// `Number(null)` y `Number('')` dan 0: se descartan antes para no ubicar nada en 0,0.
function coordenada(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** `{ lat, lng }` de un local, o null. La columna es numeric y puede llegar como
 * texto; un valor no finito cuenta como sin ubicación. */
export function puntoDeVenue(venue: { lat?: unknown; lng?: unknown }): Punto | null {
  const lat = coordenada(venue.lat);
  const lng = coordenada(venue.lng);
  return lat === null || lng === null ? null : { lat, lng };
}

export type ResultadoBusqueda =
  | { encontrado: false }
  | { encontrado: true; punto: Punto; calle: string | null; coincide: boolean };

/** La respuesta cruda de `GET /api/geocodificar` → `ResultadoBusqueda`. Una respuesta
 * con `encontrado: true` pero sin `lat`/`lng` numéricos cuenta como no encontrada. */
export function leerRespuestaGeocodificar(cuerpo: unknown): ResultadoBusqueda {
  const r = (cuerpo ?? {}) as Record<string, unknown>;
  const { lat, lng } = r;
  if (r.encontrado !== true || typeof lat !== 'number' || typeof lng !== 'number') {
    return { encontrado: false };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { encontrado: false };
  return {
    encontrado: true,
    punto: { lat, lng },
    calle: typeof r.calle === 'string' ? r.calle : null,
    coincide: r.coincide !== false,
  };
}

/** Texto para una búsqueda fallida, a partir del `status` y el `codigo` de
 * `ErrorApiWeb` (o de un error de red sin status). */
export function mensajeErrorBusqueda(error: { status?: number; codigo?: string } | null): string {
  if (error?.status === 401) return 'Inicia sesión para ubicar el local en el mapa.';
  return 'No se pudo consultar el mapa';
}
