import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { bandaDeFicha, bandaDeLaCuenta } from '../lib/cuentaEsBanda';
import { filasDeAdicionales } from '../lib/lineup';
import type { Banda, Evento } from '../types';

type EventoLineup = Pick<Evento, 'id' | 'musicoId' | 'artistId'>;

/** La banda principal (`orden` 0). `null` si el evento no la tiene o su fila no se ve. */
async function getPrincipal(
  musicoId: string | null | undefined,
  artistId: string | null | undefined
): Promise<Banda | null> {
  if (musicoId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nombre, foto')
      .eq('id', musicoId)
      .maybeSingle();
    if (error) throw error;
    return data ? { ...bandaDeLaCuenta(data as any), orden: 0 } : null;
  }
  if (artistId) {
    const { data, error } = await supabase
      .from('artists')
      .select('id, name, image')
      .eq('id', artistId)
      .maybeSingle();
    if (error) throw error;
    return data ? { ...bandaDeFicha(data as any), orden: 0 } : null;
  }
  return null;
}

/** Las bandas de `event_artists`, en su orden. Una fila sin cuenta ni ficha visible (RLS o
 * borrada) se salta. */
async function getAdicionales(eventId: string): Promise<Banda[]> {
  const { data, error } = await supabase
    .from('event_artists')
    .select('orden, artists(id, name, image), cuenta:musico_id(id, nombre, foto)')
    .eq('event_id', eventId)
    .order('orden', { ascending: true });
  if (error) throw error;
  const out: Banda[] = [];
  for (const fila of (data ?? []) as any[]) {
    if (fila.cuenta) out.push({ ...bandaDeLaCuenta(fila.cuenta), orden: fila.orden });
    else if (fila.artists) out.push({ ...bandaDeFicha(fila.artists), orden: fila.orden });
  }
  return out;
}

/** Spec 189 — principal (orden 0) + adicionales en su orden, cada una como cuenta o ficha.
 * Port de `getBandasDelEvento` de `sonopolisWeb/libs/data/lineup.js`. */
export async function getBandasDelEvento(evento: EventoLineup): Promise<Banda[]> {
  const [principal, adicionales] = await Promise.all([
    getPrincipal(evento.musicoId, evento.artistId),
    getAdicionales(evento.id),
  ]);
  return principal ? [principal, ...adicionales] : adicionales;
}

/** Guarda las adicionales de un evento recién creado. Va DESPUÉS de `createEvento`: la policy
 * de `event_artists` exige `can_edit_event`, que no existe hasta que corre `events_claim_owner`.
 * Sin filas no consulta. Lanza el error de la base tal cual (p. ej. «esa banda ya es la
 * principal del evento»). */
export async function agregarBandasAdicionales(
  eventId: string,
  principal: Banda | null,
  adicionales: Banda[]
): Promise<void> {
  const filas = filasDeAdicionales(principal, adicionales);
  if (filas.length === 0) return;
  const { error } = await supabase.from('event_artists').insert(
    filas.map((fila) => ({
      event_id: eventId,
      orden: fila.orden,
      ...('musicoId' in fila ? { musico_id: fila.musicoId } : { artist_id: fila.artistId }),
    }))
  );
  if (error) throw error;
}

/**
 * Spec 189 — el lineup de un evento. Usa el cliente de la app (llave anónima más la sesión
 * si la hay).
 *
 * Un error de lectura deja `bandas: null`, no `[]` (misma regla que `useMuro`). Sin evento
 * no consulta y devuelve `bandas: []`.
 */
export function useBandasDelEvento(evento: EventoLineup | null | undefined): {
  bandas: Banda[] | null;   // null = cargando o error de lectura
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
} {
  // Se depende de los tres campos y no de `evento`, que es un objeto nuevo en cada render.
  const id = evento?.id;
  const musicoId = evento?.musicoId;
  const artistId = evento?.artistId;
  const [bandas, setBandas] = useState<Banda[] | null>(id ? null : []);
  const [cargando, setCargando] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);
  // Cada lectura toma un número; solo la última escribe el estado. Así la respuesta lenta
  // de un evento anterior no pisa la del evento actual.
  const lectura = useRef(0);

  const recargar = useCallback(async () => {
    const turno = ++lectura.current;
    if (!id) {
      setBandas([]);
      setCargando(false);
      setError(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const leidas = await getBandasDelEvento({ id, musicoId, artistId });
      if (turno !== lectura.current) return;
      setBandas(leidas);
    } catch (e: any) {
      if (turno !== lectura.current) return;
      const mensaje = e?.message ?? String(e);
      console.error('[useBandasDelEvento] no se pudo leer el lineup:', mensaje);
      setBandas(null);
      setError(mensaje);
    } finally {
      if (turno === lectura.current) setCargando(false);
    }
  }, [id, musicoId, artistId]);

  useEffect(() => {
    // Al cambiar de evento se suelta la lista anterior; `recargar` no la borra.
    setBandas(id ? null : []);
    recargar();
  }, [id, recargar]);

  return { bandas, cargando, error, recargar };
}
