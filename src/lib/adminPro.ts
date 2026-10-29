import { supabase } from './supabase';
import { URL_WEB } from '../constants/web';

/**
 * Spec 153 — Sonópolis Pro desde el admin de la app. Port de
 * sonopolisWeb/libs/data/proAdmin.js (W-212, W-243) y de `generarCodigoPro` de
 * libs/data/proSuscripcion.js (W-215). El permiso lo decide `es_admin_sonopolis()`
 * en Postgres, no este archivo. `esPro` y `esProSinVencimiento` viven en `./pro`
 * (spec 148): una sola copia de la regla en la app.
 */

export type TipoTenant = 'musician' | 'venue';

export const PRO_PRECIO_USD = 20; // copia de sonopolisWeb/config.js:28 (config.pro.precioUsd)
export const PLAZOS_PRO = [{ meses: 1, dias: 30 }, { meses: 3, dias: 90 }]; // BotonesPro.js:19-22

/** `dias` > 0 suma desde el vencimiento vigente (o desde hoy si venció); 0 apaga
 * Pro. Devuelve la nueva fecha de vencimiento (ISO). */
export async function darPro(tipo: TipoTenant, id: string, dias: number): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_dar_pro', {
    p_tenant_type: tipo,
    p_tenant_id: id,
    p_dias: dias,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** W-242 — Pro sin vencimiento y sin costo. Quitar: `darPro(tipo, id, 0)`. */
export async function darProSinVencimiento(tipo: TipoTenant, id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_pro_sin_vencimiento', {
    p_tenant_type: tipo,
    p_tenant_id: id,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Crea el código y su plan en Mercado Pago. La `url` la arma la Edge Function con
 * `APP_WEB_URL`; si no viene, se arma igual que `CodigoSuscripcionPro.js` de la web. */
export async function generarCodigoPro(
  tipo: TipoTenant,
  id: string,
  monto: number
): Promise<{ codigo: string; url: string }> {
  const { data, error } = await supabase.functions.invoke('crear-suscripcion-pro', {
    body: { tenant_type: tipo, tenant_id: id, monto },
  });
  if (error) throw await errorLegible(error);
  const codigo: string = data?.codigo;
  return { codigo, url: data?.url || `${URL_WEB}/pro/${codigo}` };
}

/**
 * Port de `errorLegible` (sonopolisWeb/libs/data/proSuscripcion.js:49-66).
 * `functions.invoke` envuelve cualquier no-2xx en «Edge Function returned a non-2xx
 * status code»; el mensaje útil (Postgres o Mercado Pago) viene en el cuerpo de la
 * respuesta, que queda en `error.context`.
 */
async function errorLegible(error: any): Promise<Error> {
  const respuesta = error?.context;
  if (!respuesta || typeof respuesta.text !== 'function') return error;
  let texto: string;
  try {
    texto = await respuesta.text();
  } catch {
    // El cuerpo ya se leyó o la conexión se cortó: queda el error genérico.
    return error;
  }
  let mensaje = texto;
  try {
    const cuerpo = JSON.parse(texto);
    mensaje = cuerpo?.detail || cuerpo?.error || cuerpo?.message || texto;
  } catch {
    // Cuerpo no JSON: se usa el texto tal cual.
  }
  return mensaje ? new Error(mensaje) : error;
}
