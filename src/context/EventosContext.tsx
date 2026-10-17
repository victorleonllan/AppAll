import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Evento, EventoStatus, EventRole, Colaborador, Ticket, TicketStatus } from '../types';
import { useAuth } from './AuthContext';
import { usePais } from './PaisContext';

interface EventosState {
  // Spec 096 — `eventos` son TODOS los países: lo leen las pantallas privadas
  // ("mis eventos", "mis ventas", "mi local"), que son lo mío y no una cartelera.
  // `eventosDelPais` es lo que lista la Cartelera.
  eventos: Evento[];
  eventosDelPais: Evento[];
  loading: boolean;
  // Spec 115 — mensaje de la última carga fallida de `events`; null si salió bien.
  error: string | null;
  refresh: () => Promise<void>;
  createEvento: (evento: Omit<Evento, 'id'>) => Promise<Evento>;
  updateEvento: (id: string, cambios: Partial<Pick<Evento, 'artista' | 'fecha' | 'hora' | 'genero' | 'precio' | 'imagen' | 'pais'>>) => Promise<void>;
  deleteEvento: (id: string) => Promise<void>;
  cancelEvento: (id: string, motivo?: string) => Promise<void>;
  tickets: Ticket[];
  createTicket: (eventoId: string, userId: string, monto: number) => Promise<Ticket>;
  getTicketsByUser: (userId: string) => Ticket[];
  updateTicketStatus: (ticketId: string, status: TicketStatus) => Promise<void>;
  // Spec 033 — equipo del evento (event_collaborators)
  misColaboraciones: Colaborador[];
  getColaboradores: (eventoId: string) => Promise<Colaborador[]>;
  invitarColaborador: (eventoId: string, userId: string, role: EventRole) => Promise<void>;
  cambiarPermisoBorrado: (eventoId: string, userId: string, canDelete: boolean) => Promise<void>;
  quitarColaborador: (eventoId: string, userId: string) => Promise<void>;
  transferirPropiedad: (eventoId: string, nuevoOwnerId: string) => Promise<void>;
  buscarCandidatos: (query: string) => Promise<{ id: string; nombre: string; role: string }[]>;
}

const EventosContext = createContext<EventosState>({} as EventosState);

function mapEventoFromDB(db: any): Evento {
  return {
    id: db.id,
    artista: db.artist_name,
    artistId: db.artist_id ?? null,
    venueId: db.venue_id,
    venueName: db.venue_name,
    pais: db.pais,
    fecha: db.fecha,
    hora: db.hora,
    genero: db.genero,
    precio: db.precio,
    imagen: db.imagen,
    createdBy: db.created_by,
    monto: db.monto ?? undefined,
    status: (db.status as EventoStatus) ?? 'published',
    cancelledAt: db.cancelled_at ?? null,
    cancelReason: db.cancel_reason ?? null,
  };
}

/**
 * `precio` es texto libre que escribe el músico ("$5.000"); `monto` es el entero
 * en CLP que Mercado Pago cobra. El formulario solo captura el primero, así que
 * el segundo se deriva: sin esto `monto` queda NULL y la compra se bloquea con
 * "Sin precio". Formato chileno: el punto es separador de miles, no decimal.
 */
function montoDesdePrecio(precio: string | undefined): number {
  const digitos = (precio ?? '').replace(/\D/g, '');
  return digitos ? parseInt(digitos, 10) : 0;
}

function mapEventoToDB(evento: Omit<Evento, 'id'>): any {
  return {
    artist_name: evento.artista,
    artist_id: evento.artistId ?? null,
    venue_id: evento.venueId,
    venue_name: evento.venueName,
    pais: evento.pais,
    fecha: evento.fecha,
    hora: evento.hora,
    genero: evento.genero,
    precio: evento.precio,
    imagen: evento.imagen ?? null,
    created_by: evento.createdBy,
    monto: evento.monto ?? montoDesdePrecio(evento.precio),
  };
}

/** El nombre no es columna de event_collaborators — se completa con un join
 * manual contra `profiles`. Ver comentario en getColaboradores: tras el spec
 * 020, profiles solo expone `role='musician'` a terceros, así que el nombre
 * de un colaborador `role='cafe'` puede llegar vacío para quien no es él mismo. */
function mapColaboradorFromDB(db: any, nombre?: string): Colaborador {
  return {
    eventId: db.event_id,
    userId: db.user_id,
    role: db.role as EventRole,
    canDelete: db.can_delete,
    source: db.source,
    invitedBy: db.invited_by ?? null,
    createdAt: db.created_at,
    nombre,
  };
}

