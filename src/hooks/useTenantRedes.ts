import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { supabase } from '../lib/supabase';
import { mapProfileFromDB } from '../lib/profiles';
import { esPro } from '../lib/pro';
import { PAISES } from '../constants/paises';
import type { TenantType } from '../lib/redes/api';

const ZONA_POR_DEFECTO = 'America/Santiago';

interface TenantRedes {
  estado: 'cargando' | 'sin_tenant' | 'listo';
  tenantType: TenantType | null;
  esPro: boolean;
  zonaHoraria: string;
  panelWeb: 'local' | 'musico' | null;
  /** Falló la lectura del perfil del músico: no es lo mismo que no tener tenant. */
  error: string | null;
}

interface Tenant {
  pais?: string | null;
  sonopolisProHasta?: string | null;
}

function zonaDe(tenant: Tenant | null): string {
  return (tenant?.pais && PAISES[tenant.pais]?.zonaHoraria) || ZONA_POR_DEFECTO;
}

/**
 * Spec 150 — de qué local o banda se publica en redes, el mismo criterio que la web
 * (`libs/data/crmCorreo.js`): el local cuyo dueño es el usuario, o su propio perfil si
 * es músico. `esPro` se calcula en el cliente para decidir qué pantalla mostrar sin
 * pedir nada a la web; el servidor lo vuelve a exigir (402).
 *
 * No reusa `useTenantPropio` (spec 149): su tenant no trae `pais`, que acá hace falta
 * para programar en la hora del local o banda.
 */
export function useTenantRedes(): TenantRedes {
  const { user, role, loading: cargandoSesion } = useAuth();
  const { allVenues, loading: cargandoLocales } = useVenues();
  const userId = user?.id ?? null;

  const [perfil, setPerfil] = useState<Tenant | null>(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPerfil(null);
    setError(null);
    if (role !== 'musician' || !userId) {
      setCargandoPerfil(false);
      return;
    }
    // Una respuesta que llega después de cambiar de cuenta no pisa la nueva.
    let vigente = true;
    setCargandoPerfil(true);
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!vigente) return;
        if (err) setError(err.message);
        else setPerfil(data ? mapProfileFromDB(data) : null);
        setCargandoPerfil(false);
      });
    return () => {
      vigente = false;
    };
  }, [role, userId]);

  const vacio = { tenantType: null, esPro: false, zonaHoraria: ZONA_POR_DEFECTO, panelWeb: null };

  if (cargandoSesion) return { estado: 'cargando', ...vacio, error: null };
  if (!userId) return { estado: 'sin_tenant', ...vacio, error: null };

  if (role === 'local') {
    if (cargandoLocales) return { estado: 'cargando', ...vacio, error: null };
    const local = allVenues.find((v) => v.ownerId === userId) ?? null;
    if (!local) return { estado: 'sin_tenant', ...vacio, error: null };
    return {
      estado: 'listo',
      tenantType: 'venue',
      esPro: esPro(local),
      zonaHoraria: zonaDe(local),
      panelWeb: 'local',
      error: null,
    };
  }

  if (role === 'musician') {
    if (cargandoPerfil) return { estado: 'cargando', ...vacio, error: null };
    if (!perfil) return { estado: 'sin_tenant', ...vacio, error };
    return {
      estado: 'listo',
      tenantType: 'musician',
      esPro: esPro(perfil),
      zonaHoraria: zonaDe(perfil),
      panelWeb: 'musico',
      error: null,
    };
  }

  return { estado: 'sin_tenant', ...vacio, error: null };
}
