/**
 * Spec 188 — desde W-347 la banda con cuenta es la cuenta (`events.musico_id`,
 * `event_artists.musico_id`) y la ficha (`artists`) es solo para bandas sin cuenta.
 * Port de las reglas puras de W-348.
 *
 * Sin red y solo con `import type`: se prueba con `node` directo.
 */
import type { Banda } from '../types';
import type { TipoTenant } from './adminPro';

export const MAX_BANDAS = 8;

export function bandaDeLaCuenta(perfil: { id: string; nombre?: string | null; foto?: string | null }): Banda {
  return { tipo: 'cuenta', id: perfil.id, nombre: perfil.nombre ?? '', foto: perfil.foto ?? null };
}

export function bandaDeFicha(ficha: { id: string; name?: string | null; image?: string | null }): Banda {
  return { tipo: 'ficha', id: ficha.id, nombre: ficha.name ?? '', foto: ficha.image ?? null };
}

/** Cuentas primero, después fichas; cada grupo por `nombre` (localeCompare 'es');
 * como máximo MAX_BANDAS en total. No modifica sus argumentos. */
export function juntarBandas(cuentas: Banda[], fichas: Banda[]): Banda[] {
  const porNombre = (a: Banda, b: Banda) => a.nombre.localeCompare(b.nombre, 'es');
  return [...[...cuentas].sort(porNombre), ...[...fichas].sort(porNombre)].slice(0, MAX_BANDAS);
}

/** A quiénes pertenece un evento en el CRM (W-301/W-348, misma regla que
 * `privado.crm_base`): el creador si es músico, el local, la cuenta principal (`musicoId`) y
 * cada cuenta adicional. Sin repetidos. Una ficha suelta no suma tenant. */
export function tenantsDeEvento(
  evento: { id: string; createdBy: string | null; venueId: string | null; musicoId?: string | null },
  reglas: { musicosIds: Set<string>; adicionalesPorEvento: Map<string, string[]> }
): { type: TipoTenant; id: string }[] {
  const out = new Map<string, { type: TipoTenant; id: string }>();
  const sumar = (type: TipoTenant, id: string | null | undefined) => {
    if (id) out.set(`${type}:${id}`, { type, id });
  };
  if (evento.createdBy && reglas.musicosIds.has(evento.createdBy)) sumar('musician', evento.createdBy);
  sumar('venue', evento.venueId);
  for (const id of [evento.musicoId, ...(reglas.adicionalesPorEvento.get(evento.id) ?? [])]) {
    sumar('musician', id);
  }
  return [...out.values()];
}

/** Para el feed del fan: la cuenta seguida que firma el evento. Orden: la principal
 * (`musicoId`), las adicionales en su orden, el creador. `null` si ninguna está en `seguidos`. */
export function musicoAutorDelEvento(
  evento: { musicoId?: string | null; createdBy: string },
  adicionales: string[],
  seguidos: Set<string>
): string | null {
  const candidatos = [evento.musicoId, ...adicionales, evento.createdBy];
  return candidatos.find((id): id is string => Boolean(id) && seguidos.has(id as string)) ?? null;
}

/** Une listas de filas por `id`, la primera aparición gana. No modifica sus argumentos. */
export function unirPorId<T extends { id: string }>(...listas: T[][]): T[] {
  const porId = new Map<string, T>();
  for (const fila of listas.flat()) {
    if (!porId.has(fila.id)) porId.set(fila.id, fila);
  }
  return [...porId.values()];
}