export function EventosProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [misColaboraciones, setMisColaboraciones] = useState<Colaborador[]>([]);
  const { pais } = usePais();

  // Spec 096 — derivado de la consulta sin filtrar, no una segunda consulta con
  // `.eq('pais', pais)`: las pantallas privadas necesitan todos los países, y la
  // lista del país es un subconjunto de esa misma lista. Cambiar de país recalcula
  // al instante sin ir a la red.
  const eventosDelPais = useMemo(
    () => eventos.filter((e) => e.pais === pais),
    [eventos, pais]
  );

  // Spec 115 — antes: con 0 filas o con error quedaban los eventos mock (ids
  // "1", "2"… que dan 404 al comprar). Ahora 0 filas es lista vacía y el error
  // se expone en `error`. Ante un error la lista NO se vacía: si ya había datos
  // de una carga anterior siguen siendo la mejor información disponible (un
  // `refresh()` que falla por red no borra la cartelera). En la primera carga, [].
  const loadFromSupabase = useCallback(async () => {
    setError(null);
    try {
      const { data, error } = await supabase.from('events').select('*');
      if (error) throw error;
      setEventos((data ?? []).map(mapEventoFromDB));
    } catch (e: any) {
      console.error('[EventosContext] no se pudo cargar events:', e);
      setError(e?.message ?? 'No se pudieron cargar los eventos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFromSupabase();
  }, [loadFromSupabase]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await loadFromSupabase();
  }, [loadFromSupabase]);

  // Spec 033 — "mis eventos" ya no es solo `createdBy === user.id`: incluye
  // los eventos donde soy admin/editor (dueño de local, artista vinculado).
  // Lectura sola; si la consulta falla queda lista vacía y el error va a la
  // consola (spec 115: antes un catch vacío lo hacía invisible al depurar).
  const cargarMisColaboraciones = useCallback(async () => {
    if (!user) {
      setMisColaboraciones([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('event_collaborators')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      setMisColaboraciones((data ?? []).map((r: any) => mapColaboradorFromDB(r)));
    } catch (e) {
      console.error('[EventosContext] no se pudo cargar event_collaborators:', e);
      setMisColaboraciones([]);
    }
  }, [user]);

  useEffect(() => {
    cargarMisColaboraciones();
  }, [cargarMisColaboraciones]);

  // Spec 115 — antes: un insert rechazado caía a un evento inventado en memoria
  // (`event-<timestamp>`) y el usuario veía «publicado» sin nada en la base.
  // Ahora el error se lanza sin try/catch propio: quien llama decide qué mostrar,
  // igual que deleteEvento y createVenue.
  const createEvento = useCallback(async (evento: Omit<Evento, 'id'>): Promise<Evento> => {
    const { data, error } = await supabase
      .from('events')
      .insert(mapEventoToDB(evento))
      .select()
      .single();
    if (error) throw error;
    const newEvento = mapEventoFromDB(data);
    setEventos((prev) => [...prev, newEvento]);
    cargarMisColaboraciones(); // events_claim_owner_trg me acaba de agregar como owner
    return newEvento;
  }, [cargarMisColaboraciones]);

  // Spec 034 — cualquiera del equipo (owner/admin/editor) corrige fecha, hora,
  // género, precio, imagen o el nombre del artista. venueId y artistId no son
  // parámetros válidos a propósito: cambiarlos reabre la pregunta que
  // events_claim_owner_trg solo resuelve en el INSERT (¿se re-ejecuta el claim
  // del equipo? ¿se avisa a quien sale?) — decisión de producto propia, fuera
  // de este spec.
  //
  // El objeto de UPDATE se arma campo por campo en vez del objeto literal que
  // trae el spec: ese literal manda `precio` sin recalcular `monto` a pesar
  // de decir en su comentario que sí — el mismo bug de "Sin precio" que el
  // spec 021 encontró en la creación. Acá se recalcula solo cuando `precio`
  // viene en `cambios`; de lo contrario `montoDesdePrecio(undefined)` daría 0
  // y pisaría el monto real en cualquier UPDATE que no toque el precio.
  const updateEvento = useCallback(async (
    id: string,
    cambios: Partial<Pick<Evento, 'artista' | 'fecha' | 'hora' | 'genero' | 'precio' | 'imagen' | 'pais'>>
  ) => {
    const cambiosDB: Record<string, any> = {};
    if (cambios.artista !== undefined) cambiosDB.artist_name = cambios.artista;
    if (cambios.fecha !== undefined) cambiosDB.fecha = cambios.fecha;
    if (cambios.hora !== undefined) cambiosDB.hora = cambios.hora;
    if (cambios.genero !== undefined) cambiosDB.genero = cambios.genero;
    if (cambios.imagen !== undefined) cambiosDB.imagen = cambios.imagen;
    // Spec 095 — events.pais es copia del local (spec 080): corregir el local no
    // arrastra los eventos ya creados, así que el evento se corrige por su cuenta.
    if (cambios.pais !== undefined) cambiosDB.pais = cambios.pais;
    if (cambios.precio !== undefined) {
      cambiosDB.precio = cambios.precio;
      cambiosDB.monto = montoDesdePrecio(cambios.precio);
    }
    const { data, error } = await supabase
      .from('events')
      .update(cambiosDB)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;   // RLS rechaza sin permiso; el mensaje llega tal cual al Alert
    setEventos((prev) => prev.map((e) => (e.id === id ? mapEventoFromDB(data) : e)));
  }, []);

  // Spec 033 — antes: `catch` vacío + borrado optimista del estado local
  // pase lo que pase. Si RLS rechazaba el delete (por ejemplo, alguien sin
  // permiso), el evento desaparecía de la pantalla igual y volvía a aparecer
  // al recargar — el mismo patrón de "error disfrazado de éxito" que el spec
  // 030 encontró en PerfilMusicoScreen. Ahora el error se propaga: quien
  // llama (la pantalla) decide qué mostrar.
  const deleteEvento = useCallback(async (id: string) => {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
    setEventos((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Cancelar no borra: dispara events_guard_protected_columns_trg, que exige
  // can_delete_event() aunque el UPDATE en sí lo permita can_edit_event().
  const cancelEvento = useCallback(async (id: string, motivo?: string) => {
    const { data, error } = await supabase
      .from('events')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: motivo ?? null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    setEventos((prev) => prev.map((e) => (e.id === id ? mapEventoFromDB(data) : e)));
  }, []);

  const createTicket = useCallback(async (eventoId: string, userId: string, monto: number): Promise<Ticket> => {
    const ticket: Ticket = {
      id: `ticket-${Date.now()}`,
      eventoId,
      userId,
      status: 'pending',
      preferenceId: '',
      monto,
      createdAt: new Date().toISOString(),
    };
    setTickets((prev) => [...prev, ticket]);
    return ticket;
  }, []);

  const getTicketsByUser = useCallback((userId: string): Ticket[] => {
    return tickets.filter((t) => t.userId === userId);
  }, [tickets]);

  const updateTicketStatus = useCallback(async (ticketId: string, status: TicketStatus) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status } : t))
    );
  }, []);

  // ────────────── Spec 033 — equipo del evento ──────────────

  const getColaboradores = useCallback(async (eventoId: string): Promise<Colaborador[]> => {
    const { data, error } = await supabase
      .from('event_collaborators')
      .select('*')
      .eq('event_id', eventoId);
    if (error) throw error;
    const rows = data ?? [];
    const userIds = rows.map((r: any) => r.user_id);
    let nombres: Record<string, string> = {};
    if (userIds.length > 0) {
      // RLS de profiles (spec 020) solo deja ver role='musician' + la fila propia:
      // el nombre de un colaborador 'cafe' que no soy yo puede no llegar.
      const { data: perfiles } = await supabase.from('profiles').select('id, nombre').in('id', userIds);
      nombres = Object.fromEntries((perfiles ?? []).map((p: any) => [p.id, p.nombre]));
    }
    return rows.map((r: any) => mapColaboradorFromDB(r, nombres[r.user_id]));
  }, []);

  const invitarColaborador = useCallback(async (eventoId: string, userId: string, role: EventRole) => {
    if (role === 'owner') throw new Error('La propiedad se transfiere, no se asigna por invitación');
    const { error } = await supabase
      .from('event_collaborators')
      .insert({ event_id: eventoId, user_id: userId, role, can_delete: false, source: 'invited', invited_by: user?.id ?? null });
    if (error) throw error;
  }, [user]);

  const cambiarPermisoBorrado = useCallback(async (eventoId: string, userId: string, canDelete: boolean) => {
    const { error } = await supabase
      .from('event_collaborators')
      .update({ can_delete: canDelete })
      .eq('event_id', eventoId)
      .eq('user_id', userId);
    if (error) throw error;
  }, []);

  const quitarColaborador = useCallback(async (eventoId: string, userId: string) => {
    const { error } = await supabase
      .from('event_collaborators')
      .delete()
      .eq('event_id', eventoId)
      .eq('user_id', userId);
    if (error) throw error;
  }, []);

  const transferirPropiedad = useCallback(async (eventoId: string, nuevoOwnerId: string) => {
    const { error } = await supabase.rpc('transfer_event_ownership', {
      p_event: eventoId,
      p_new_owner: nuevoOwnerId,
    });
    if (error) throw error;
    cargarMisColaboraciones();
  }, [cargarMisColaboraciones]);

  const buscarCandidatos = useCallback(async (query: string) => {
    if (!query.trim()) return [];
    const { data, error } = await supabase.rpc('search_collaborator_candidates', { q: query.trim() });
    if (error) throw error;
    return (data ?? []) as { id: string; nombre: string; role: string }[];
  }, []);

  return (
    <EventosContext.Provider
      value={{
        eventos, eventosDelPais, loading, error, refresh, createEvento, updateEvento, deleteEvento, cancelEvento,
        tickets, createTicket, getTicketsByUser, updateTicketStatus,
        misColaboraciones, getColaboradores, invitarColaborador,
        cambiarPermisoBorrado, quitarColaborador, transferirPropiedad, buscarCandidatos,
      }}
    >
      {children}
    </EventosContext.Provider>
  );
}

export const useEventos = () => useContext(EventosContext);
