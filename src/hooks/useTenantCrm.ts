import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { Evento } from '../types';

export type TipoTenant = 'venue' | 'musician';

export interface TenantCrm {
  tipo: TipoTenant;
  id: string;
  nombre: string;
  sonopolisProHasta: string | null;   // se pasa tal cual a esPro() del spec 148
}

/**
 * Spec 149 — el CRM propio. Port de `getTenantPropio`
 * (`sonopolisWeb/libs/data/crmCorreo.js:19-32`): el local del dueño, o el perfil
 * propio si su `role` es `musician`. Sin sesión → `null`.
 */
export function useTenantPropio(tipo: TipoTenant): {
  tenant: TenantCrm | null; cargando: boolean; error: string | null;
} {
  const { user } = useAuth();
  const userId = user?.id;
  const { allVenues, loading: cargandoVenues } = useVenues();
  const [perfil, setPerfil] = useState<TenantCrm | null>(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(tipo === 'musician' && Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tipo !== 'musician' || !userId) {
      setPerfil(null);
      setCargandoPerfil(false);
      setError(null);
      return;
    }
    let vigente = true;
    setCargandoPerfil(true);
    setError(null);
    supabase
      .from('profiles')
      .select('id, role, nombre, sonopolis_pro_hasta')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!vigente) return;
        if (err) {
          setPerfil(null);
          setError(err.message ?? 'No se pudo leer tu perfil');
        } else if ((data as any)?.role !== 'musician') {
          setPerfil(null);
        } else {
          const d: any = data;
          setPerfil({
            tipo: 'musician',
            id: d.id,
            nombre: d.nombre || 'Tu banda',
            sonopolisProHasta: d.sonopolis_pro_hasta ?? null,
          });
        }
        setCargandoPerfil(false);
      });
    return () => {
      vigente = false;
    };
  }, [tipo, userId]);

  if (tipo === 'venue') {
    if (!userId) return { tenant: null, cargando: false, error: null };
    // Mismo criterio que DashboardLocalScreen.tsx:56.
    const venue = allVenues.find((v) => v.ownerId === userId);
    return {
      tenant: venue
        ? { tipo: 'venue', id: venue.id, nombre: venue.name, sonopolisProHasta: venue.sonopolisProHasta ?? null }
        : null,
      cargando: cargandoVenues,
      error: null,
    };
  }
  return { tenant: perfil, cargando: cargandoPerfil, error };
}

/** Perfil por id → tenant musician. `exigirMusico` distingue el paso 1 (creador) del
 * paso 3 (artista vinculado), que la web resuelve con `getPerfilMusico` sin mirar `role`. */
async function tenantDePerfil(
  profileId: string,
  nombreRespaldo: string,
  exigirMusico: boolean
): Promise<TenantCrm | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, nombre, sonopolis_pro_hasta')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  const d: any = data;
  if (!d) return null;
  if (exigirMusico && d.role !== 'musician') return null;
  return {
    tipo: 'musician',
    id: d.id,
    nombre: d.nombre ?? nombreRespaldo,
    sonopolisProHasta: d.sonopolis_pro_hasta ?? null,
  };
}

/**
 * Spec 149 — a quién pertenece el contacto que se capta en un evento y a nombre de
 * quién se avisa. Port de `getTenantDelEvento` (`sonopolisWeb/libs/data/whatsapp.js:31-69`),
 * misma regla que la CTE `eventos_tenant` de la vista `crm_contactos` (W-184): si la
 * app usara otra, el opt-in de la compra caería en una lista y el aviso saldría de otra.
 *
 * `events.artist_id` apunta a `artists` (spec 061), no a `profiles` como dice el
 * comentario viejo de `Evento.artistId`: el perfil se alcanza por `artists.profile_id`.
 */
async function resolverTenantDelEvento(evento: Evento): Promise<TenantCrm | null> {
  // 1. Creador músico. Para un tercero la RLS de profiles (spec 020) solo deja ver
  // filas musician: un creador que no es músico vuelve null y se sigue.
  if (evento.createdBy) {
    const creador = await tenantDePerfil(evento.createdBy, evento.artista, true);
    if (creador) return creador;
  }

  // 2. El local, leído de la base y no de VenuesContext: el Pro es el de la fila
  // recién leída, como hace la web antes de dejar avisar.
  if (evento.venueId) {
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, sonopolis_pro_hasta')
      .eq('id', evento.venueId)
      .maybeSingle();
    if (error) throw error;
    const v: any = data;
    return v
      ? { tipo: 'venue', id: v.id, nombre: v.name, sonopolisProHasta: v.sonopolis_pro_hasta ?? null }
      : null;
  }

  // 3. Artista vinculado y reclamado.
  if (evento.artistId) {
    const { data, error } = await supabase
      .from('artists')
      .select('profile_id')
      .eq('id', evento.artistId)
      .maybeSingle();
    if (error) throw error;
    const profileId = (data as any)?.profile_id;
    if (!profileId) return null;
    return tenantDePerfil(profileId, evento.artista, false);
  }

  return null;
}

export function useTenantDelEvento(evento: Evento | null | undefined): {
  tenant: TenantCrm | null; cargando: boolean;
} {
  const [tenant, setTenant] = useState<TenantCrm | null>(null);
  const [cargando, setCargando] = useState(Boolean(evento));

  const eventoId = evento?.id;
  const createdBy = evento?.createdBy;
  const venueId = evento?.venueId;
  const artistId = evento?.artistId;

  useEffect(() => {
    if (!evento) {
      setTenant(null);
      setCargando(false);
      return;
    }
    let vigente = true;
    setCargando(true);
    resolverTenantDelEvento(evento)
      .then((t) => {
        if (vigente) setTenant(t);
      })
      .catch((e: any) => {
        // Sin tenant no se ofrece opt-in ni aviso. Sin datos personales en el log.
        console.error('[useTenantDelEvento] no se pudo resolver el tenant:', e?.message ?? e);
        if (vigente) setTenant(null);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
    // Solo los campos que deciden el tenant: `evento` es un objeto nuevo en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoId, createdBy, venueId, artistId]);

  return { tenant, cargando };
}
