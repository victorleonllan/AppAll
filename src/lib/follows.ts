import { PerfilMusico, TipoSeguible, VenueSeguido } from '../types';
import { mapProfileFromDB } from './profiles';
import { supabase } from './supabase';

/**
 * Spec 123 — seguir músicos y locales (`follows_musicians`, `follows_venues`,
 * spec 047). Hermano de libs/data/follows.js de la web (W-098, W-195).
 *
 * El `userId` va explícito, igual que en la web: la RLS solo deja leer y
 * escribir filas con `follower_id = auth.uid()`, pero la base no lo infiere
 * en el INSERT, y los hooks ya tienen `user` de `useAuth()`.
 */
const TABLA = {
  musico: { tabla: 'follows_musicians', columna: 'musician_id' },
  venue: { tabla: 'follows_venues', columna: 'venue_id' },
} as const;

export async function sigoA(tipo: TipoSeguible, userId: string, targetId: string): Promise<boolean> {
  const { tabla, columna } = TABLA[tipo];
  const { data, error } = await supabase
    .from(tabla)
    .select(columna)
    .eq('follower_id', userId)
    .eq(columna, targetId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function seguir(tipo: TipoSeguible, userId: string, targetId: string): Promise<void> {
  const { tabla, columna } = TABLA[tipo];
  const { error } = await supabase.from(tabla).insert({ follower_id: userId, [columna]: targetId });
  // 23505: ya lo seguía (dos toques rápidos, dos pantallas abiertas), que es
  // justo el estado pedido.
  if (error && error.code !== '23505') throw error;
}

export async function dejarDeSeguir(tipo: TipoSeguible, userId: string, targetId: string): Promise<void> {
  const { tabla, columna } = TABLA[tipo];
  // Borrar una fila que no existe no es error: el estado pedido ya se cumple.
  const { error } = await supabase.from(tabla).delete().eq('follower_id', userId).eq(columna, targetId);
  if (error) throw error;
}

export async function getIdsSeguidos(tipo: TipoSeguible, userId: string): Promise<string[]> {
  const { tabla, columna } = TABLA[tipo];
  const { data, error } = await supabase.from(tabla).select(columna).eq('follower_id', userId);
  if (error) throw error;
  return ((data ?? []) as any[]).map((fila) => fila[columna] as string);
}

export async function getMusicosSeguidos(userId: string): Promise<PerfilMusico[]> {
  const ids = await getIdsSeguidos('musico', userId);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('profiles').select('*').in('id', ids);
  if (error) throw error;
  return (data ?? []).map(mapProfileFromDB);
}

export async function getVenuesSeguidos(userId: string): Promise<VenueSeguido[]> {
  const ids = await getIdsSeguidos('venue', userId);
  if (ids.length === 0) return [];
  // Sin mapVenueFromDB: es privado de VenuesContext.tsx, que tocan otros specs.
  // Estas cinco columnas se llaman igual en la tabla y en el tipo `Venue`.
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, type, comuna, image')
    .in('id', ids);
  if (error) throw error;
  return (data ?? []) as VenueSeguido[];
}
