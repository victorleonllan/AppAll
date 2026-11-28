import { supabase } from './supabase';
import { MAX_BANDAS, bandaDeFicha, bandaDeLaCuenta, juntarBandas, unirPorId } from './cuentaEsBanda';
import type { Banda } from '../types';

/**
 * Spec 188 — desde W-347 una banda con cuenta es la cuenta (`events.musico_id`);
 * `artists` guarda solo las fichas de bandas sin cuenta.
 *
 * Spec 135 — `events.artist_id` apunta a `artists(id)` desde el spec 061, no a
 * `profiles`. Buscar con `search_collaborator_candidates` (que devuelve ids de
 * `profiles`) y mandar ese id como `artist_id` viola la FK (Postgres 23503). Port de
 * sonopolisWeb/libs/data/artists.js. El trigger `events_claim_owner` resuelve el
 * músico detrás del artista, así que usar `artists` no pierde el «entra al equipo».
 */

/** @deprecated usar `Banda` con `buscarBandas` / `crearFichaSuelta` (spec 188). */
export interface ArtistaBreve {
  id: string;
  nombre: string;
}

/** Menos de 2 caracteres no busca: evita traer la tabla entera con cada tecla.
 * @deprecated usar `buscarBandas` (spec 188). */
export async function buscarArtistas(q: string): Promise<ArtistaBreve[]> {
  const texto = (q ?? '').trim();
  if (texto.length < 2) return [];
  const { data, error } = await supabase
    .from('artists')
    .select('id, name')
    .ilike('name', `%${texto}%`)
    .order('name', { ascending: true })
    .limit(8);
  if (error) throw error;
  return (data ?? []).map((a: any) => ({ id: a.id, nombre: a.name }));
}

/** `creadoPor` es obligatorio: la policy `artists_insert` exige
 * `auth.uid() = created_by` (spec 061).
 * @deprecated usar `crearFichaSuelta` (spec 188). */
export async function crearArtista({
  nombre,
  contacto,
  instagram,
  creadoPor,
}: {
  nombre: string;
  contacto?: string | null;
  instagram?: string | null;
  creadoPor: string | null | undefined;
}): Promise<ArtistaBreve> {
  if (!creadoPor) throw new Error('Un artista necesita quién lo registra (creadoPor)');
  const { data, error } = await supabase
    .from('artists')
    .insert({
      name: nombre.trim(),
      contacto: contacto?.trim() || null,
      instagram: instagram?.trim() || null,
      created_by: creadoPor,
    })
    .select('id, name')
    .single();
  if (error) throw error;
  return { id: (data as any).id, nombre: (data as any).name };
}

/** Spec 188 (W-348) — las cuentas de músico y las fichas sin cuenta, juntas y con las
 * cuentas primero. Menos de 2 caracteres no busca. */
export async function buscarBandas(q: string): Promise<Banda[]> {
  const texto = (q ?? '').trim();
  if (texto.length < 2) return [];
  const [cuentas, fichas] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, nombre, foto')
      .eq('role', 'musician')
      .ilike('nombre', `%${texto}%`)
      .order('nombre', { ascending: true })
      .limit(MAX_BANDAS),
    supabase
      .from('artists')
      .select('id, name, image')
      .is('profile_id', null)
      .ilike('name', `%${texto}%`)
      .order('name', { ascending: true })
      .limit(MAX_BANDAS),
  ]);
  if (cuentas.error) throw cuentas.error;
  if (fichas.error) throw fichas.error;
  return juntarBandas(
    (cuentas.data ?? []).map((p: any) => bandaDeLaCuenta(p)),
    (fichas.data ?? []).map((a: any) => bandaDeFicha(a))
  );
}

/** Spec 188 — una banda sin cuenta. Sin `profile_id`: una banda con cuenta es la
 * cuenta, no una ficha. */
export async function crearFichaSuelta({
  nombre,
  contacto,
  instagram,
  creadoPor,
}: {
  nombre: string;
  contacto?: string | null;
  instagram?: string | null;
  creadoPor: string | null | undefined;
}): Promise<Banda> {
  if (!creadoPor) throw new Error('Un artista necesita quién lo registra (creadoPor)');
  const { data, error } = await supabase
    .from('artists')
    .insert({
      name: nombre.trim(),
      contacto: contacto?.trim() || null,
      instagram: instagram?.trim() || null,
      created_by: creadoPor,
    })
    .select('id, name, image')
    .single();
  if (error) throw error;
  return bandaDeFicha(data as any);
}

/** Spec 188 — filas crudas de `events` donde la cuenta es creadora, banda principal o
 * banda adicional, de la fecha más reciente a la más antigua. */
export async function eventosDeLaCuenta(musicoId: string): Promise<any[]> {
  const [propios, adicionales] = await Promise.all([
    supabase.from('events').select('*').or(`created_by.eq.${musicoId},musico_id.eq.${musicoId}`),
    supabase.from('event_artists').select('event_id').eq('musico_id', musicoId),
  ]);
  if (propios.error) throw propios.error;
  if (adicionales.error) throw adicionales.error;

  const filas: any[] = propios.data ?? [];
  const yaEstan = new Set(filas.map((e) => e.id));
  const faltan = (adicionales.data ?? [])
    .map((a: any) => a.event_id as string)
    .filter((id) => !yaEstan.has(id));

  let resto: any[] = [];
  if (faltan.length > 0) {
    const { data, error } = await supabase.from('events').select('*').in('id', faltan);
    if (error) throw error;
    resto = data ?? [];
  }
  return unirPorId(filas, resto).sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')));
}
