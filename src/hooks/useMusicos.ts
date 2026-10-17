import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { mapProfileFromDB } from '../lib/profiles';
import { PerfilMusico } from '../types';

interface MusicosState {
  musicos: PerfilMusico[];
  loading: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
}

interface PerfilMusicoState {
  musico: PerfilMusico | null;
  loading: boolean;
  error: string | null;
}

/**
 * Spec 121 — músicos reales desde `profiles`. Hermano de getMusicos en
 * libs/data/profiles.js de la web (W-040, W-206).
 *
 * `pais` es opcional a propósito: el directorio lo pasa siempre; quien busca
 * músicos por id (seguidos, solicitudes) no, porque filtrar escondería a un
 * músico de otro país. Sin mock de respaldo: si Supabase falla, lista vacía y
 * el error a la vista.
 */
export function useMusicos(opciones?: { pais?: string }): MusicosState {
  // El string y no el objeto: un objeto literal nuevo en cada render volvería
  // a consultar en cada render.
  const pais = opciones?.pais;
  const [musicos, setMusicos] = useState<PerfilMusico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase.from('profiles').select('*').eq('role', 'musician');
    if (pais) q = q.eq('pais', pais);
    const { data, error: err } = await q.order('nombre', { ascending: true });
    if (err) {
      console.error('[useMusicos]', err);
      setMusicos([]);
      setError(err.message ?? 'No se pudieron cargar los músicos');
      setLoading(false);
      return;
    }
    // W-194: quien eligió rol músico y nunca completó el perfil saldría como
    // tarjeta en blanco.
    setMusicos(
      (data ?? []).map(mapProfileFromDB).filter((m) => (m.nombre ?? '').trim() !== ''),
    );
    setLoading(false);
  }, [pais]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { musicos, loading, error, refrescar: cargar };
}

/**
 * Spec 121 — perfil público de un músico. Hermano de getPerfilMusico de la
 * web. RLS (spec 020) solo deja ver a terceros filas con role = 'musician':
 * `musico = null` significa «no existe o no es visible» y el hook no intenta
 * distinguirlos.
 */
export function usePerfilMusico(id: string | null): PerfilMusicoState {
  const [musico, setMusico] = useState<PerfilMusico | null>(null);
  const [loading, setLoading] = useState(id !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) {
      setMusico(null);
      setError(null);
      setLoading(false);
      return;
    }
    let vigente = true;
    setLoading(true);
    setError(null);
    supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!vigente) return;
        if (err) {
          console.error('[usePerfilMusico]', err);
          setMusico(null);
          setError(err.message ?? 'No se pudo cargar el perfil');
        } else {
          setMusico(data ? mapProfileFromDB(data) : null);
        }
        setLoading(false);
      });
    // Si cambia el id antes de que llegue la respuesta, la vieja se descarta.
    return () => {
      vigente = false;
    };
  }, [id]);

  return { musico, loading, error };
}
