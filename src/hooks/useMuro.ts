import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { armarMuro, mensajeErrorMuro, MAX_ENTRADAS, type EntradaMuro } from '../lib/muro';
import type { TipoTenant } from './useTenantCrm';

type Resultado = { ok: true } | { ok: false; mensaje: string };

/** Tope de comentarios que se leen de un muro (igual que `getMuro` de la web, W-279). */
const MAX_COMENTARIOS_LEIDOS = 500;

/**
 * Spec 186 — el muro de un local (`venue`) o banda (`musician`): lo lee, comenta y borra.
 * Port de `sonopolisWeb/libs/data/muro.js` (W-279).
 *
 * Usa el cliente de la app, o sea la llave anónima más la sesión si la hay: el muro es
 * público y se lee sin sesión; quién puede comentar y borrar lo decide la base
 * (`muro_comentar` y la RLS del spec 185), no este hook.
 *
 * Un error de lectura deja `entradas: null`, no `[]`: un muro que dice «todavía no hay
 * nada» cuando no se pudo leer es peor que uno caído (misma regla que `useContactosCrm`).
 * Sin `id` no consulta y devuelve `entradas: []`.
 */
export function useMuro(tipo: TipoTenant, id: string | null | undefined): {
  entradas: EntradaMuro[] | null;   // null = todavía cargando o error de lectura
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  comentar: (destino: { publicacionId?: string; eventId?: string }, cuerpo: string) => Promise<Resultado>;
  borrarComentario: (comentarioId: string) => Promise<Resultado>;
  quitarPublicacion: (publicacionId: string) => Promise<Resultado>;
} {
  const [entradas, setEntradas] = useState<EntradaMuro[] | null>(id ? null : []);
  const [cargando, setCargando] = useState(Boolean(id));
  const [error, setError] = useState<string | null>(null);
  // Cada lectura toma un número; solo la última escribe el estado. Sin esto, la lectura
  // lenta de un muro anterior pisaría la del muro al que la persona ya navegó.
  const lectura = useRef(0);

  const recargar = useCallback(async () => {
    const turno = ++lectura.current;
    if (!id) {
      setEntradas([]);
      setCargando(false);
      setError(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const [publicaciones, eventos, comentarios] = await Promise.all([
        supabase
          .from('muro_publicaciones')
          .select('*')
          .eq('tenant_type', tipo)
          .eq('tenant_id', id)
          .order('created_at', { ascending: false })
          .limit(MAX_ENTRADAS),
        supabase.rpc('muro_eventos_pasados', {
          p_tenant_type: tipo,
          p_tenant_id: id,
          p_limite: MAX_ENTRADAS,
        }),
        supabase
          .from('muro_comentarios')
          .select('*')
          .eq('tenant_type', tipo)
          .eq('tenant_id', id)
          .order('created_at', { ascending: true })
          .limit(MAX_COMENTARIOS_LEIDOS),
      ]);
      const fallo = publicaciones.error ?? eventos.error ?? comentarios.error;
      if (fallo) throw fallo;
      if (turno !== lectura.current) return;
      setEntradas(
        armarMuro(
          (publicaciones.data ?? []) as any[],
          (eventos.data ?? []) as any[],
          (comentarios.data ?? []) as any[]
        )
      );
    } catch (e: any) {
      if (turno !== lectura.current) return;
      console.error('[useMuro] no se pudo leer el muro:', e?.message ?? e);
      setEntradas(null);
      setError('No se pudo cargar el muro. Intenta de nuevo.');
    } finally {
      if (turno === lectura.current) setCargando(false);
    }
  }, [tipo, id]);

  useEffect(() => {
    // Al cambiar de muro se suelta la lista anterior: si no, se vería el muro de otro
    // local o banda mientras llega el nuevo. `recargar` no la borra, así que comentar
    // o borrar no vacía la pantalla mientras se relee.
    setEntradas(id ? null : []);
    recargar();
  }, [id, recargar]);

  const comentar = useCallback(
    async (destino: { publicacionId?: string; eventId?: string }, cuerpo: string): Promise<Resultado> => {
      if (!id) return { ok: false, mensaje: mensajeErrorMuro(null) };
      try {
        const { error: err } = await supabase.rpc('muro_comentar', {
          p_tenant_type: tipo,
          p_tenant_id: id,
          p_publicacion_id: destino.publicacionId ?? null,
          p_event_id: destino.eventId ?? null,
          p_cuerpo: cuerpo,
        });
        if (err) return { ok: false, mensaje: mensajeErrorMuro(err) };
      } catch (e: any) {
        return { ok: false, mensaje: mensajeErrorMuro(e) };
      }
      await recargar();
      return { ok: true };
    },
    [tipo, id, recargar]
  );

  /** Borra por `id` y pide de vuelta las filas borradas: la RLS no devuelve error cuando
   * no deja borrar, simplemente no borra ninguna fila. */
  const borrarFila = useCallback(
    async (tabla: 'muro_comentarios' | 'muro_publicaciones', filaId: string, sinPermiso: string): Promise<Resultado> => {
      try {
        const { data, error: err } = await supabase.from(tabla).delete().eq('id', filaId).select('id');
        if (err) {
          console.error(`[useMuro] no se pudo borrar de ${tabla}:`, err.message);
          return { ok: false, mensaje: sinPermiso };
        }
        if (!data || data.length === 0) return { ok: false, mensaje: sinPermiso };
      } catch (e: any) {
        console.error(`[useMuro] no se pudo borrar de ${tabla}:`, e?.message ?? e);
        return { ok: false, mensaje: sinPermiso };
      }
      await recargar();
      return { ok: true };
    },
    [recargar]
  );

  const borrarComentario = useCallback(
    (comentarioId: string) => borrarFila('muro_comentarios', comentarioId, 'No puedes borrar este comentario.'),
    [borrarFila]
  );

  const quitarPublicacion = useCallback(
    (publicacionId: string) => borrarFila('muro_publicaciones', publicacionId, 'No puedes quitar esta publicación.'),
    [borrarFila]
  );

  return { entradas, cargando, error, recargar, comentar, borrarComentario, quitarPublicacion };
}
