/**
 * Spec 197 — reglas puras de bandas para el admin (sin Supabase y sin imports: se
 * prueban con `node`). Port de sonopolisWeb/libs/bandas.js y de las funciones puras
 * de W-354 (libs/lineup.js).
 */

export type TipoBanda = 'cuenta' | 'ficha';

/** Una banda es una cuenta de músico (`profiles`) o una ficha suelta (`artists`). */
export interface BandaRef {
  tipo: TipoBanda;
  id: string;
}

const PREFIJOS = new Set(['the', 'los', 'las', 'la', 'el', 'banda', 'grupo']);

/**
 * Nombre comparable de una banda: minúsculas, sin tildes, sin signos, espacios simples
 * y sin artículos ni prefijos al inicio. Solo se quitan del inicio: un `del` en medio es
 * parte del nombre. Si el nombre fuera solo prefijos (`La Banda`), queda la última palabra.
 */
export function normalizarNombreBanda(nombre: string | null | undefined): string {
  const base = String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Apóstrofes y puntos se pegan (`R.E.M.` → `rem`); el resto de los signos
    // separa palabras (`Soda-Stereo` → `soda stereo`).
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const palabras = base.split(' ').filter(Boolean);
  while (palabras.length > 1 && PREFIJOS.has(palabras[0])) palabras.shift();
  return palabras.join(' ');
}

const letras = (s: string) => s.replace(/ /g, '').length;

/**
 * Para cada ficha suelta, las cuentas de músico cuyo nombre normalizado es igual, o que
 * contiene al otro con al menos 5 letras (las del contenido). Exactas primero; el resto
 * conserva el orden de entrada. No sugiere una cuenta para una ficha que creó esa misma
 * cuenta.
 */
export function sugerirCoincidencias(
  fichasSueltas: { id: string; name: string; createdBy?: string | null }[],
  cuentas: { id: string; nombre: string | null }[],
): { fichaId: string; cuentaId: string; exacta: boolean }[] {
  const cuentasN = (cuentas ?? []).map((c) => ({ id: c.id, n: normalizarNombreBanda(c.nombre) }));
  const exactas: { fichaId: string; cuentaId: string; exacta: boolean }[] = [];
  const parciales: { fichaId: string; cuentaId: string; exacta: boolean }[] = [];
  for (const ficha of fichasSueltas ?? []) {
    const f = normalizarNombreBanda(ficha.name);
    if (!f) continue;
    for (const c of cuentasN) {
      if (!c.n || c.id === ficha.createdBy) continue;
      if (f === c.n) {
        exactas.push({ fichaId: ficha.id, cuentaId: c.id, exacta: true });
      } else if ((c.n.includes(f) && letras(f) >= 5) || (f.includes(c.n) && letras(c.n) >= 5)) {
        parciales.push({ fichaId: ficha.id, cuentaId: c.id, exacta: false });
      }
    }
  }
  return [...exactas, ...parciales];
}

const vacioANull = (v: unknown) => (v === '' || v === undefined ? null : v);

// Los arreglos se comparan por contenido (en orden) y los objetos sin importar el
// orden de sus claves.
function iguales(x: unknown, y: unknown): boolean {
  const a: any = vacioANull(x);
  const b: any = vacioANull(y);
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => iguales(v, b[i]))
    );
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && iguales(a[k], b[k]));
  }
  return false;
}

/**
 * Solo las claves de `despues` cuyo valor cambió respecto de `antes` (con el valor de
 * `despues`, tal cual): así no se tocan columnas que el admin no movió.
 */
export function soloCambios<T extends Record<string, unknown>>(
  antes: Partial<T> | null | undefined,
  despues: T,
): Partial<T> {
  const cambios: Partial<T> = {};
  for (const clave of Object.keys(despues ?? {}) as (keyof T)[]) {
    if (!iguales(antes?.[clave], despues[clave])) cambios[clave] = despues[clave];
  }
  return cambios;
}

/** `orden` de una adicional nueva al final; el 0 es la principal. */
export function siguienteOrden(adicionales: { orden: number }[]): number {
  const mayor = Math.max(0, ...(adicionales ?? []).map((b) => Number(b?.orden) || 0));
  return mayor + 1;
}

/** De `{ tipo, id }` a los argumentos de `admin_cambiar_principal_evento` (W-353). */
export function argsPrincipal(banda: BandaRef): { p_musico: string | null; p_artist: string | null } {
  if (banda?.tipo === 'cuenta') return { p_musico: banda.id, p_artist: null };
  if (banda?.tipo === 'ficha') return { p_musico: null, p_artist: banda.id };
  throw new Error('banda sin tipo');
}

/** Dos bandas son la misma solo si coinciden `tipo` e `id`. */
export function estaEnElEvento(bandas: BandaRef[], banda: BandaRef): boolean {
  return (bandas ?? []).some((b) => b.tipo === banda.tipo && b.id === banda.id);
}
