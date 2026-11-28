import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { esPro } from '../lib/pro';
import { tenantsDeEvento } from '../lib/cuentaEsBanda';
import type { TipoTenant } from '../lib/adminPro';

export interface TenantCrm {
  type: TipoTenant; id: string; nombre: string; pais: string | null;
  proHasta: string | null; esPro: boolean;
  contactos: number; compradores: number; conWhatsapp: number; eventosActivos: number;
}
export interface ReglasTenant { musicosIds: Set<string>; adicionalesPorEvento: Map<string, string[]> }
export interface EventoDeTenant {
  id: string; artista: string; venueName: string | null; fecha: string; comienzaAt: string | null;
  cerradoAt: string | null; status: string; createdBy: string | null; venueId: string | null; artistId: string | null;
  musicoId: string | null;
}

/** Copia de `esActivo` (`adminCrm.js:31-34`): próximo (o sin fecha), sin cerrar y no cancelado. */
export function esEventoActivo(evento: EventoDeTenant, ahora: number): boolean {
  const proximo = !evento.comienzaAt || new Date(evento.comienzaAt).getTime() >= ahora;
  return proximo && !evento.cerradoAt && evento.status !== 'cancelled';
}

/**
 * Todos los eventos y lo que `tenantsDeEvento` (spec 188) necesita. Los músicos son TODOS los
 * perfiles `role = 'musician'`, también los sin nombre: la vista SQL mira solo el
 * rol (`adminCrm.js:36-47`).
 */
export async function cargarEventosYReglas(): Promise<{ eventos: EventoDeTenant[]; reglas: ReglasTenant }> {
  const [ev, mus, adi] = await Promise.all([
    supabase
      .from('events')
      .select('id, artist_name, venue_name, fecha, comienza_at, closed_at, status, created_by, venue_id, artist_id, musico_id')
      .order('comienza_at', { ascending: true, nullsFirst: false }),
    supabase.from('profiles').select('id').eq('role', 'musician'),
    supabase.from('event_artists').select('event_id, musico_id').not('musico_id', 'is', null),
  ]);
  if (ev.error) throw ev.error;
  if (mus.error) throw mus.error;
  if (adi.error) throw adi.error;

  const adicionalesPorEvento = new Map<string, string[]>();
  for (const a of (adi.data ?? []) as any[]) {
    adicionalesPorEvento.set(a.event_id, [...(adicionalesPorEvento.get(a.event_id) ?? []), a.musico_id]);
  }

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
    musicoId: db.musico_id ?? null,
  }));
  return {
    eventos,
    reglas: {
      musicosIds: new Set(((mus.data ?? []) as any[]).map((m) => m.id)),
      adicionalesPorEvento,
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
        // Spec 188 (W-303) — cuenta para cada tenant del evento, no para un dueño único.
        for (const t of tenantsDeEvento(e, reglas)) {
          const k = clave(t.type, t.id);
          activosPor.set(k, (activosPor.get(k) ?? 0) + 1);
        }
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
