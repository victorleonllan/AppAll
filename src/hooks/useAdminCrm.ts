import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { esPro } from '../lib/pro';
import type { TipoTenant } from '../lib/adminPro';

export interface TenantCrm {
  type: TipoTenant; id: string; nombre: string; pais: string | null;
  proHasta: string | null; esPro: boolean;
  contactos: number; compradores: number; conWhatsapp: number; eventosActivos: number;
}
export interface ReglasTenant { musicosIds: Set<string>; perfilPorArtista: Map<string, string> }
export interface EventoDeTenant {
  id: string; artista: string; venueName: string | null; fecha: string; comienzaAt: string | null;
  cerradoAt: string | null; status: string; createdBy: string | null; venueId: string | null; artistId: string | null;
}

/**
 * A quién pertenece un evento: músico creador → local → artista reclamado.
 * Copia literal de `sonopolisWeb/libs/data/adminCrm.js:21-28`. Depende de la
 * definición de la vista `crm_contactos` (W-184): si esta difiriera, el admin
 * contaría eventos de un tenant cuyos compradores están en el CRM de otro.
 * Cuatro definiciones de una regla: pendiente #34 de la web.
 */
export function tenantDeEvento(
  evento: EventoDeTenant,
  { musicosIds, perfilPorArtista }: ReglasTenant
): { type: TipoTenant; id: string } | null {
  if (evento.createdBy && musicosIds.has(evento.createdBy)) {
    return { type: 'musician', id: evento.createdBy };
  }
  if (evento.venueId) return { type: 'venue', id: evento.venueId };
  const perfil = evento.artistId ? perfilPorArtista.get(evento.artistId) : null;
  return perfil ? { type: 'musician', id: perfil } : null;
}

/** Copia de `esActivo` (`adminCrm.js:31-34`): próximo (o sin fecha), sin cerrar y no cancelado. */
export function esEventoActivo(evento: EventoDeTenant, ahora: number): boolean {
  const proximo = !evento.comienzaAt || new Date(evento.comienzaAt).getTime() >= ahora;
  return proximo && !evento.cerradoAt && evento.status !== 'cancelled';
}

/**
 * Todos los eventos y lo que `tenantDeEvento` necesita. Los músicos son TODOS los
 * perfiles `role = 'musician'`, también los sin nombre: la vista SQL mira solo el
 * rol (`adminCrm.js:36-47`).
 */
export async function cargarEventosYReglas(): Promise<{ eventos: EventoDeTenant[]; reglas: ReglasTenant }> {
  const [ev, mus, art] = await Promise.all([
    supabase
      .from('events')
      .select('id, artist_name, venue_name, fecha, comienza_at, closed_at, status, created_by, venue_id, artist_id')
      .order('comienza_at', { ascending: true, nullsFirst: false }),
    supabase.from('profiles').select('id').eq('role', 'musician'),
    supabase.from('artists').select('id, profile_id'),
  ]);
  if (ev.error) throw ev.error;
  if (mus.error) throw mus.error;
  if (art.error) throw art.error;

  const eventos: EventoDeTenant[] = ((ev.data ?? []) as any[]).map((db) => ({
    id: db.id,
    artista: db.artist_name ?? '',
    venueName: db.venue_name ?? null,
    fecha: db.fecha,
    comienzaAt: db.comienza_at ?? null,
    cerradoAt: db.closed_at ?? null,
    status: db.status,
    createdBy: db.created_by ?? null,
    venueId: db.venue_id ?? null,
    artistId: db.artist_id ?? null,
  }));
  return {
    eventos,
    reglas: {
      musicosIds: new Set(((mus.data ?? []) as any[]).map((m) => m.id)),
      perfilPorArtista: new Map(
        ((art.data ?? []) as any[]).filter((a) => a.profile_id).map((a) => [a.id, a.profile_id])
      ),
    },
  };
}

interface AdminCrmState {
  cargando: boolean;
  error: string | null;
  bandas: TenantCrm[];
  locales: TenantCrm[];
  totalContactos: number;
  recargar: () => Promise<void>;
}

/**
 * Spec 153 — lo mismo que `/admin/crm` de la web (`getTenantsConCrm`,
 * `adminCrm.js:76-124`). Una sola lectura de la vista, agrupada en el teléfono:
 * son cientos de filas, y una consulta por tenant serían decenas de viajes.
 * Incluye a los que tienen 0 contactos: un CRM vacío también es un dato.
 *
 * Un error deja el mensaje en `error` y conserva la lista anterior (spec 115).
 */
export function useAdminCrm(): AdminCrmState {
  const [bandas, setBandas] = useState<TenantCrm[]>([]);
  const [locales, setLocales] = useState<TenantCrm[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [{ eventos, reglas }, perfiles, venues, filas] = await Promise.all([
        cargarEventosYReglas(),
        supabase.from('profiles').select('id, nombre, pais, sonopolis_pro_hasta').eq('role', 'musician'),
        supabase.from('venues').select('id, name, pais, sonopolis_pro_hasta').order('name'),
        supabase.from('crm_contactos').select('tenant_type, tenant_id, origenes, acepta_whatsapp'),
      ]);
      if (perfiles.error) throw perfiles.error;
      if (venues.error) throw venues.error;
      if (filas.error) throw filas.error;

      const clave = (type: string, id: string) => `${type}:${id}`;

      const contactosPor = new Map<string, { contactos: number; compradores: number; conWhatsapp: number }>();
      for (const c of (filas.data ?? []) as any[]) {
        const k = clave(c.tenant_type, c.tenant_id);
        const r = contactosPor.get(k) ?? { contactos: 0, compradores: 0, conWhatsapp: 0 };
        r.contactos += 1;
        if ((c.origenes ?? []).includes('comprador')) r.compradores += 1;
        if (c.acepta_whatsapp) r.conWhatsapp += 1;
        contactosPor.set(k, r);
      }

      const ahora = Date.now();
      const activosPor = new Map<string, number>();
      for (const e of eventos) {
        if (!esEventoActivo(e, ahora)) continue;
        const t = tenantDeEvento(e, reglas);
        if (!t) continue;
        const k = clave(t.type, t.id);
        activosPor.set(k, (activosPor.get(k) ?? 0) + 1);
      }

      const fila = (type: TipoTenant, db: any, nombre: string | null): TenantCrm => {
        const k = clave(type, db.id);
        const r = contactosPor.get(k) ?? { contactos: 0, compradores: 0, conWhatsapp: 0 };
        const proHasta: string | null = db.sonopolis_pro_hasta ?? null;
        return {
          type,
          id: db.id,
          nombre: nombre || '(sin nombre)',
          pais: db.pais ?? null,
          proHasta,
          esPro: esPro({ sonopolisProHasta: proHasta }),
          ...r,
          eventosActivos: activosPor.get(k) ?? 0,
        };
      };

      const orden = (a: TenantCrm, b: TenantCrm) =>
        b.contactos - a.contactos || a.nombre.localeCompare(b.nombre, 'es');

      setBandas(((perfiles.data ?? []) as any[]).map((p) => fila('musician', p, p.nombre)).sort(orden));
      setLocales(((venues.data ?? []) as any[]).map((v) => fila('venue', v, v.name)).sort(orden));
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cargar el CRM');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const totalContactos = [...bandas, ...locales].reduce((suma, t) => suma + t.contactos, 0);

  return { cargando, error, bandas, locales, totalContactos, recargar };
}
