import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMusicosSeguidos, getVenuesSeguidos } from '../lib/follows';
import { PerfilMusico, VenueSeguido } from '../types';

interface SeguidosState {
  musicos: PerfilMusico[];
  venues: VenueSeguido[];
  loading: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
}

/**
 * Spec 123 — a quién sigo. Hermano de la sección «Sigues a» de
 * app/(private)/fan/page.js (W-195).
 *
 * `refrescar` existe porque seguir desde otra pantalla no avisa a esta; el
 * panel del fan lo llama al volver a tener foco (spec 124).
 */
export function useSeguidos(): SeguidosState {
  const { user } = useAuth();
  const userId = user?.id;
  const [musicos, setMusicos] = useState<PerfilMusico[]>([]);
  const [venues, setVenues] = useState<VenueSeguido[]>([]);
  const [loading, setLoading] = useState(userId !== undefined);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) {
      setMusicos([]);
      setVenues([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [m, v] = await Promise.all([getMusicosSeguidos(userId), getVenuesSeguidos(userId)]);
      // W-194: un músico que nunca completó el perfil saldría en blanco.
      setMusicos(m.filter((p) => (p.nombre ?? '').trim() !== ''));
      setVenues(v);
    } catch (err: any) {
      console.error('[useSeguidos]', err);
      setMusicos([]);
      setVenues([]);
      setError(err?.message ?? 'No se pudo cargar a quién sigues');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { musicos, venues, loading, error, refrescar: cargar };
}
