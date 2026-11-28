import { argsPrincipal, type BandaRef, type TipoBanda } from './bandas';
import { supabase } from './supabase';

/**
 * Spec 197 — lecturas y escrituras del admin de Sonópolis sobre cuentas de músico, fichas
 * de banda y eventos. Port de sonopolisWeb/libs/data/adminEdicion.js (W-348) y
 * libs/data/lineup.js (W-354). Todo corre con la sesión del admin: quién puede lo decide
 * Postgres, y sus errores ya vienen en español, así que se relanzan tal cual.
 */

export interface CuentaMusicoAdmin {
  id: string;
  nombre: string;
  ciudad: string | null;
  eventos: number;
}

export interface FichaSueltaAdmin {
  id: string;
  name: string;
  genero: string | null;
  comuna: string | null;
  contacto: string | null;
  instagram: string | null;
  createdBy: string | null;
  eventos: number;
  primerLocal: string | null; // venue_name del primer evento, para «Creada en un evento de X»
}

export interface EventoDeFicha {
  id: string;
  nombre: string;
  fecha: string | null;
  comienzaAt: string | null;
  local: string | null;
  principal: boolean;
}

export interface BandaEncontrada extends BandaRef {
  nombre: string;
}

export interface BandaDelEvento extends BandaRef {
  nombre: string;
  orden: number;
}

const LIMITE = 50;
const LIMITE_BUSCADOR = 8;
const COLUMNAS_FICHA = 'id, name, genero, comuna, contacto, instagram, created_by';

