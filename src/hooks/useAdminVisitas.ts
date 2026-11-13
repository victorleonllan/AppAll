import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  ClavePeriodo,
  desdeDePeriodo,
  mapVisitante,
  mapVisitasPais,
  Visitante,
  VisitasPais,
} from '../lib/visitas';

interface AdminVisitasState {
  cargando: boolean;
  error: string | null;
  porPais: VisitasPais[];
  visitantes: Visitante[];
  recargar: () => void;
}

/**
 * Spec 171 — lo mismo que `/admin/visitas` de la web: visitas por cartelera de país y
 * cada visitante del período. Llama las RPC `admin_visitas_por_pais` (W-261) y
 * `admin_visitantes` (W-267) con la sesión del admin; las dos se defienden solas con
 * `es_admin_sonopolis()`, así que a otra cuenta le devuelven el error «solo admin».
 *
 * Un error deja el mensaje en `error` y conserva las listas de la carga anterior
 * (spec 115). Cada carga lleva un número y solo la última escribe estado: si el admin
 * cambia de período rápido, una respuesta vieja no pisa la nueva (Decisión 7).
 */
export function useAdminVisitas(periodo: ClavePeriodo): AdminVisitasState {
  const [porPais, setPorPais] = useState<VisitasPais[]>([]);
  const [visitantes, setVisitantes] = useState<Visitante[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ultimaCarga = useRef(0);

  const cargar = useCallback(async () => {
    const numero = ++ultimaCarga.current;
    setCargando(true);
    setError(null);
    const p_desde = desdeDePeriodo(periodo).toISOString();
    try {
      const [rPais, rVisitantes] = await Promise.all([
        supabase.rpc('admin_visitas_por_pais', { p_desde }),
        supabase.rpc('admin_visitantes', { p_desde }),
      ]);
      if (rPais.error) throw rPais.error;
      if (rVisitantes.error) throw rVisitantes.error;
      if (numero !== ultimaCarga.current) return;
      setPorPais(((rPais.data ?? []) as any[]).map(mapVisitasPais));
      setVisitantes(((rVisitantes.data ?? []) as any[]).map(mapVisitante));
    } catch (e: any) {
      if (numero !== ultimaCarga.current) return;
      setError(e?.message ?? 'No se pudieron cargar las visitas');
    } finally {
      if (numero === ultimaCarga.current) setCargando(false);
    }
  }, [periodo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const recargar = useCallback(() => {
    cargar();
  }, [cargar]);

  return { cargando, error, porPais, visitantes, recargar };
}
