// Spec 164 — tickets especiales: packs 2x1 a 5x1 con cupo propio, vendidos en
// paralelo a la entrada normal (W-252). Port de sonopolisWeb/libs/data/especiales.js
// (W-254, W-255) con las mismas funciones y textos. Tabla aparte de `event_preventas`
// a propósito: la escalera de preventas tiene orden, nombre automático y regla de
// cierre; el pack no tiene ninguna de las tres. Quién puede escribir lo decide la RLS
// (`can_edit_event`); acá solo se lee y se escribe.
//
// Los tipos viven acá y no en `src/types/index.ts`: el pack no lo usa nadie fuera de
// este módulo y de sus pantallas (spec 164, Decisión 1).

import { supabase } from './supabase';
import { montoDesdePrecio } from './precio';

/** Fila de `event_tickets_especiales` (W-252). `cupo` y `vendidos` cuentan packs. */
export type TicketEspecial = {
  id: string;
  eventId: string;
  nombre: string;
  multiplicador: number;
  precio: string;
  monto: number;
  cupo: number;
  vendidos: number;
  activa: boolean;
  createdAt: string;
};

/** Pack armado en el formulario antes de que el evento exista. */
export type BorradorEspecial = { multiplicador: number; precio: string; cupo: number; nombre: string };

export type CambiosEspecial = Partial<
  Pick<TicketEspecial, 'precio' | 'cupo' | 'multiplicador' | 'nombre' | 'activa'>
>;

/** Fila de `especiales_vigentes_de` (W-253 §1). */
export type EspecialVigente = {
  id: string;
  nombre: string;
  multiplicador: number;
  precio: string;
  monto: number;
  restantes: number;
  moneda: string | null;
};

export const MULTIPLICADORES = [2, 3, 4, 5] as const;

/** Nombre por defecto cuando el organizador no pone uno: «3x1». */
export const nombreDeEspecial = (multiplicador: number) => `${multiplicador}x1`;

/** «3x1», o «Amigos (3x1)» si el organizador le puso nombre propio: el multiplicador
 * no se pierde aunque el nombre no lo diga. */
export function etiquetaDeEspecial(e: { nombre: string | null; multiplicador: number }): string {
  const porDefecto = nombreDeEspecial(e.multiplicador);
  return !e.nombre || e.nombre === porDefecto ? porDefecto : `${e.nombre} (${porDefecto})`;
}

/** Tope de create-preference (MAX_CANTIDAD_POR_COMPRA): 10 entradas por compra. Con un
 * pack se compara contra entradas (`packs × multiplicador`, W-253), no contra packs. */
export const TOPE_ENTRADAS_POR_COMPRA = 10;

/** Packs que caben en una compra: 10 / 3 → 3. Mínimo 1. */
export const maxPacksPorCompra = (multiplicador: number) =>
  Math.max(1, Math.floor(TOPE_ENTRADAS_POR_COMPRA / multiplicador));

/** Texto del error o null. Mismos textos que `validar` de TicketsEspecialesManager.js.
 * Se valida en el cliente porque la base lo rechaza recién por CHECK (`cupo > 0`,
 * `monto > 0`), con el evento ya creado. */
export function validarBorradorEspecial(b: { precio: string; cupo: number | null }): string | null {
  if (montoDesdePrecio(b.precio) <= 0) {
    return 'Falta el precio del pack — escribe un número, p. ej. $10.000';
  }
  if (!Number.isInteger(b.cupo) || (b.cupo as number) <= 0) {
    return 'Faltan las unidades — cuántos packs vendes (un entero mayor que 0)';
  }
  return null;
}

/** Misma regex que BotonComprar.js de la web (W-260). Solo marca lo que claramente no
 * es un correo; la validación que manda es la de la Edge Function y el CHECK de W-258. */
export const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Índice del primer correo escrito y mal formado, o -1. Los vacíos no cuentan. */
export function primerDestinatarioInvalido(valores: string[]): number {
  return valores.findIndex((v) => {
    const correo = v.trim();
    return correo !== '' && !CORREO_VALIDO.test(correo);
  });
}

