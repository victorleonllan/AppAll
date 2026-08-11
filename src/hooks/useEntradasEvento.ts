import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TicketItem, TicketItemStatus } from '../types';

export interface CompraSinEmitir {
  ticketId: string;
  cantidad: number;
  estado: 'pagada_sin_emitir' | 'sin_pagar';
}

export interface ContadoresEntradas {
  emitidas: number;
  dentro: number;
  porPagar: number;
}

interface EntradasEventoState {
  cargando: boolean;
  error: string | null;
  entradas: TicketItem[];
  comprasSinEmitir: CompraSinEmitir[];
  contadores: ContadoresEntradas;
  refrescar: () => Promise<void>;
}

/**
 * Spec 039 — datos de UN evento, cargados al abrir la pantalla. Hook aparte y
 * no una función de EventosContext a propósito: los mismos datos no tienen
 * sentido como estado global que haya que invalidar desde el escáner (041),
 * desde el webhook (037) y desde cada refresh. Mismo criterio con el que el
 * spec 033 dejó useEventoPermisos como hook aparte.
 */
export function useEntradasEvento(eventoId: string | undefined): EntradasEventoState {
  const [entradas, setEntradas] = useState<TicketItem[]>([]);
  const [comprasSinEmitir, setComprasSinEmitir] = useState<CompraSinEmitir[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!eventoId) return;
    setCargando(true);
    setError(null);
    try {
      // El join sale gratis por la FK ticket_items.ticket_id → tickets.id.
      const { data: itemsData, error: itemsError } = await supabase
        .from('ticket_items')
        .select('id, ticket_id, folio, qr_token, status, redeemed_at, ticket:tickets(user_id, cantidad, status)')
        .eq('evento_id', eventoId)
        .order('folio');
      if (itemsError) throw itemsError;

      const rows = (itemsData ?? []) as any[];
      const userIds = Array.from(new Set(rows.map((r) => r.ticket?.user_id).filter(Boolean)));

      // RLS de profiles (spec 020) solo deja ver role='musician' + la fila
      // propia: el nombre de un comprador role='public' que no soy yo puede
      // llegar vacío. Mismo hueco conocido que EventosContext.getColaboradores.
      let nombres: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: perfiles } = await supabase.from('profiles').select('id, nombre').in('id', userIds);
        nombres = Object.fromEntries((perfiles ?? []).map((p: any) => [p.id, p.nombre]));
      }

      const mapeadas: TicketItem[] = rows.map((r) => ({
        id: r.id,
        ticketId: r.ticket_id,
        eventoId: eventoId,
        folio: r.folio,
        qrToken: r.qr_token,
        status: r.status as TicketItemStatus,
        redeemedAt: r.redeemed_at,
        compradorUserId: r.ticket?.user_id,
        compradorNombre: nombres[r.ticket?.user_id],
      }));
      setEntradas(mapeadas);

      // Spec 037 emite al confirmar el pago, así que una compra completed sin
      // ticket_items es "pagada, entradas en camino" — no lo mismo que pending
      // ("sin pagar"). Mezclarlos escondería justo el fallo que el 037 diseñó
      // el 500 del webhook para reparar.
      const idsConEntradas = new Set(mapeadas.map((e) => e.ticketId));
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('tickets')
        .select('id, status, cantidad')
        .eq('evento_id', eventoId)
        .in('status', ['completed', 'pending']);
      if (ticketsError) throw ticketsError;

      const sinEmitir: CompraSinEmitir[] = (ticketsData ?? [])
        .filter((t: any) => t.status === 'pending' || !idsConEntradas.has(t.id))
        .map((t: any) => ({
          ticketId: t.id,
          cantidad: t.cantidad,
          estado: t.status === 'pending' ? 'sin_pagar' : 'pagada_sin_emitir',
        }));
      setComprasSinEmitir(sinEmitir);
    } catch (err: any) {
      // Sin catch{} silencioso: en la puerta, una lista vacía por un error de
      // red se ve igual que "no hay entradas" si el error se traga acá.
      setError(err?.message ?? 'No se pudieron cargar las entradas');
    } finally {
      setCargando(false);
    }
  }, [eventoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const contadores: ContadoresEntradas = {
    emitidas: entradas.length,
    dentro: entradas.filter((e) => e.status === 'used').length,
    porPagar: comprasSinEmitir
      .filter((c) => c.estado === 'sin_pagar')
      .reduce((sum, c) => sum + c.cantidad, 0),
  };

  return { cargando, error, entradas, comprasSinEmitir, contadores, refrescar: cargar };
}
