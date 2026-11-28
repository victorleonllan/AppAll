/**
 * Spec 189 — reglas puras del lineup de un evento. Port de `sonopolisWeb/libs/lineup.js`.
 *
 * La banda principal vive en `events.musico_id` o `events.artist_id`; las adicionales en
 * `event_artists`. `events.artist_name` es lo que muestran la cartelera, la tarjeta, el
 * buscador y el feed: por eso un evento con varias bandas se titula con todas («A + B»).
 *
 * Sin red y solo con `import type`: se prueba con `node` directo.
 */
import type { Banda } from '../types';

type RefBanda = Pick<Banda, 'tipo' | 'id'>;

/** «Banda Uno + Banda Dos». Sin vacíos ni repetidos (sin distinguir mayúsculas,
 * toLocaleLowerCase('es')), en el orden recibido. Con una sola banda, su nombre; sin
 * ninguna, ''. */
export function tituloDelLineup(nombres: (string | null | undefined)[]): string {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const n of nombres) {
    const nombre = (n ?? '').trim();
    const clave = nombre.toLocaleLowerCase('es');
    if (!nombre || vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(nombre);
  }
  return out.join(' + ');
}

/** Dos bandas son la misma solo si coinciden `tipo` e `id` (un id de `profiles` y uno de
 * `artists` nunca se comparan entre sí). */
export function mismaBanda(a: RefBanda | null | undefined, b: RefBanda | null | undefined): boolean {
  return Boolean(a && b) && a!.tipo === b!.tipo && a!.id === b!.id;
}

export type FilaAdicional = { musicoId: string; orden: number } | { artistId: string; orden: number };

/** Las adicionales que se guardan: sin la principal, sin repetidas, sin las que no tienen
 * `id` o `tipo` válido, con `orden` 1, 2, … (0 es la principal, que no va en la tabla). Una
 * cuenta da `{ musicoId }` y una ficha `{ artistId }`. No modifica sus argumentos. */
export function filasDeAdicionales(principal: RefBanda | null, adicionales: RefBanda[]): FilaAdicional[] {
  const vistas: RefBanda[] = principal ? [principal] : [];
  const out: FilaAdicional[] = [];
  for (const banda of adicionales) {
    if (!banda?.id || (banda.tipo !== 'cuenta' && banda.tipo !== 'ficha')) continue;
    if (vistas.some((v) => mismaBanda(v, banda))) continue;
    vistas.push(banda);
    const orden = out.length + 1;
    out.push(banda.tipo === 'cuenta' ? { musicoId: banda.id, orden } : { artistId: banda.id, orden });
  }
  return out;
}
