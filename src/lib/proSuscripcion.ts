import { supabase } from './supabase';
import { errorLegible, TipoTenant } from './adminPro';
import { MiSuscripcionPro } from './pro';

/**
 * Spec 168 — la suscripción a Pro del dueño, con su sesión. Port de `getMiSuscripcionPro`
 * y `cancelarMiSuscripcionPro` (sonopolisWeb/libs/data/proSuscripcion.js, W-264).
 * Lo puro (tipo y fechas) vive en `./pro`; acá solo la red.
 */

/** Su suscripción más reciente o null (sin suscripción, o quien llama no es la cuenta
 * dueña: Postgres devuelve cero filas, spec 161). */
export async function getMiSuscripcionPro(tipo: TipoTenant, id: string): Promise<MiSuscripcionPro | null> {
  const { data, error } = await supabase.rpc('pro_mi_suscripcion', {
    p_tenant_type: tipo,
    p_tenant_id: id,
  });
  if (error) throw error;
  const fila = (data as any[] | null)?.[0];
  if (!fila) return null;
  return {
    estado: fila.estado,
    monto: Number(fila.monto),
    moneda: fila.moneda,
    ultimoPagoAt: fila.ultimo_pago_at,
    proximoCobroAt: fila.proximo_cobro_at,
    proHasta: fila.pro_hasta,
    canceladaAt: fila.cancelada_at,
  };
}

/** Cancela en Mercado Pago (Edge Function `cancelar-suscripcion-pro`, spec 162). Un
 * 403/409 se lanza con el motivo del cuerpo («No tienes una suscripción activa»). */
export async function cancelarMiSuscripcionPro(tipo: TipoTenant, id: string): Promise<{ proHasta: string }> {
  const { data, error } = await supabase.functions.invoke('cancelar-suscripcion-pro', {
    body: { tenant_type: tipo, tenant_id: id },
  });
  if (error) throw await errorLegible(error);
  return { proHasta: data.pro_hasta };
}
