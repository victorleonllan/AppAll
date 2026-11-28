// Spec 192 — lectura y guardado del punto de la portada. El único lugar que escribe
// `portada_x`/`portada_y`: ni `mapProfileToDB` ni `updateVenue` los mandan, para que el
// trigger de W-344 pueda volver el punto al centro cuando cambia la foto.

import { PUNTO_CENTRO, PuntoPortada, normalizarPunto, puntoDeFila } from './portada';
import { supabase } from './supabase';

const COLUMNAS = 'portada_x, portada_y';

/** Existe porque el `Venue` de `VenuesContext` no trae el punto. */
export async function leerPuntoPortadaLocal(venueId: string): Promise<PuntoPortada> {
  const { data, error } = await supabase
    .from('venues')
    .select(COLUMNAS)
    .eq('id', venueId)
    .maybeSingle();
  if (error) throw error;
  return data ? puntoDeFila(data) : PUNTO_CENTRO;
}

async function guardarPunto(
  tabla: 'profiles' | 'venues',
  id: string,
  punto: PuntoPortada,
): Promise<PuntoPortada> {
  const { x, y } = normalizarPunto(punto);
  const { data, error } = await supabase
    .from(tabla)
    .update({ portada_x: x, portada_y: y })
    .eq('id', id)
    .select(COLUMNAS)
    .single();
  if (error) {
    // Un update que RLS filtra no falla por sí solo: `.single()` lo delata con cero filas.
    if (error.code === 'PGRST116') {
      throw new Error('Solo el dueño puede ajustar esta portada.');
    }
    throw error;
  }
  return puntoDeFila(data);
}

export async function guardarPuntoPortadaMusico(
  userId: string,
  punto: PuntoPortada,
): Promise<PuntoPortada> {
  return guardarPunto('profiles', userId, punto);
}

export async function guardarPuntoPortadaLocal(
  venueId: string,
  punto: PuntoPortada,
): Promise<PuntoPortada> {
  return guardarPunto('venues', venueId, punto);
}
