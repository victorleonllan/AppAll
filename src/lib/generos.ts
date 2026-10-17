import { GENEROS_MUSICALES } from '../constants/generos';

/**
 * Spec 055 — normaliza para comparar sin distinguir tildes/mayúsculas:
 * "jazz" encuentra "Jazz", "afoxe" encuentra "Afoxé".
 */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Filtra `lista` por substring, para la caja de búsqueda del picker (spec 056).
 * Query vacía devuelve la lista completa, en el orden original. Spec 146 —
 * `lista` permite buscar sobre los géneros de la cartelera en vez del listado
 * cerrado completo.
 */
export function buscarGeneros(query: string, lista: string[] = GENEROS_MUSICALES): string[] {
  if (!query.trim()) return lista;
  const q = normalizar(query);
  return lista.filter((g) => normalizar(g).includes(q));
}

/**
 * Cartelera filtra por Evento.genero (single-value) contra el género elegido.
 * Comparación exacta, no substring — genero ya sale del listado cerrado en
 * eventos nuevos, no hace falta fuzzy match acá. `null` = "todos los géneros".
 * Eventos viejos con texto libre ("Jazz fusión") no matchean ningún filtro del
 * listado nuevo — mismo trade-off aceptado en el spec 054, no se resuelve acá.
 */
export function eventoCoincideConGenero(eventoGenero: string, generoFiltro: string | null): boolean {
  if (!generoFiltro) return true;
  return eventoGenero === generoFiltro;
}
