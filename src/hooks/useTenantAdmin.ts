import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { llamarApiWeb } from '../lib/apiWeb';
import { esPro, esProSinVencimiento } from '../lib/pro';
import type { TipoTenant } from '../lib/adminPro';
import { cargarEventosYReglas, esEventoActivo, tenantDeEvento, type EventoDeTenant } from './useAdminCrm';
import type { ContactoCrm } from './useContactosCrm';
import type { EstadoCorreo } from './useCorreoCrm';

// Una sola definición de cada forma en la app: `ContactoCrm` (spec 149) ya es el
// mapeo de `mapContactoCrmFromDB` y `EstadoCorreo` la respuesta de `getEstadoCorreo`.
export type { ContactoCrm, EstadoCorreo };

export interface SuscripcionPro {
  codigo: string; monto: number; moneda: string; estado: string;
  correoCuenta: string | null; linkPedidoAt: string | null; createdAt: string;
}

interface TenantAdminState {
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  tenant: { nombre: string; pais: string | null; proHasta: string | null; esPro: boolean; sinVencimiento: boolean } | null;
  contactos: ContactoCrm[];
  resumen: { total: number; compradores: number; conWhatsapp: number };
  whatsapp: { todos: number; compradores: number; seguidores: number };
  eventosActivos: EventoDeTenant[];
  cuenta: { cuentaId: string; correo: string } | null;
  suscripciones: SuscripcionPro[];
  moneda: string | null;
  precioSugerido: number | null;
  errorSuscripcion: string | null;
  correo: EstadoCorreo | null;
  errorCorreo: string | null;
}

/** Mismo mapeo que `mapContactoCrmFromDB` de `useContactosCrm` (spec 149), que no lo exporta. */
function mapContactoCrmFromDB(db: any): ContactoCrm {
  return {
    clave: db.contacto_key,
    email: db.email ?? null,
    telefono: db.phone_e164 ?? null,
    origenes: db.origenes ?? [],
    primerContacto: db.primer_contacto,
    ultimaCompra: db.ultima_compra ?? null,
    entradas: db.entradas ?? 0,
    totalGastado: db.total_gastado ?? 0,
    aceptaWhatsapp: db.acepta_whatsapp ?? false,
  };
}

/** La fila del tenant; `null` si no existe. La usan el bloque principal y el de la
 * suscripción (que necesita el país), así que se pide una sola vez. */
