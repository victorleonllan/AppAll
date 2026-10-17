import { supabase } from './supabase';

/**
 * Spec 135 — `events.artist_id` apunta a `artists(id)` desde el spec 061, no a
 * `profiles`. Buscar con `search_collaborator_candidates` (que devuelve ids de
 * `profiles`) y mandar ese id como `artist_id` viola la FK (Postgres 23503). Port de
 * sonopolisWeb/libs/data/artists.js. El trigger `events_claim_owner` resuelve el
 * músico detrás del artista, así que usar `artists` no pierde el «entra al equipo».
 */

export interface ArtistaBreve {
  id: string;
  nombre: string;
}

/** Menos de 2 caracteres no busca: evita traer la tabla entera con cada tecla. */
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
 * `auth.uid() = created_by` (spec 061). */
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
