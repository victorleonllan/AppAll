import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Evento, Ticket, TicketStatus } from '../types';
import { eventos as mockEventos } from '../data/mock/eventos';

interface EventosState {
  eventos: Evento[];
  loading: boolean;
  refresh: () => Promise<void>;
  createEvento: (evento: Omit<Evento, 'id'>) => Promise<Evento>;
  deleteEvento: (id: string) => Promise<void>;
  tickets: Ticket[];
  createTicket: (eventoId: string, userId: string, monto: number) => Promise<Ticket>;
  getTicketsByUser: (userId: string) => Ticket[];
  updateTicketStatus: (ticketId: string, status: TicketStatus) => Promise<void>;
}

const EventosContext = createContext<EventosState>({} as EventosState);

function mapEventoFromDB(db: any): Evento {
  return {
    id: db.id,
    artista: db.artist_name,
    venueId: db.venue_id,
    venueName: db.venue_name,
    fecha: db.fecha,
    hora: db.hora,
    genero: db.genero,
    precio: db.precio,
    imagen: db.imagen,
    createdBy: db.created_by,
    monto: db.monto ?? undefined,
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
    venue_id: evento.venueId,
    venue_name: evento.venueName,
    fecha: evento.fecha,
    hora: evento.hora,
    genero: evento.genero,
    precio: evento.precio,
    imagen: evento.imagen ?? null,
    created_by: evento.createdBy,
    monto: evento.monto ?? montoDesdePrecio(evento.precio),
  };
}

export function EventosProvider({ children }: { children: ReactNode }) {
  const [eventos, setEventos] = useState<Evento[]>(mockEventos);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  const loadFromSupabase = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('events').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        const mapped = data.map(mapEventoFromDB);
        setEventos(mapped);
        setUseMock(false);
      }
    } catch {
      setEventos([...mockEventos]);
      setUseMock(true);
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

  const createEvento = useCallback(async (evento: Omit<Evento, 'id'>): Promise<Evento> => {
    if (!useMock) {
      try {
        const { data, error } = await supabase
          .from('events')
          .insert(mapEventoToDB(evento))
          .select()
          .single();
        if (!error && data) {
          const newEvento = mapEventoFromDB(data);
          setEventos((prev) => [...prev, newEvento]);
          return newEvento;
        }
      } catch {}
    }
    const newEvento: Evento = { ...evento, id: `event-${Date.now()}` };
    setEventos((prev) => [...prev, newEvento]);
    return newEvento;
  }, [useMock]);

  const deleteEvento = useCallback(async (id: string) => {
    if (!useMock) {
      try {
        await supabase.from('events').delete().eq('id', id);
      } catch {}
    }
    setEventos((prev) => prev.filter((e) => e.id !== id));
  }, [useMock]);

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

  return (
    <EventosContext.Provider
      value={{
        eventos, loading, refresh, createEvento, deleteEvento,
        tickets, createTicket, getTicketsByUser, updateTicketStatus,
      }}
    >
      {children}
    </EventosContext.Provider>
  );
}

export const useEventos = () => useContext(EventosContext);
