# Spec 192 — Leer, calcular y guardar el punto de la portada (lógica)

> Estado: aplicado (28-nov-2026) — `npx tsc --noEmit` limpio fuera de `supabase/functions`; `src/lib/portada.ts` sin imports y probado con `npx tsx` (criterio 3); sin probar contra la base ni en un dispositivo (V 192-a/b/c).
> Capa: LÓGICA. `src/lib/portada.ts` (nuevo), `src/lib/portadaDatos.ts` (nuevo), `src/lib/profiles.ts`, `src/hooks/useMusicos.ts`.
> Depende de: W-344 (columnas `portada_x`/`portada_y` en `profiles` y `venues`, y los triggers `profiles_reset_portada_trg`/`venues_reset_portada_trg`), con su migración `20261125120000_spec_w344_punto_de_la_portada.sql` ya en producción.
> Alimenta: spec 201 (FRONTEND).
> Hermano en la web: `libs/portada.js`, `libs/mappers.js`, `libs/data/profiles.js`, `libs/data/venues.js` — W-345.

> **En una frase:** la app lee qué punto de la foto de portada de un músico o local debe
> quedar a la vista, calcula cómo dibujar la foto con ese punto y el punto nuevo mientras el
> dueño la arrastra, y lo guarda.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después
de esta orquestación.» En la web (W-344..W-346) el dueño ya elige qué parte de su portada se
ve (caso real: en la ficha de Felio Saud la portada le cortaba la cabeza). La app sigue
centrando la foto (`src/screens/VerMusicoScreen.tsx:134`,
`src/screens/DirectorioMusicosScreen.tsx:125`), así que un punto guardado en la web no se
respeta en la app.

## Decisión

### Un punto, no un recorte (de W-344)

Se guarda el punto de la imagen que debe quedar a la vista, en porcentaje, como el
`object-position: x% y%` de CSS. `50, 50` es el centro (lo que se ve hoy). Si cambia la foto
y el `UPDATE` no trae un punto nuevo, el trigger de W-344 vuelve el punto a `50, 50`.

React Native no tiene `object-position`: `Image` con `resizeMode="cover"` siempre centra.
Por eso este spec calcula a mano el tamaño y el desplazamiento de la foto dentro de su
marco (`encuadreCover`); la pantalla la dibuja con posición absoluta dentro de una vista
con `overflow: 'hidden'` (spec 201, que explica por qué no se usa `expo-image`).

### 1. `src/lib/portada.ts` (nuevo) — puro, sin imports

Sin imports a propósito, para probarlo con `npx tsx` sin el cliente de Supabase.

```ts
export interface PuntoPortada { x: number; y: number }
export interface Medidas { w: number; h: number }

export const PUNTO_CENTRO: PuntoPortada = { x: 50, y: 50 };

/** Cada eje a un entero entre 0 y 100: fuera de rango cae al borde más cercano; lo que no
 * es número finito cae en 50. */
export function normalizarPunto(p: { x?: unknown; y?: unknown } | null | undefined): PuntoPortada;

/** El punto de una fila cruda de `profiles` o `venues` (`portada_x`, `portada_y`). */
export function puntoDeFila(fila: { portada_x?: unknown; portada_y?: unknown } | null | undefined): PuntoPortada;

export function esCentro(p: PuntoPortada): boolean;

/** Cómo dibujar `imagen` (tamaño natural) para cubrir `marco` con `punto` a la vista:
 * tamaño escalado y desplazamiento (negativo o cero) desde la esquina del marco. */
export function encuadreCover(args: { marco: Medidas; imagen: Medidas; punto: PuntoPortada }):
  { width: number; height: number; left: number; top: number };

/** El punto después de arrastrar la foto `delta` píxeles desde que empezó el arrastre. */
export function puntoTrasArrastre(args: {
  punto: PuntoPortada; delta: { dx: number; dy: number }; marco: Medidas; imagen: Medidas;
}): PuntoPortada;

/** true si sobra algo de la foto en algún eje (si calza justo, no hay nada que ajustar). */
export function hayQueAjustar(args: { marco: Medidas; imagen: Medidas }): boolean;
```

Fórmulas (las mismas de W-345):

- Escala de `cover`: `s = max(marco.w / imagen.w, marco.h / imagen.h)`. Tamaño dibujado:
  `width = imagen.w · s`, `height = imagen.h · s`. Lo que sobra por eje:
  `sobra.w = width − marco.w`, `sobra.h = height − marco.h`.
- `encuadreCover`: `left = −sobra.w · x / 100`, `top = −sobra.h · y / 100`. Con `x = 0` se ve
  el borde izquierdo; con `x = 100`, el derecho; con `50`, el centro (igual que hoy).
- `puntoTrasArrastre`: `x' = x − dx / sobra.w · 100`, `y' = y − dy / sobra.h · 100`
  (arrastrar la foto hacia la derecha muestra más de la izquierda y baja `x`). Si en un eje
  `sobra ≤ 0,5` px, ese eje no cambia (la tolerancia de la web: una foto de la misma
  proporción deja restos de punto flotante). El resultado pasa por `normalizarPunto`.
