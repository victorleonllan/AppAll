# Spec 055 — Búsqueda y filtro por género

> Estado: aplicado (2026-08-24)

**Capa: LÓGICA · `src/lib/generos.ts` · Depende de: spec 054**

## Pedido de Victor

Con el vocabulario cerrado (spec 054) ya existe una lista de dónde elegir, pero elegir de
174 opciones a mano (scroll simple) es mal UX — el propio OffStep resuelve esto con una
caja de texto que filtra la lista mientras se escribe (ver captura en la conversación
original). Este spec es esa lógica de filtrado, reusable por cualquier picker (spec 056) y
por el filtro de Cartelera.

## Trabajo

`src/lib/generos.ts`, dos funciones puras, sin estado ni React:

```ts
import { GENEROS_MUSICALES } from '../constants/generos';

/** Normaliza para comparar sin distinguir tildes/mayúsculas — "jazz" encuentra
 * "Jazz", "afoxe" encuentra "Afoxé". */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Filtra GENEROS_MUSICALES por substring, para la caja de búsqueda del picker
 * (spec 056). Query vacía devuelve la lista completa, en el orden original. */
export function buscarGeneros(query: string): string[] {
  if (!query.trim()) return GENEROS_MUSICALES;
  const q = normalizar(query);
  return GENEROS_MUSICALES.filter((g) => normalizar(g).includes(q));
}

/** Cartelera filtra por Evento.genero (single-value) contra el género elegido.
 * Comparación exacta, no substring — genero ya sale del listado cerrado en
 * eventos nuevos, no hace falta fuzzy match acá. `null` = "todos los géneros". */
export function eventoCoincideConGenero(eventoGenero: string, generoFiltro: string | null): boolean {
  if (!generoFiltro) return true;
  return eventoGenero === generoFiltro;
}
```

`eventoCoincideConGenero` compara por igualdad exacta a propósito: filtra sobre datos que
ya vienen del listado cerrado (eventos creados con el picker del spec 056), no necesita
tolerar variantes. Los eventos viejos con texto libre ("Jazz fusión") simplemente no
matchean ningún filtro del listado nuevo — mismo trade-off aceptado en el spec 054, no se
resuelve acá.

## Fuera de alcance

- El picker visual que usa `buscarGeneros` (spec 056).
- Filtrar por múltiples géneros a la vez en Cartelera — hoy Cartelera no tiene ningún filtro
  (ni fecha, ni venue); este spec agrega el primero, de a uno. Multi-filtro es una mejora
  futura si se pide.

## Criterios de aceptación

- [x] `buscarGeneros('')` devuelve los 174 géneros en el orden de `GENEROS_MUSICALES`
- [x] `buscarGeneros('jazz')` incluye `'Jazz'` y `'Latin jazz'`
- [x] `buscarGeneros('afoxe')` (sin tilde) incluye `'Afoxé'`
- [x] `eventoCoincideConGenero('Rock', null)` → `true` (sin filtro = todos)
- [x] `eventoCoincideConGenero('Rock', 'Rock')` → `true`; `eventoCoincideConGenero('Rock', 'Jazz')` → `false`

## Relacionado

- Spec 054 — el listado que esta lógica filtra
- Spec 056 — picker (FRONTEND) que consume `buscarGeneros`, y filtro de Cartelera que
  consume `eventoCoincideConGenero`
