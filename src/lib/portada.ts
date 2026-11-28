// Spec 192 — punto de la portada del músico y del local (lógica pura). Hermano de
// `libs/portada.js` de la web (W-345).
//
// Se guarda el punto de la foto que debe quedar a la vista, como
// `object-position: x% y%` (columnas `portada_x`/`portada_y`, spec W-344).
// Sin imports: se prueba con `npx tsx` sin el cliente de Supabase.

export interface PuntoPortada {
  x: number;
  y: number;
}

export interface Medidas {
  w: number;
  h: number;
}

export const PUNTO_CENTRO: PuntoPortada = { x: 50, y: 50 };

/** Debajo de este sobrante (px) un eje cuenta como «no sobra nada»: una foto con la
 * misma proporción que el marco deja restos de punto flotante, y arrastrar sobre medio
 * píxel movería el punto cientos de puntos porcentuales. */
const SOBRA_MINIMA_PX = 0.5;

function normalizarEje(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 50;
  return Math.round(Math.min(100, Math.max(0, n)));
}

/** Cada eje a un entero entre 0 y 100: fuera de rango cae al borde más cercano; lo que no
 * es número finito cae en 50. */
export function normalizarPunto(p: { x?: unknown; y?: unknown } | null | undefined): PuntoPortada {
  return { x: normalizarEje(p?.x), y: normalizarEje(p?.y) };
}

/** El punto de una fila cruda de `profiles` o `venues` (`portada_x`, `portada_y`). */
export function puntoDeFila(
  fila: { portada_x?: unknown; portada_y?: unknown } | null | undefined,
): PuntoPortada {
  return normalizarPunto({ x: fila?.portada_x, y: fila?.portada_y });
}

export function esCentro(p: PuntoPortada): boolean {
  return p.x === PUNTO_CENTRO.x && p.y === PUNTO_CENTRO.y;
}

/** Escala de `cover`, tamaño dibujado y lo que sobra en cada eje. `null` si algún lado
 * todavía no sirve (sin `onLayout` o sin tamaño de la imagen). */
function cubrir(marco: Medidas, imagen: Medidas) {
  if (![marco.w, marco.h, imagen.w, imagen.h].every((m) => Number.isFinite(m) && m > 0)) {
    return null;
  }
  const escala = Math.max(marco.w / imagen.w, marco.h / imagen.h);
  const width = imagen.w * escala;
  const height = imagen.h * escala;
  return { width, height, sobra: { w: width - marco.w, h: height - marco.h } };
}

/** Cómo dibujar `imagen` (tamaño natural) para cubrir `marco` con `punto` a la vista:
 * tamaño escalado y desplazamiento (negativo o cero) desde la esquina del marco. */
export function encuadreCover({
  marco,
  imagen,
  punto,
}: {
  marco: Medidas;
  imagen: Medidas;
  punto: PuntoPortada;
}): { width: number; height: number; left: number; top: number } {
  const c = cubrir(marco, imagen);
  if (!c) return { width: marco.w, height: marco.h, left: 0, top: 0 };
  // `0 - …` y no `-…`: con el punto en 0 el signo menos daría -0.
  return {
    width: c.width,
    height: c.height,
    left: 0 - (c.sobra.w * punto.x) / 100,
    top: 0 - (c.sobra.h * punto.y) / 100,
  };
}

/** El punto después de arrastrar la foto `delta` píxeles desde que empezó el arrastre.
 * `punto` es el de ese comienzo y `delta` el movimiento acumulado, no entre eventos, para
 * no acumular el error del redondeo. */
export function puntoTrasArrastre({
  punto,
  delta,
  marco,
  imagen,
}: {
  punto: PuntoPortada;
  delta: { dx: number; dy: number };
  marco: Medidas;
  imagen: Medidas;
}): PuntoPortada {
  const c = cubrir(marco, imagen);
  if (!c) return punto;
  const mover = (eje: number, d: number, sobra: number) =>
    sobra <= SOBRA_MINIMA_PX || !Number.isFinite(d) ? eje : eje - (d / sobra) * 100;
  return normalizarPunto({
    x: mover(punto.x, delta.dx, c.sobra.w),
    y: mover(punto.y, delta.dy, c.sobra.h),
  });
}

/** true si sobra algo de la foto en algún eje (si calza justo, no hay nada que ajustar). */
export function hayQueAjustar({ marco, imagen }: { marco: Medidas; imagen: Medidas }): boolean {
  const c = cubrir(marco, imagen);
  if (!c) return false;
  return c.sobra.w > SOBRA_MINIMA_PX || c.sobra.h > SOBRA_MINIMA_PX;
}