async function cargarFilaTenant(tipo: TipoTenant, id: string): Promise<any | null> {
  const { data, error } =
    tipo === 'venue'
      ? await supabase.from('venues').select('*').eq('id', id).maybeSingle()
      : await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function cargarPrincipal(tipo: TipoTenant, id: string, filaTenant: Promise<any | null>) {
  const [db, contactos, { eventos, reglas }] = await Promise.all([
    filaTenant,
    supabase
      .from('crm_contactos')
      .select('*')
      .eq('tenant_type', tipo)
      .eq('tenant_id', id)
      .order('primer_contacto', { ascending: false }),
    cargarEventosYReglas(),
  ]);
  if (contactos.error) throw contactos.error;
  if (!db) throw new Error('No existe');

  const proHasta: string | null = db.sonopolis_pro_hasta ?? null;
  const conPro = { sonopolisProHasta: proHasta };
  const ahora = Date.now();
  return {
    tenant: {
      nombre: (tipo === 'venue' ? db.name : db.nombre) || '(sin nombre)',
      pais: db.pais ?? null,
      proHasta,
      esPro: esPro(conPro),
      sinVencimiento: esProSinVencimiento(conPro),
    },
    contactos: ((contactos.data ?? []) as any[]).map(mapContactoCrmFromDB),
    eventosActivos: eventos.filter((e) => {
      const t = tenantDeEvento(e, reglas);
      return t?.type === tipo && t.id === id && esEventoActivo(e, ahora);
    }),
  };
}

/** Port de `cargarSuscripcion` (`app/(private)/admin/crm/[tipo]/[id]/page.js:155`).
 * `precioSugerido` sale de `paises_cobro.pro_precio_mensual` (spec 111), no de una constante. */
async function cargarSuscripcion(tipo: TipoTenant, id: string, pais: string | null) {
  const [cuenta, suscripciones, paises] = await Promise.all([
    supabase.rpc('admin_cuenta_del_tenant', { p_tenant_type: tipo, p_tenant_id: id }),
    supabase
      .from('pro_suscripciones')
      .select('codigo, monto, moneda, estado, correo_cuenta, link_pedido_at, created_at')
      .eq('tenant_type', tipo)
      .eq('tenant_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('paises_cobro').select('pais, moneda, pro_precio_mensual'),
  ]);
  if (cuenta.error) throw cuenta.error;
  if (suscripciones.error) throw suscripciones.error;
  if (paises.error) throw paises.error;

  const primera = ((cuenta.data ?? []) as any[])[0];
  const delPais = ((paises.data ?? []) as any[]).find((p) => p.pais === pais);
  return {
    cuenta: primera ? { cuentaId: primera.cuenta_id as string, correo: primera.correo as string } : null,
    suscripciones: ((suscripciones.data ?? []) as any[]).map(
      (s): SuscripcionPro => ({
        codigo: s.codigo,
        monto: Number(s.monto),
        moneda: s.moneda,
        estado: s.estado,
        correoCuenta: s.correo_cuenta ?? null,
        linkPedidoAt: s.link_pedido_at ?? null,
        createdAt: s.created_at,
      })
    ),
    moneda: (delPais?.moneda as string | undefined) ?? null,
    precioSugerido: delPais?.pro_precio_mensual != null ? Number(delPais.pro_precio_mensual) : null,
  };
}

/**
 * Spec 153 — el detalle de `/admin/crm/[tipo]/[id]` de la web. Tres bloques en
 * paralelo que fallan por separado (`error`, `errorSuscripcion`, `errorCorreo`):
 * es una pantalla de revisión y no puede caerse entera por un bloque. Hasta que el
 * W-249 esté desplegado, `/api/crm/correo` responde 401 y solo esa sección lo muestra.
 */
export function useTenantAdmin(tipo: TipoTenant, id: string): TenantAdminState {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantAdminState['tenant']>(null);
  const [contactos, setContactos] = useState<ContactoCrm[]>([]);
  const [eventosActivos, setEventosActivos] = useState<EventoDeTenant[]>([]);
  const [cuenta, setCuenta] = useState<TenantAdminState['cuenta']>(null);
  const [suscripciones, setSuscripciones] = useState<SuscripcionPro[]>([]);
  const [moneda, setMoneda] = useState<string | null>(null);
  const [precioSugerido, setPrecioSugerido] = useState<number | null>(null);
  const [errorSuscripcion, setErrorSuscripcion] = useState<string | null>(null);
  const [correo, setCorreo] = useState<EstadoCorreo | null>(null);
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    setErrorSuscripcion(null);
    setErrorCorreo(null);

    const filaTenant = cargarFilaTenant(tipo, id);

    const principal = cargarPrincipal(tipo, id, filaTenant)
      .then((r) => {
        setTenant(r.tenant);
        setContactos(r.contactos);
        setEventosActivos(r.eventosActivos);
      })
      .catch((e: any) => {
        setError(e?.message ?? 'No se pudo cargar el tenant');
      });

    // El país sale de la fila del tenant: se espera solo a esa lectura, no al resto
    // del bloque principal. Si la fila falla, ese error ya lo muestra `error`, y la
    // suscripción sigue sin país (sin `moneda` ni `precioSugerido`).
    const suscripcion = filaTenant
      .then((db) => db?.pais ?? null, () => null)
      .then((pais) => cargarSuscripcion(tipo, id, pais))
      .then((r) => {
        setCuenta(r.cuenta);
        setSuscripciones(r.suscripciones);
        setMoneda(r.moneda);
        setPrecioSugerido(r.precioSugerido);
      })
      .catch((e: any) => {
        setCuenta(null);
        setSuscripciones([]);
        setMoneda(null);
        setPrecioSugerido(null);
        setErrorSuscripcion(e?.message ?? 'No se pudo cargar la suscripción');
      });

    const estadoCorreo = llamarApiWeb<EstadoCorreo>(
      `/api/crm/correo?tenantType=${tipo}&tenantId=${encodeURIComponent(id)}`
    )
      .then(setCorreo)
      .catch((e: any) => {
        setCorreo(null);
        setErrorCorreo(e?.message ?? 'No se pudo cargar el estado del correo');
      });

    await Promise.all([principal, suscripcion, estadoCorreo]);
    setCargando(false);
  }, [tipo, id]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const resumen = {
    total: contactos.length,
    compradores: contactos.filter((c) => c.origenes.includes('comprador')).length,
    conWhatsapp: contactos.filter((c) => c.aceptaWhatsapp).length,
  };
  // `contarPorSegmento` (`libs/data/crm.js:108-115`): el piso es siempre `aceptaWhatsapp`.
  const conWhatsapp = contactos.filter((c) => c.aceptaWhatsapp);
  const whatsapp = {
    todos: conWhatsapp.length,
    compradores: conWhatsapp.filter((c) => c.origenes.includes('comprador')).length,
    seguidores: conWhatsapp.filter((c) => c.origenes.includes('seguidor')).length,
  };

  return {
    cargando, error, recargar,
    tenant, contactos, resumen, whatsapp, eventosActivos,
    cuenta, suscripciones, moneda, precioSugerido, errorSuscripcion,
    correo, errorCorreo,
  };
}