function mapEspecialFromDB(db: any): TicketEspecial {
  return {
    id: db.id,
    eventId: db.event_id,
    nombre: db.nombre,
    multiplicador: db.multiplicador,
    precio: db.precio,
    monto: db.monto,
    cupo: db.cupo,
    vendidos: db.vendidos ?? 0,
    activa: db.activa,
    createdAt: db.created_at,
  };
}

// --- Organizador (lanzan: quien edita necesita saber que no se guardó) -------------

export async function listarEspeciales(eventoId: string): Promise<TicketEspecial[]> {
  const { data, error } = await supabase
    .from('event_tickets_especiales')
    .select('*')
    .eq('event_id', eventoId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapEspecialFromDB);
}

/** `monto` sale de `precio` con la misma función que las preventas (precio + 10 % de
 * recargo): el pack no tiene fórmula propia (W-254). `cupo` son packs. */
export async function crearEspecial(eventoId: string, b: BorradorEspecial): Promise<TicketEspecial> {
  const { data, error } = await supabase
    .from('event_tickets_especiales')
    .insert({
      event_id: eventoId,
      nombre: b.nombre?.trim() || nombreDeEspecial(b.multiplicador),
      multiplicador: b.multiplicador,
      precio: b.precio,
      monto: montoDesdePrecio(b.precio),
      cupo: b.cupo,
    })
    .select()
    .single();
  if (error) throw error;
  return mapEspecialFromDB(data);
}

/** Update parcial: `monto` se recalcula solo si viene `precio` (si no,
 * `montoDesdePrecio(undefined)` daría 0 y pisaría el real). */
export async function actualizarEspecial(id: string, cambios: CambiosEspecial): Promise<TicketEspecial> {
  const out: Record<string, any> = {};
  if (cambios.precio !== undefined) {
    out.precio = cambios.precio;
    out.monto = montoDesdePrecio(cambios.precio);
  }
  if (cambios.cupo !== undefined) out.cupo = cambios.cupo;
  if (cambios.multiplicador !== undefined) out.multiplicador = cambios.multiplicador;
  if (cambios.nombre !== undefined) out.nombre = cambios.nombre;
  if (cambios.activa !== undefined) out.activa = cambios.activa;

  const { data, error } = await supabase
    .from('event_tickets_especiales')
    .update(out)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return mapEspecialFromDB(data);
}

/** Deja de venderse aunque le quede cupo. Nunca borra la fila: `tickets.especial_id`
 * es ON DELETE RESTRICT (W-252), un pack con compras se cierra. */
export async function cerrarEspecial(id: string): Promise<TicketEspecial> {
  return actualizarEspecial(id, { activa: false });
}

/**
 * Los packs que el formulario armó antes de que el evento existiera. Se llama después
 * del insert del evento: la RLS exige poder editar un evento que tiene que existir.
 *
 * Valida todos antes del primer insert y después inserta de a uno, en orden: un fallo
 * deja un estado claro, los anteriores creados y el resto no (FormEvento.js de la web).
 */
export async function crearEspecialesDeBorrador(
  eventoId: string,
  borradores: BorradorEspecial[]
): Promise<TicketEspecial[]> {
  for (const b of borradores) {
    const problema = validarBorradorEspecial(b);
    if (problema) throw new Error(problema);
  }
  const creados: TicketEspecial[] = [];
  for (const b of borradores) {
    creados.push(await crearEspecial(eventoId, b));
  }
  return creados;
}

// --- Fan (nunca lanzan: un pack que no se pudo consultar es un pack que no se ofrece) -

/** Packs que el fan puede comprar ahora, vía `especiales_vigentes_de` (W-253): la
 * función ya descuenta los pendientes de pago y respeta el cierre de la venta, así que
 * `restantes` es lo que de verdad se puede pedir. Si falla, `[]`. */
