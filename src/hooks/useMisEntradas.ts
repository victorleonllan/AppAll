import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { EventoStatus, TicketItemStatus } from '../types';

export interface EventoDeEntrada {
  id: string;
  artista: string;            // events.artist_name
  venueId: string | null;
  venueName: string;
  imagen: string | null;
  fecha: string;              // texto tal como lo escribió el organizador
  hora: string;
  comienzaAt: string | null;  // ISO; null en eventos viejos sin comienza_at
  genero: string | null;
  status: EventoStatus;       // 'cancelled' se muestra en el talón
  pais: string | null;
}

export interface EntradaPropia {
  id: string;
  ticketId: string;
  eventoId: string;
  folio: number;
  qrToken: string;
  status: TicketItemStatus;   // 'valid' | 'used' | 'void'
  redeemedAt: string | null;
  evento: EventoDeEntrada | null; // null si el evento no se pudo leer
}

/** Compra pagada (`tickets.status = 'completed'`) sin ticket_items todavía. */
export interface CompraEnEmision {
  ticketId: string;
  eventoId: string;
  cantidad: number;
  evento: EventoDeEntrada | null;
}

export interface MisEntradasState {
  cargando: boolean;
  error: string | null;
  proximas: EntradaPropia[];
  pasadas: EntradaPropia[];
  comprasEnEmision: CompraEnEmision[];
  refrescar: () => Promise<void>;
}

// Un show de las 21:00 no puede saltar a "Pasadas" a las 21:01, con la
// persona todavía en la fila: 12 h cubren la noche completa.
const MARGEN_PASADA_MS = 12 * 60 * 60 * 1000;

function esPasada(entrada: EntradaPropia, ahora: number): boolean {
  const comienzaAt = entrada.evento?.comienzaAt;
  if (!comienzaAt) return false;
  const ms = Date.parse(comienzaAt);
  return !Number.isNaN(ms) && ms < ahora - MARGEN_PASADA_MS;
}

function msDe(entrada: EntradaPropia): number | null {
  const comienzaAt = entrada.evento?.comienzaAt;
  if (!comienzaAt) return null;
  const ms = Date.parse(comienzaAt);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Spec 125 — las entradas de quien tiene la sesión, para la puerta. Hook
 * aparte y no función de un contexto, mismo criterio que useEntradasEvento
 * (spec 039): son datos de una pantalla, no estado global.
 *
 * Los filtros por dueño son obligatorios: ti_select y tickets_select_* son un
 * OR con el equipo del evento, así que sin ellos un músico vería los QR de
 * todos sus compradores.
 */
export function useMisEntradas(): MisEntradasState {
  const { user } = useAuth();
  const userId = user?.id;

  const [proximas, setProximas] = useState<EntradaPropia[]>([]);
  const [pasadas, setPasadas] = useState<EntradaPropia[]>([]);
  const [comprasEnEmision, setComprasEnEmision] = useState<CompraEnEmision[]>([]);
  const [cargando, setCargando] = useState(!!userId);
  const [error, setError] = useState<string | null>(null);

  // Solo la última carga escribe estado: si userId cambia con una carga en
  // vuelo, la respuesta vieja se descarta.
  const cargaActual = useRef(0);

  const cargar = useCallback(async () => {
    const carga = ++cargaActual.current;
    if (!userId) {
      setProximas([]);
      setPasadas([]);
      setComprasEnEmision([]);
      setError(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const [itemsRes, ticketsRes] = await Promise.all([
        supabase
          .from('ticket_items')
          .select('id, ticket_id, evento_id, folio, qr_token, status, redeemed_at, ticket:tickets!inner(user_id)')
          .eq('ticket.user_id', userId),
        supabase
          .from('tickets')
          .select('id, evento_id, cantidad')
          .eq('user_id', userId)
          .eq('status', 'completed'),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (ticketsRes.error) throw ticketsRes.error;

      const items = (itemsRes.data ?? []) as any[];
      const idsConEntradas = new Set(items.map((r) => r.ticket_id));
      // Spec 037 emite al confirmar el pago: completed sin ticket_items es
      // "pagada, entradas en camino". Las pending no se muestran (spec 088).
      const sinEmitir = ((ticketsRes.data ?? []) as any[]).filter((t) => !idsConEntradas.has(t.id));

      const idsUnicos = Array.from(
        new Set([...items.map((r) => r.evento_id), ...sinEmitir.map((t) => t.evento_id)].filter(Boolean)),
      );

      const eventos: Record<string, EventoDeEntrada> = {};
      if (idsUnicos.length > 0) {
        const { data: eventosData, error: eventosError } = await supabase
          .from('events')
          .select('id, artist_name, venue_id, venue_name, imagen, fecha, hora, comienza_at, genero, status, pais')
          .in('id', idsUnicos);
        if (eventosError) throw eventosError;
        for (const e of (eventosData ?? []) as any[]) {
          eventos[e.id] = {
            id: e.id,
            artista: e.artist_name,
            venueId: e.venue_id,
            venueName: e.venue_name,
            imagen: e.imagen,
            fecha: e.fecha,
            hora: e.hora,
            comienzaAt: e.comienza_at,
            genero: e.genero,
            status: e.status as EventoStatus,
            pais: e.pais,
          };
        }
      }

      const entradas: EntradaPropia[] = items.map((r) => ({
        id: r.id,
        ticketId: r.ticket_id,
        eventoId: r.evento_id,
        folio: r.folio,
        qrToken: r.qr_token,
        status: r.status as TicketItemStatus,
        redeemedAt: r.redeemed_at,
        evento: eventos[r.evento_id] ?? null,
      }));

      // Sin fecha confiable no se puede afirmar que ya pasó: los null van a
      // próximas, porque esconder una entrada válida es peor que mostrar una vieja.
      const ahora = Date.now();
      const prox = entradas.filter((e) => !esPasada(e, ahora));
      const pas = entradas.filter((e) => esPasada(e, ahora));

      prox.sort((a, b) => {
        const ma = msDe(a);
        const mb = msDe(b);
        if (ma !== mb) {
          if (ma === null) return 1;
          if (mb === null) return -1;
          return ma - mb;
        }
        return a.folio - b.folio;
      });
      pas.sort((a, b) => {
        const ma = msDe(a) ?? 0;
        const mb = msDe(b) ?? 0;
        if (ma !== mb) return mb - ma;
        return a.folio - b.folio;
      });

      if (carga !== cargaActual.current) return;
      setProximas(prox);
      setPasadas(pas);
      setComprasEnEmision(
        sinEmitir.map((t) => ({
          ticketId: t.id,
          eventoId: t.evento_id,
          cantidad: t.cantidad,
          evento: eventos[t.evento_id] ?? null,
        })),
      );
    } catch (err: any) {
      if (carga !== cargaActual.current) return;
      // Un error no borra lo ya cargado: con mala señal en la puerta, tirar
      // para recargar no puede hacer desaparecer el QR que ya estaba a la vista.
      setError(err?.message ?? 'No se pudieron cargar tus entradas');
    } finally {
      if (carga === cargaActual.current) setCargando(false);
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { cargando, error, proximas, pasadas, comprasEnEmision, refrescar: cargar };
}
