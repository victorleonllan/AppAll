# Spec 189 — La app lee y guarda las bandas adicionales del evento, con un título que las junta

> Estado: propuesto (27-nov-2026)
> Capa: LÓGICA. `src/lib/lineup.ts` (nuevo), `src/hooks/useBandasDelEvento.ts` (nuevo).
> Depende de: spec 188 (tipo `Banda`, `Evento.musicoId`, `bandaDeLaCuenta` y `bandaDeFicha` en `src/lib/cuentaEsBanda.ts`); W-300 y W-347 (tabla `event_artists` con `artist_id` o `musico_id`, ya en producción).
> Alimenta: spec 198 (formulario y ficha), spec 199 (invitar desde el evento).
> Hermano en la web: W-303 y W-348 (`libs/lineup.js`, `libs/data/lineup.js`).

> **En una frase:** un módulo puro que titula el evento con todas sus bandas («A + B») y arma
> las filas de `event_artists`, y un hook que lee el lineup completo (principal y adicionales,
> cada una como cuenta o ficha) y guarda las adicionales de un evento recién creado.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en el
mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después de
esta orquestación.»

La web guarda desde el 19-nov-2026 (W-300/W-303/W-305) las bandas que tocan además de la
principal en `event_artists`, y titula el evento con todas. La app no lee esa tabla: un evento
creado en la web con dos bandas se ve en la app con el título «A + B», pero la ficha no sabe
quiénes son ni enlaza a sus perfiles, y crear un evento en la app no permite agregar otra banda.

**Por qué el título junta las bandas** (decisión de W-303, se copia): `events.artist_name` es lo
que muestran la cartelera, la tarjeta, el buscador y el feed. Titular «A + B» hace visibles a
todas en esos lugares sin tocar a ninguno.

## Decisión

Este spec **no edita `EventosContext.tsx`** (es del spec 188): el lineup se lee aparte, por
evento, desde un hook propio.

### `src/lib/lineup.ts` (nuevo, puro)

Solo `import type { Banda } from '../types'`, para probarlo con `node` directo. Port de
`sonopolisWeb/libs/lineup.js`.

```ts
/** «Banda Uno + Banda Dos». Sin vacíos ni repetidos (sin distinguir mayúsculas,
 * toLocaleLowerCase('es')), en el orden recibido. Con una sola banda, su nombre; sin
 * ninguna, ''. */
export function tituloDelLineup(nombres: (string | null | undefined)[]): string;

/** Dos bandas son la misma solo si coinciden `tipo` e `id` (un id de `profiles` y uno de
 * `artists` nunca se comparan entre sí). */
export function mismaBanda(a: Pick<Banda, 'tipo' | 'id'> | null | undefined, b: Pick<Banda, 'tipo' | 'id'> | null | undefined): boolean;

export type FilaAdicional = { musicoId: string; orden: number } | { artistId: string; orden: number };

/** Las adicionales que se guardan: sin la principal, sin repetidas, sin las que no tienen
 * `id` o `tipo` válido, con `orden` 1, 2, … (0 es la principal, que no va en la tabla). Una
 * cuenta da `{ musicoId }` y una ficha `{ artistId }`. No modifica sus argumentos. */
export function filasDeAdicionales(principal: Pick<Banda, 'tipo' | 'id'> | null, adicionales: Pick<Banda, 'tipo' | 'id'>[]): FilaAdicional[];
```

### `src/hooks/useBandasDelEvento.ts` (nuevo)

Usa el cliente de `src/lib/supabase` (llave anónima de la app) y `bandaDeLaCuenta` /
`bandaDeFicha` del spec 188.

```ts
type EventoLineup = Pick<Evento, 'id' | 'musicoId' | 'artistId'>;

/** Principal (orden 0) + adicionales en su orden, cada una como cuenta o ficha. */
export async function getBandasDelEvento(evento: EventoLineup): Promise<Banda[]>;

/** Guarda las adicionales de un evento recién creado. Va DESPUÉS de `createEvento`: la policy
 * de `event_artists` exige `can_edit_event`, que no existe hasta que corre `events_claim_owner`.
 * Sin filas no consulta. Lanza el error de la base tal cual (p. ej. «esa banda ya es la
 * principal del evento»). */
export async function agregarBandasAdicionales(eventId: string, principal: Banda | null, adicionales: Banda[]): Promise<void>;

export function useBandasDelEvento(evento: EventoLineup | null | undefined): {
  bandas: Banda[] | null;   // null = cargando o error de lectura
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
};
```

- `getBandasDelEvento`, en paralelo:
  - principal: con `musicoId`, `profiles.select('id, nombre, foto').eq('id', musicoId).maybeSingle()`
    → `bandaDeLaCuenta` con `orden: 0`; con `artistId`, `artists.select('id, name, image')…`
    → `bandaDeFicha` con `orden: 0`; sin ninguno o sin fila, no hay principal;
  - adicionales: `event_artists.select('orden, artists(id, name, image), cuenta:musico_id(id, nombre, foto)').eq('event_id', id).order('orden')`
    (el mismo `select` de `getBandasAdicionales` de la web); cada fila con `cuenta` →
    `bandaDeLaCuenta`, con `artists` → `bandaDeFicha`, con su `orden`; una fila sin ninguna de
    las dos (RLS o borrada) se salta.
- `agregarBandasAdicionales` inserta `filasDeAdicionales(principal, adicionales)` mapeadas a
  `{ event_id, orden, musico_id }` o `{ event_id, orden, artist_id }`, en un solo `insert`.
- `useBandasDelEvento`: sin evento no consulta y deja `bandas: []`. Un error de lectura deja
  `bandas: null` y `error` con el mensaje, nunca una lista vacía (misma regla que `useMuro`,
  spec 186). El efecto depende de `evento.id`, `evento.musicoId` y `evento.artistId` (no del
  objeto, que es nuevo en cada render); una respuesta vieja se descarta si el evento cambió
  antes de que llegue (patrón `vigente` de `usePerfilMusico`).

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. Prueba con `node` de `src/lib/lineup.ts` (importado directo), con un script en el scratchpad:
   - `tituloDelLineup(['A', ' b ', 'a', '', null, 'C'])` → `'A + b + C'`; `tituloDelLineup(['A'])` → `'A'`; `tituloDelLineup([])` → `''`;
   - `filasDeAdicionales({ tipo: 'cuenta', id: 'p1' }, [cuenta p1, ficha a1, cuenta p2, ficha a1, ficha p1])`
     → `[{ artistId: 'a1', orden: 1 }, { musicoId: 'p2', orden: 2 }, { artistId: 'p1', orden: 3 }]`
     (la cuenta igual a la principal y la ficha repetida se descartan; una ficha con el mismo id
     que una cuenta NO es la misma banda);
   - `filasDeAdicionales(null, [])` → `[]`; los arreglos de entrada no cambian;
   - `mismaBanda({ tipo: 'cuenta', id: 'x' }, { tipo: 'ficha', id: 'x' })` → `false`.
3. `grep -rn "event_artists" src/context/EventosContext.tsx` no devuelve nada (este spec no lo toca).
4. Lectura del código: `useBandasDelEvento` no usa otra llave que la anónima de la app.
5. `git diff --stat` del commit toca solo los dos archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Llega con las pantallas del spec 198: abrir en la app un evento creado en la web con dos
  bandas y ver las dos en la ficha.