- `hayQueAjustar`: `sobra.w > 0,5 || sobra.h > 0,5`.
- Medidas con algún lado `≤ 0` (todavía sin `onLayout` o sin tamaño de la imagen):
  `encuadreCover` devuelve `{ width: marco.w, height: marco.h, left: 0, top: 0 }`,
  `puntoTrasArrastre` devuelve el punto sin cambios y `hayQueAjustar` devuelve `false`.

### 2. `src/lib/portadaDatos.ts` (nuevo) — lectura y guardado

```ts
export async function leerPuntoPortadaLocal(venueId: string): Promise<PuntoPortada>;
export async function guardarPuntoPortadaMusico(userId: string, punto: PuntoPortada): Promise<PuntoPortada>;
export async function guardarPuntoPortadaLocal(venueId: string, punto: PuntoPortada): Promise<PuntoPortada>;
```

- Usan el cliente de `src/lib/supabase`.
- `leerPuntoPortadaLocal`: `select('portada_x, portada_y')` de `venues` por `id`,
  `.maybeSingle()`; sin fila, `PUNTO_CENTRO`; con error, lo relanza. Existe porque el
  `Venue` de `VenuesContext` no trae el punto, y ese archivo es del spec 191 (un archivo de
  código, un spec LÓGICA: así 191 y 192 corren en paralelo).
- `guardarPuntoPortada*`: normalizan el punto, hacen `update({ portada_x, portada_y })`
  (solo esas dos columnas) con `.eq('id', …).select('portada_x, portada_y').single()` y
  devuelven `puntoDeFila` de la fila. `PGRST116` (RLS filtró la fila: no es el dueño) →
  `Error('Solo el dueño puede ajustar esta portada.')`; otro error se relanza tal cual.
- Ni `mapProfileToDB` ni `updateVenue` mandan el punto (igual que la web): así el trigger
  de W-344 puede volverlo al centro cuando cambia la foto.

### 3. `src/lib/profiles.ts` — el perfil con su punto

```ts
export type PerfilConPortada = PerfilMusico & { portada: PuntoPortada };
export function mapPerfilConPortadaFromDB(db: any): PerfilConPortada; // { ...mapProfileFromDB(db), portada: puntoDeFila(db) }
```

`mapProfileFromDB` no cambia. **Por qué un tipo nuevo y no un campo en `PerfilMusico`:**
`PerfilMusico` vive en `src/types/index.ts`, que edita el spec 188; sumar el campo ahí
obligaría a serializar 188 y 192. `PerfilConPortada` es un subtipo: todo lo que hoy recibe
un `PerfilMusico` acepta uno sin cambios.

### 4. `src/hooks/useMusicos.ts` — los dos hooks devuelven el punto

`useMusicos` y `usePerfilMusico` mapean con `mapPerfilConPortadaFromDB` y tipan su estado
como `PerfilConPortada` (`musicos: PerfilConPortada[]`, `musico: PerfilConPortada | null`).
Ya leen `select('*')`, así que la consulta no cambia.

### Lo que NO cambia

- `src/types/index.ts`, `src/context/VenuesContext.tsx`, `mapProfileToDB`.
- Los avatares y las tarjetas de evento: el punto es solo de la foto de portada
  (`profiles.foto`, `venues.image`).

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `grep -c "^import" src/lib/portada.ts` devuelve `0`.
3. Prueba con `npx tsx` de `src/lib/portada.ts`:
   - `normalizarPunto({ x: 30, y: 70 })` → `{ x: 30, y: 70 }`; `{ x: 140, y: 'a' }` → `{ x: 100, y: 50 }`;
   - `puntoDeFila({})` y `puntoDeFila(null)` → `{ x: 50, y: 50 }`;
   - `encuadreCover` de una foto 1000×2000 en un marco 400×300 con `y = 0`: `width = 400`,
     `height = 800`, `left = 0`, `top = 0`; con `y = 100`: `top = −500`; con `y = 50`: `top = −250`;
   - `puntoTrasArrastre` con esa foto y ese marco: arrastrar `dy = +50` (foto hacia abajo,
     se ve más de arriba) **baja** `y` de 50 a 40; `x` no cambia porque no sobra ancho; con
     `dy = +10000` queda en 0, nunca negativo;
   - `hayQueAjustar` es `false` con una foto 800×600 en un marco 400×300 y `true` con la foto vertical;
   - medidas en cero: `encuadreCover` devuelve el marco y `hayQueAjustar` da `false`.
4. Lectura del código: ningún `update` de `profiles` o `venues` fuera de `portadaDatos.ts`
   manda `portada_x`/`portada_y`.
5. `git diff --stat` del commit toca solo los cuatro archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- `usePerfilMusico` de un músico que ajustó su portada en la web trae `portada` distinto de `50, 50`.
- `guardarPuntoPortadaLocal` con una cuenta que no es dueña devuelve «Solo el dueño puede
  ajustar esta portada.».
- Cambiar la foto desde `EditarPerfilBandaScreen` deja el punto en `50, 50` (trigger de W-344
  sobre el `upsert`).

## Fuera de alcance

- Las pantallas y el arrastre (spec 201).
- Zoom o recorte.
