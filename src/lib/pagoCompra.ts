// Spec 151 — crea el cobro con la Edge Function de la pasarela elegida y normaliza la
// respuesta. Port de `crearPagoCompra` y `mensajeDeError` de sonopolisWeb/libs/purchase.js
// (W-189). Sin llamadores hasta el spec 160: DetalleEventoScreen sigue con pedirPreferencia.

import { Platform } from 'react-native';
import { supabase } from './supabase';
import { Pasarela } from './pasarelas';

export type PagoCreado = {
  checkoutUrl: string;
  ticketId: string | null;
  ticketRef: string | null;
};

/** Error de la Edge Function con su código (`pasarela_inactiva`, `sin_cupo`...). */
export class ErrorPago extends Error {
  constructor(public codigo: string | null, public httpStatus: number, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorPago';
  }
}

// Una Edge Function por pasarela, el mismo mapa que la web (spec 105, Decisión 2).
const FUNCION_DE_PASARELA: Record<Pasarela, string> = {
  mercadopago: 'create-preference',
  flow: 'create-payment-flow',
};

export async function crearPagoCompra(args: {
  eventoId: string;
  userId: string;
  pasarela: Pasarela;
  cantidad?: number; // 1 por defecto
}): Promise<PagoCreado> {
  const { eventoId, userId, pasarela, cantidad = 1 } = args;
  const funcion = FUNCION_DE_PASARELA[pasarela];

  // Las dos funciones identifican al comprador con supabase.auth.getUser(). Con la anon
  // key eso devuelve null y cortan en 401: hay que mandar el access_token de la sesión.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ErrorPago(null, 401, 'Sesión no encontrada');

  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${funcion}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({
        evento_id: eventoId,
        user_id: userId,
        cantidad,
        // Regla de plataforma, no de la pantalla: en nativo la vuelta tiene que reabrir la
        // app (specs 117 y 147); en el build web, volver a la web.
        ...(Platform.OS !== 'web' ? { origen: 'app' } : {}),
      }),
    }
  );

  if (!res.ok) {
    const detalle = await res.text();
    let codigo: string | null = null;
    try {
      codigo = JSON.parse(detalle)?.error ?? null;
    } catch {
      // Respuesta no-JSON (un 502 del gateway, por ejemplo): sin código.
    }
    throw new ErrorPago(codigo, res.status, `${funcion} ${res.status}: ${detalle}`);
  }

  const data = (await res.json()) as {
    checkout_url?: string;
    init_point?: string;
    sandbox_init_point?: string;
    ticket_id?: string;
    ticket_ref?: string;
  };

  // `checkout_url` (Flow) o `init_point` (Mercado Pago). Con credenciales de prueba
  // `init_point` ya opera en modo test; `sandbox_init_point` es el flujo viejo.
  const checkoutUrl = data.checkout_url ?? data.init_point ?? data.sandbox_init_point;
  if (!checkoutUrl) throw new ErrorPago(null, 200, 'Respuesta sin link de pago');

  return {
    checkoutUrl,
    ticketId: data.ticket_id ?? null,
    ticketRef: data.ticket_ref ?? null,
  };
}

/** Texto para mostrar al comprador. Mismos textos que `mensajeDeError` de la web; el
 * volcado técnico del caso por defecto queda en el log, no en pantalla. */
export function mensajeErrorPago(err: unknown): string {
  const codigo = err instanceof ErrorPago ? err.codigo : null;
  switch (codigo) {
    case 'sin_cupo':
    case 'sin_cupo_preventa':
      return 'No quedan entradas suficientes para esa cantidad';
    case 'cantidad_invalida':
      return 'Esa cantidad de entradas no está permitida';
    case 'pais_sin_cobro':
      return 'La venta de entradas en este país todavía no está habilitada';
    case 'pasarela_inactiva':
      return 'Ese medio de pago no está disponible para este evento';
    case 'flow_create_failed':
      return 'Flow no pudo iniciar el pago. Intenta de nuevo o paga con otro medio';
    default:
      return 'No se pudo procesar la compra';
  }
}