/** `%`, `_` y `\` del texto escrito se buscan como letras, no como comodines. */
function patron(q: string | undefined): string | null {
  const t = (q ?? '').trim();
  return t ? `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
}

// ── Lecturas ─────────────────────────────────────────────────────────────

/** Eventos distintos por cuenta: principal (`events.musico_id`) o adicional. */
async function eventosDeCuentas(ids: string[]): Promise<Map<string, Set<string>>> {
  const porCuenta = new Map<string, Set<string>>();
  const [principales, adicionales] = await Promise.all([
    supabase.from('events').select('id, musico_id').in('musico_id', ids),
    supabase.from('event_artists').select('event_id, musico_id').in('musico_id', ids),
  ]);
  if (principales.error) throw principales.error;
  if (adicionales.error) throw adicionales.error;
  const poner = (musicoId: string, eventId: string) => {
    if (!porCuenta.has(musicoId)) porCuenta.set(musicoId, new Set());
    porCuenta.get(musicoId)!.add(eventId);
  };
  for (const e of (principales.data ?? []) as any[]) poner(e.musico_id, e.id);
  for (const e of (adicionales.data ?? []) as any[]) poner(e.musico_id, e.event_id);
  return porCuenta;
}

export async function listarCuentasMusico(q?: string): Promise<CuentaMusicoAdmin[]> {
  let query = supabase.from('profiles').select('id, nombre, ciudad').eq('role', 'musician');
  const like = patron(q);
  if (like) query = query.ilike('nombre', like);
  const { data, error } = await query.order('nombre', { ascending: true }).limit(LIMITE);
  if (error) throw error;
  const cuentas = (data ?? []) as any[];
  if (cuentas.length === 0) return [];

  const eventos = await eventosDeCuentas(cuentas.map((c) => c.id));
  return cuentas.map((c) => ({
    id: c.id,
    nombre: c.nombre ?? '',
    ciudad: c.ciudad ?? null,
    eventos: eventos.get(c.id)?.size ?? 0,
  }));
}

/**
 * Eventos de cada ficha: principal (`events.artist_id`) o adicional (`event_artists`),
 * sin repetir. Principales primero y, dentro de cada grupo, por `comienza_at` (sin fecha
 * al final).
 */
export async function eventosDeFichas(ids: string[]): Promise<Map<string, EventoDeFicha[]>> {
  const porFicha = new Map<string, EventoDeFicha[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return porFicha;
  const [principales, adicionales] = await Promise.all([
    supabase
      .from('events')
      .select('id, artist_id, artist_name, comienza_at, fecha, venue_name')
      .in('artist_id', ids),
    supabase
      .from('event_artists')
      .select('artist_id, events(id, artist_name, comienza_at, fecha, venue_name)')
      .in('artist_id', ids),
  ]);
  if (principales.error) throw principales.error;
  if (adicionales.error) throw adicionales.error;

  const forma = (e: any, principal: boolean): EventoDeFicha => ({
    id: e.id,
    nombre: e.artist_name ?? '',
    fecha: e.fecha ?? null,
    comienzaAt: e.comienza_at ?? null,
    local: e.venue_name ?? null,
    principal,
  });
  const vistos = new Set<string>();
  for (const e of (principales.data ?? []) as any[]) {
    vistos.add(`${e.artist_id}:${e.id}`);
    porFicha.get(e.artist_id)?.push(forma(e, true));
  }
  for (const r of (adicionales.data ?? []) as any[]) {
    if (!r.events || vistos.has(`${r.artist_id}:${r.events.id}`)) continue;
    porFicha.get(r.artist_id)?.push(forma(r.events, false));
  }
  for (const lista of porFicha.values()) {
    lista.sort(
      (a, b) =>
        Number(b.principal) - Number(a.principal) ||
        (a.comienzaAt ?? '9999').localeCompare(b.comienzaAt ?? '9999'),
    );
  }
  return porFicha;
}

function aFicha(db: any, eventos: EventoDeFicha[]): FichaSueltaAdmin {
  return {
    id: db.id,
    name: db.name,
    genero: db.genero ?? null,
    comuna: db.comuna ?? null,
    contacto: db.contacto ?? null,
    instagram: db.instagram ?? null,
    createdBy: db.created_by ?? null,
    eventos: eventos.length,
    primerLocal: eventos[0]?.local ?? null,
  };
}

export async function listarFichasSueltas(q?: string): Promise<FichaSueltaAdmin[]> {
  let query = supabase.from('artists').select(COLUMNAS_FICHA).is('profile_id', null);
  const like = patron(q);
  if (like) query = query.ilike('name', like);
  const { data, error } = await query.order('name', { ascending: true }).limit(LIMITE);
  if (error) throw error;
  const fichas = (data ?? []) as any[];
  if (fichas.length === 0) return [];

  const eventos = await eventosDeFichas(fichas.map((f) => f.id));
  return fichas.map((f) => aFicha(f, eventos.get(f.id) ?? []));
}

/** `null` si la ficha ya no está suelta (la conectaron o la unieron). */
export async function fichaSueltaPorId(id: string): Promise<FichaSueltaAdmin | null> {
  const { data, error } = await supabase
    .from('artists')
    .select(COLUMNAS_FICHA)
    .eq('id', id)
    .is('profile_id', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const eventos = await eventosDeFichas([id]);
  return aFicha(data, eventos.get(id) ?? []);
}

/** Buscador del selector del admin: cuentas de músico primero, después fichas sueltas. */
export async function buscarBandasAdmin(
  q: string,
  tipos: TipoBanda[] = ['cuenta', 'ficha'],
): Promise<BandaEncontrada[]> {
  const like = patron(q);
  if (!like || q.trim().length < 2) return [];
  const vacio = Promise.resolve({ data: [] as any[], error: null });
  const [cuentas, fichas] = await Promise.all([
    tipos.includes('cuenta')
      ? supabase
          .from('profiles')
          .select('id, nombre')
          .eq('role', 'musician')
          .ilike('nombre', like)
          .order('nombre', { ascending: true })
          .limit(LIMITE_BUSCADOR)
      : vacio,
    tipos.includes('ficha')
      ? supabase
          .from('artists')
          .select('id, name')
          .is('profile_id', null)
          .ilike('name', like)
          .order('name', { ascending: true })
          .limit(LIMITE_BUSCADOR)
      : vacio,
  ]);
  if (cuentas.error) throw cuentas.error;
  if (fichas.error) throw fichas.error;
  return [
    ...((cuentas.data ?? []) as any[]).map(
      (c): BandaEncontrada => ({ tipo: 'cuenta', id: c.id, nombre: c.nombre ?? '' }),
    ),
    ...((fichas.data ?? []) as any[]).map(
      (f): BandaEncontrada => ({ tipo: 'ficha', id: f.id, nombre: f.name }),
    ),
  ];
}

/** La banda principal (`orden` 0) y las adicionales en su orden. */
export async function bandasDelEventoAdmin(eventId: string): Promise<BandaDelEvento[]> {
  const [evento, adicionales] = await Promise.all([
    supabase.from('events').select('musico_id, artist_id').eq('id', eventId).maybeSingle(),
    supabase
      .from('event_artists')
      .select('orden, artists(id, name), cuenta:musico_id(id, nombre)')
      .eq('event_id', eventId)
      .order('orden', { ascending: true }),
  ]);
  if (evento.error) throw evento.error;
  if (adicionales.error) throw adicionales.error;

  const out: BandaDelEvento[] = [];
  const principal = evento.data as any;
  if (principal?.musico_id) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nombre')
      .eq('id', principal.musico_id)
      .maybeSingle();
    if (error) throw error;
    const p = data as any;
    if (p) out.push({ tipo: 'cuenta', id: p.id, nombre: p.nombre ?? '', orden: 0 });
  } else if (principal?.artist_id) {
    const { data, error } = await supabase
      .from('artists')
      .select('id, name')
      .eq('id', principal.artist_id)
      .maybeSingle();
    if (error) throw error;
    const a = data as any;
    if (a) out.push({ tipo: 'ficha', id: a.id, nombre: a.name, orden: 0 });
  }

  for (const r of (adicionales.data ?? []) as any[]) {
    if (r.cuenta) {
      out.push({ tipo: 'cuenta', id: r.cuenta.id, nombre: r.cuenta.nombre ?? '', orden: r.orden });
    } else if (r.artists) {
      out.push({ tipo: 'ficha', id: r.artists.id, nombre: r.artists.name, orden: r.orden });
    }
  }
  return out;
}

// ── Escrituras ───────────────────────────────────────────────────────────

async function rpc(nombre: string, args: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.rpc(nombre, args);
  if (error) throw error;
  return data;
}

/** `cambios` lleva nombres de columna de `artists`. Vacío: no llama a la base. */
export async function adminEditarBanda(
  id: string,
  cambios: Record<string, unknown>,
): Promise<any | null> {
  if (Object.keys(cambios).length === 0) return null;
  return rpc('admin_editar_banda', { p_id: id, p_datos: cambios });
}

/** Irreversible (W-347): la ficha se convierte en la cuenta y desaparece. */
export async function adminVincularBanda(artistId: string, profileId: string): Promise<void> {
  await rpc('admin_vincular_banda', { p_artist: artistId, p_profile: profileId });
}

/** La ficha origen desaparece y todo lo suyo pasa a la destino. */
export async function adminUnirBandas(
  origenId: string,
  destinoId: string,
): Promise<{ eventos_principal: number; eventos_adicional: number; invitaciones: number }> {
  return rpc('admin_unir_bandas', { p_origen: origenId, p_destino: destinoId });
}

/** Devuelve la fila del evento. */
export async function adminCambiarLocalEvento(eventId: string, venueId: string): Promise<any> {
  return rpc('admin_cambiar_local_evento', { p_event: eventId, p_venue: venueId });
}

/** Devuelve la fila del evento: de ahí sale el `artist_name` nuevo. */
export async function adminCambiarPrincipalEvento(eventId: string, banda: BandaRef): Promise<any> {
  return rpc('admin_cambiar_principal_evento', { p_event: eventId, ...argsPrincipal(banda) });
}

/** Columna de `event_artists` que le toca a la banda. */
function columnaDeBanda(banda: BandaRef): ['musico_id' | 'artist_id', string] {
  if (banda?.tipo === 'cuenta') return ['musico_id', banda.id];
  if (banda?.tipo === 'ficha') return ['artist_id', banda.id];
  throw new Error('banda sin tipo');
}

export async function agregarBandaAdicional(
  eventId: string,
  banda: BandaRef,
  orden: number,
): Promise<void> {
  const [columna, id] = columnaDeBanda(banda);
  const { error } = await supabase
    .from('event_artists')
    .insert({ event_id: eventId, orden, [columna]: id });
  if (error) throw error;
}

export async function quitarBandaAdicional(eventId: string, banda: BandaRef): Promise<void> {
  const [columna, id] = columnaDeBanda(banda);
  const { data, error } = await supabase
    .from('event_artists')
    .delete()
    .eq('event_id', eventId)
    .eq(columna, id)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('esa banda no está en el evento');
}

/**
 * `fila` es lo que arma `mapProfileToDB`. Es un `update` y no el `upsert` del dueño: un
 * `INSERT … ON CONFLICT DO UPDATE` pasa también por la policy de INSERT de `profiles`
 * (`auth.uid() = id`), que el admin no cumple.
 */
export async function guardarPerfilMusicoComoAdmin(
  cuentaId: string,
  fila: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update(fila)
    .eq('id', cuentaId)
    .eq('role', 'musician')
    .select('id');
  if (error) throw error;
  if (!data?.length) {
    throw new Error('No se guardó: esa cuenta no es de músico o tu sesión no es admin.');
  }
}