export async function getEspecialesVigentes(eventoId: string): Promise<EspecialVigente[]> {
  try {
    const { data, error } = await supabase.rpc('especiales_vigentes_de', { p_event: eventoId });
    if (error) throw error;
    return ((data ?? []) as any[]).map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      multiplicador: fila.multiplicador,
      precio: fila.precio,
      monto: fila.monto,
      restantes: fila.restantes,
      moneda: fila.moneda ?? null,
    }));
  } catch (err) {
    console.error(`[evento ${eventoId}] especiales_vigentes_de falló:`, err);
    return [];
  }
}

const LOTE_EVENTOS = 50;

/**
 * Para la cartelera: el multiplicador más chico de cada evento con algún pack a la
 * venta, en una consulta por lote de 50 ids, no una por tarjeta (W-255 §5).
 *
 * Lee la tabla y no la función: es más laxa (no mira pendientes ni el cierre de la
 * venta) y alcanza para una píldora; quien decide qué se compra es el detalle.
 * `vendidos < cupo` se filtra acá porque PostgREST no compara dos columnas.
 * Si falla, Map vacío: la cartelera se ve sin píldoras, no rota.
 */
export async function getPacksMinimosDeEventos(eventoIds: string[]): Promise<Map<string, number>> {
  const porEvento = new Map<string, number>();
  if (!eventoIds.length) return porEvento;
  try {
    const lotes: string[][] = [];
    for (let i = 0; i < eventoIds.length; i += LOTE_EVENTOS) {
      lotes.push(eventoIds.slice(i, i + LOTE_EVENTOS));
    }
    const respuestas = await Promise.all(
      lotes.map((ids) =>
        supabase
          .from('event_tickets_especiales')
          .select('event_id, multiplicador, cupo, vendidos')
          .in('event_id', ids)
          .eq('activa', true)
      )
    );
    for (const { data, error } of respuestas) {
      if (error) throw error;
      for (const fila of (data ?? []) as any[]) {
        if ((fila.vendidos ?? 0) >= fila.cupo) continue;
        const actual = porEvento.get(fila.event_id);
        if (actual == null || fila.multiplicador < actual) {
          porEvento.set(fila.event_id, fila.multiplicador);
        }
      }
    }
    return porEvento;
  } catch (err) {
    console.error('[cartelera] packs especiales de los eventos fallaron:', err);
    return new Map();
  }
}

/** El pack con que se compró un ticket, la cantidad y los correos de las entradas
 * extra. Mencionarlos es un extra: cualquier error devuelve los tres campos vacíos y
 * nunca rompe la confirmación. El dueño del ticket lo lee con su sesión (RLS). */
export async function getPackDeTicket(ticketId: string): Promise<{
  especial: { nombre: string; multiplicador: number } | null;
  cantidad: number | null;
  destinatariosExtra: string[];
}> {
  const vacio = { especial: null, cantidad: null, destinatariosExtra: [] as string[] };
  try {
    const { data: ticket, error } = await supabase
      .from('tickets')
      .select('especial_id, cantidad, destinatarios_extra')
      .eq('id', ticketId)
      .maybeSingle();
    if (error) throw error;
    if (!ticket) return vacio;

    let especial: { nombre: string; multiplicador: number } | null = null;
    if (ticket.especial_id) {
      const { data, error: errorPack } = await supabase
        .from('event_tickets_especiales')
        .select('nombre, multiplicador')
        .eq('id', ticket.especial_id)
        .maybeSingle();
      if (errorPack) throw errorPack;
      especial = data ? { nombre: data.nombre, multiplicador: data.multiplicador } : null;
    }
    return {
      especial,
      cantidad: ticket.cantidad ?? null,
      destinatariosExtra: (ticket.destinatarios_extra as string[] | null) ?? [],
    };
  } catch (err) {
    console.error(`[ticket ${ticketId}] no se pudo leer su pack:`, err);
    return vacio;
  }
}
