import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mapPayoutFromDB, Payout } from '../lib/datosPago';
import { formatearMonto } from '../lib/precio';
import { getMontoATransferir } from '../lib/admin';

export interface FilaPagoAdmin extends Payout {
  evento: { id: string; artista: string; venueName: string; fecha: string; comienzaAt: string | null };
  moneda: string | null;
  cancelado: boolean;
  yaPaso: boolean;
  monto: number;
}

export interface EventoSinDatos {
  id: string;
  artista: string;
  venueName: string;
  fecha: string;
  comienzaAt: string | null;
  yaPaso: boolean;
}

interface AdminPagosState {
  cargando: boolean;
  error: string | null;
  porPagar: FilaPagoAdmin[];
  sinReclamar: FilaPagoAdmin[];
  acumulando: FilaPagoAdmin[];
  sinDatos: EventoSinDatos[];
  totalPorPagar: string;
  totalAcumulando: string;
  recargar: () => Promise<void>;
}

/** Sin fecha cuenta como no pasado, igual que la web (`new Date(null)` da NaN). */
function yaPasoDesde(comienzaAt: string | null, ahora: number): boolean {
  return comienzaAt ? new Date(comienzaAt).getTime() < ahora : false;
}

/**
 * Port de `formatearTotales` de sonopolisWeb/libs/moneda.js: suma por moneda, en el
 * orden en que cada una aparece, y une con " + ". Sumar CLP con MXN en un solo
 * número sería falso. Vive acá y no en `src/lib/precio.ts` para no editar un
 * archivo que comparten otros specs.
 */
export function formatearTotales(filas: { monto: number; moneda: string | null }[]): string {
  const orden: (string | null)[] = [];
  const totales = new Map<string | null, number>();
  for (const f of filas) {
    const moneda = f.moneda ?? null;
    if (!totales.has(moneda)) {
      orden.push(moneda);
      totales.set(moneda, 0);
    }
    totales.set(moneda, (totales.get(moneda) ?? 0) + (f.monto ?? 0));
  }
  if (orden.length === 0) return formatearMonto(0, null);
  return orden.map((m) => formatearMonto(totales.get(m) ?? 0, m)).join(' + ');
}

/** Port de `getEventosConPagoPendiente` (sonopolisWeb/libs/data/pagos.js). */
async function cargarPendientes(): Promise<FilaPagoAdmin[]> {
  const { data, error } = await supabase
    .from('event_payouts')
    .select('*, events!inner(id, artist_name, venue_name, fecha, hora, comienza_at, moneda, status, closed_at)')
    .neq('status', 'pagado')
    // W-174: un evento cerrado ya se resolvió y no es deuda ni pronóstico. Con
    // `!inner`, PostgREST descarta la fila de payout cuando el evento no cumple.
    .is('events.closed_at', null)
    .order('comienza_at', { referencedTable: 'events', ascending: true });
  if (error) throw error;

  const ahora = Date.now();
  // N+1 llamadas a `monto_a_transferir`, igual que la web: PostgREST no llama una
  // función por fila dentro de un join, y son pocas filas.
  const filas = await Promise.all(
    ((data ?? []) as any[]).map(async (fila): Promise<FilaPagoAdmin> => {
      const ev = fila.events;
      return {
        ...mapPayoutFromDB(fila),
        evento: {
          id: ev.id,
          artista: ev.artist_name ?? '',
          venueName: ev.venue_name ?? '',
          fecha: ev.fecha ?? '',
          comienzaAt: ev.comienza_at ?? null,
        },
        moneda: ev.moneda ?? null,
        // W-174/W-175: un cancelado no se paga al organizador; el spec 158 decide
        // qué dice el botón con esto.
        cancelado: ev.status === 'cancelled',
        yaPaso: yaPasoDesde(ev.comienza_at ?? null, ahora),
        monto: await getMontoATransferir(fila.event_id),
      };
    })
  );
  // Sin entradas vendidas no hay deuda ni pronóstico. Se filtra acá porque el
  // monto lo resuelve una función de Postgres, no una columna.
  return filas.filter((f) => f.monto > 0);
}

/** Port de `getEventosSinDatosBancarios`, más el orden de la página web: primero
 * los que ya pasaron (plata cobrada que no se puede transferir), después por fecha. */
async function cargarSinDatos(): Promise<EventoSinDatos[]> {
  const { data: conDatos, error: e1 } = await supabase.from('event_payouts').select('event_id');
  if (e1) throw e1;
  const ids = ((conDatos ?? []) as any[]).map((f) => f.event_id);

  let q = supabase
    .from('events')
    .select('id, artist_name, venue_name, fecha, hora, comienza_at, status')
    .neq('status', 'cancelled')
    .order('comienza_at', { ascending: true });
  if (ids.length > 0) q = q.not('id', 'in', `(${ids.join(',')})`);
  const { data, error } = await q;
  if (error) throw error;

  const ahora = Date.now();
  return ((data ?? []) as any[])
    .map((e) => ({
      id: e.id,
      artista: e.artist_name ?? '',
      venueName: e.venue_name ?? '',
      fecha: e.fecha ?? '',
      comienzaAt: e.comienza_at ?? null,
      yaPaso: yaPasoDesde(e.comienza_at ?? null, ahora),
    }))
    .sort((a, b) => {
      if (a.yaPaso !== b.yaPaso) return a.yaPaso ? -1 : 1;
      return new Date(a.comienzaAt ?? 0).getTime() - new Date(b.comienzaAt ?? 0).getTime();
    });
}

/**
 * Spec 152 — lo mismo que `/admin/sonopolis` de la web: qué hay que transferir, a
 * quién, y qué eventos no tienen dónde transferirles. Con la sesión del admin:
 * `event_payouts_select_admin` (spec 074) le deja ver todas las filas; a cualquier
 * otra cuenta la RLS no le da filas y las listas quedan vacías.
 *
 * Un error deja el mensaje en `error` y conserva las listas de la carga anterior,
 * como `EventosContext` (spec 115).
 */
export function useAdminPagos(): AdminPagosState {
  const [pendientes, setPendientes] = useState<FilaPagoAdmin[]>([]);
  const [sinDatos, setSinDatos] = useState<EventoSinDatos[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([cargarPendientes(), cargarSinDatos()]);
      setPendientes(p);
      setSinDatos(s);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudieron cargar los pagos');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // Tres situaciones distintas (spec 075 de la web). Solo la primera es una orden
  // de pago: el organizador la pidió. Las otras dos son información.
  const grupos = useMemo(() => {
    const porPagar = pendientes.filter((f) => f.yaPaso && f.status === 'reclamado');
    const sinReclamar = pendientes.filter((f) => f.yaPaso && f.status === 'pendiente');
    const acumulando = pendientes.filter((f) => !f.yaPaso);
    return {
      porPagar,
      sinReclamar,
      acumulando,
      totalPorPagar: formatearTotales(porPagar),
      totalAcumulando: formatearTotales(acumulando),
    };
  }, [pendientes]);

  return { cargando, error, ...grupos, sinDatos, recargar };
}
