import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { enmascararEmail, VentaPanel } from '../lib/panel';
import { SolicitudBolo, useSolicitudes } from './useSolicitudes';
import { ContactoCrm, useContactosCrm } from './useContactosCrm';
import type { TipoTenant } from './useTenantCrm';

interface Lectura {
  clave: string; // ids con los que se leyó
  ventas: VentaPanel[] | null;
  cerrados: ReadonlySet<string>;
}

const SIN_CERRADOS: ReadonlySet<string> = new Set<string>();

function mapVentaPanel(db: any): VentaPanel {
  return {
    id: db.id,
    eventoId: db.evento_id,
    status: db.status,
    monto: db.monto ?? 0,
    moneda: db.moneda ?? null,
    cantidad: db.cantidad ?? null,
    createdAt: db.created_at,
    // Se enmascara acá: el correo completo nunca queda en el estado del componente.
    compradorEmail: enmascararEmail(db.comprador_email),
  };
}

/** Ventas y cierres en paralelo. Qué filas se ven lo decide la RLS
 * (`tickets_select_event_team`), no un filtro de acá. */
async function leerVentasYCierres(clave: string): Promise<Lectura> {
  const ids = clave ? clave.split(',') : [];
  if (ids.length === 0) return { clave, ventas: [], cerrados: SIN_CERRADOS };

  const [tickets, eventos] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, evento_id, status, monto, moneda, cantidad, created_at, comprador_email')
      .in('evento_id', ids)
      .order('created_at', { ascending: false }),
    // `closed_at` no está en EventosContext (mismo motivo que useAdminEventos).
    supabase.from('events').select('id, closed_at').in('id', ids),
  ]);

  if (tickets.error) console.error('[usePanel] no se pudieron leer las ventas:', tickets.error.message);
  // Los cierres son un filtro, no un número: sin ellos se cuenta de más un evento cerrado.
  if (eventos.error) console.error('[usePanel] no se pudieron leer los cierres:', eventos.error.message);

  return {
    clave,
    ventas: tickets.error ? null : ((tickets.data ?? []) as any[]).map(mapVentaPanel),
    cerrados: eventos.error
      ? SIN_CERRADOS
      : new Set(((eventos.data ?? []) as any[]).filter((e) => e.closed_at).map((e) => e.id as string)),
  };
}

/**
 * Spec 195 — los datos del panel de local y de músico, con la sesión de la app.
 * Las cuentas viven en `src/lib/panel.ts` (`armarNumerosPanel`).
 */
export function usePanel(
  tenant: { tipo: TipoTenant; id: string } | null,
  eventoIds: string[],
): {
  cargando: boolean; // true solo hasta la primera respuesta completa
  ventas: VentaPanel[] | null; // null = error de lectura
  cerrados: ReadonlySet<string>;
  solicitudes: SolicitudBolo[] | null; // null = error de lectura
  contactos: ContactoCrm[] | null; // null = error de lectura o sin tenant
  aceptarSolicitud: (id: string) => Promise<{ ok: true } | { ok: false; mensaje: string }>;
  recargar: () => Promise<void>;
} {
  // El arreglo se recrea en cada render: la dependencia es el texto.
  const clave = eventoIds.join(',');
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const turno = useRef(0);

  const {
    solicitudes,
    cargando: cargandoSolicitudes,
    error: errorSolicitudes,
    refrescar: refrescarSolicitudes,
    responder,
  } = useSolicitudes();
  const { contactos, cargando: cargandoContactos, refrescar: refrescarContactos } = useContactosCrm(tenant);

  const leer = useCallback(async () => {
    const mio = ++turno.current;
    let nueva: Lectura;
    try {
      nueva = await leerVentasYCierres(clave);
    } catch (e: any) {
      console.error('[usePanel] no se pudo leer el panel:', e?.message ?? e);
      nueva = { clave, ventas: null, cerrados: SIN_CERRADOS };
    }
    // Una respuesta vieja no pisa a la de los ids actuales.
    if (mio === turno.current) setLectura(nueva);
  }, [clave]);

  useEffect(() => {
    leer();
  }, [leer]);

  // La lectura de una lista vacía no responde por una lista con eventos: sin esto, el
  // panel diría «0 vendidas» mientras los eventos recién llegan.
  const hayLectura = lectura !== null && (lectura.clave !== '' || clave === '');
  const todoRespondido = hayLectura && !cargandoSolicitudes && !cargandoContactos;

  // useSolicitudes y useContactosCrm vuelven a `cargando` al recargar: se recuerda la primera.
  const [yaRespondio, setYaRespondio] = useState(false);
  useEffect(() => {
    if (todoRespondido) setYaRespondio(true);
  }, [todoRespondido]);

  const aceptarSolicitud = useCallback(
    async (id: string): Promise<{ ok: true } | { ok: false; mensaje: string }> => {
      try {
        await responder(id, 'accepted');
        return { ok: true };
      } catch (err: any) {
        return { ok: false, mensaje: err?.message || 'No se pudo aceptar la solicitud. Intenta de nuevo.' };
      }
    },
    [responder],
  );

  const recargar = useCallback(async () => {
    await Promise.all([leer(), refrescarSolicitudes(), refrescarContactos()]);
  }, [leer, refrescarSolicitudes, refrescarContactos]);

  return {
    cargando: !hayLectura || (!yaRespondio && !todoRespondido),
    ventas: hayLectura ? lectura!.ventas : null,
    cerrados: lectura?.cerrados ?? SIN_CERRADOS,
    solicitudes: errorSolicitudes ? null : solicitudes,
    contactos: tenant ? contactos : null,
    aceptarSolicitud,
    recargar,
  };
}
