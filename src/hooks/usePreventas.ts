import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { montoDesdePrecio } from '../lib/precio';
import { BorradorPreventa, CierreTipo, Preventa } from '../types';

/**
 * Spec 135 — preventas de un evento con precio `puerta` (spec 064). Port de
 * sonopolisWeb/libs/data/preventas.js: qué preventa está vigente al comprar lo
 * decide `precio_vigente_de` en Postgres (spec 065, `usePrecioVigente`); acá solo
 * se lee y se escribe la lista.
 */

/** Copia del DEFAULT de `cierre_tipo`/`cierre_horas_antes` (spec 082): el cliente no
 * puede leer el default de Postgres y el formulario lo muestra como «Recomendado»
 * antes de insertar. Si cambia allá, cambia acá. */
export const CIERRE_RECOMENDADO: { cierreTipo: CierreTipo; cierreHorasAntes: number } = {
  cierreTipo: 'horas_antes',
  cierreHorasAntes: 3,
};

type Cierre = Pick<BorradorPreventa, 'cierreTipo' | 'cierreHorasAntes' | 'cierreAt'>;

/** Una regla de cierre está completa cuando la base la aceptaría (constraint
 * `event_preventas_cierre_completo`, spec 082). */
export function cierreCompleto(c: Cierre): boolean {
  if (c.cierreTipo === 'fecha') return Boolean(c.cierreAt);
  return (
    c.cierreTipo === 'horas_antes' &&
    Number.isInteger(c.cierreHorasAntes) &&
    (c.cierreHorasAntes as number) >= 0
  );
}

const ERROR_SIN_CUPO = 'Falta el cupo de la preventa — toda preventa necesita un límite';

/** Spec 068: `cupo` es NOT NULL. Se valida antes de ir a la base para que el
 * mensaje diga qué falta y no un 23502. */
function exigirCupo(cupo: number | null | undefined) {
  if (cupo == null || !(cupo > 0)) throw new Error(ERROR_SIN_CUPO);
}

/** El cierre viaja como trío: la constraint exige la regla completa, así que la
 * columna que no corresponde al tipo va en null. */
function cierreToDB(c: Cierre) {
  return {
    cierre_tipo: c.cierreTipo,
    cierre_horas_antes: c.cierreTipo === 'horas_antes' ? c.cierreHorasAntes : null,
    cierre_at: c.cierreTipo === 'fecha' ? c.cierreAt : null,
  };
}

// `preventa_cierra_at` es una función de fila (spec 083) que PostgREST expone como
// columna calculada: el instante de cierre llega resuelto por Postgres.
const SELECT_PREVENTA = '*, preventa_cierra_at';

function mapPreventaFromDB(db: any): Preventa {
  return {
    id: db.id,
    eventId: db.event_id,
    nombre: db.nombre,
    orden: db.orden,
    precio: db.precio,
    monto: db.monto,
    cupo: db.cupo,
    vendidos: db.vendidos ?? 0,
    activa: db.activa,
    cierreTipo: (db.cierre_tipo as CierreTipo) ?? 'horas_antes',
    cierreHorasAntes: db.cierre_horas_antes ?? null,
    cierreAt: db.cierre_at ?? null,
    cierraAt: db.preventa_cierra_at ?? null,
    createdAt: db.created_at,
  };
}

/** El nombre y el orden los pone el cliente, no quien organiza («Preventa 1»,
 * «Preventa 2»…), siguiendo al orden más alto que exista: nunca se reciclan números
 * aunque se cierren preventas (`event_preventas_orden_unico`). */
async function insertarPreventa(eventoId: string, borrador: BorradorPreventa, orden: number): Promise<Preventa> {
  exigirCupo(borrador.cupo);
  const { data, error } = await supabase
    .from('event_preventas')
    .insert({
      event_id: eventoId,
      nombre: `Preventa ${orden}`,
      orden,
      precio: borrador.precio,
      monto: montoDesdePrecio(borrador.precio),
      cupo: borrador.cupo,
      ...cierreToDB(borrador),
    })
    .select(SELECT_PREVENTA)
    .single();
  if (error) throw error;
  return mapPreventaFromDB(data);
}

function siguienteOrden(existentes: { orden: number }[]): number {
  return existentes.reduce((max, p) => Math.max(max, p.orden), 0) + 1;
}

/**
 * Las preventas que el formulario armó antes de que el evento existiera. Se llama
 * después del insert del evento: la RLS de `event_preventas` exige
 * `can_edit_event`, que no se cumple sobre un evento que todavía no está.
 *
 * Secuencial, una por una, para que el orden de la base sea el del formulario. Los
 * cupos se validan todos antes del primer insert: un cupo 0 en la segunda no deja
 * la primera creada a medias.
 */
export async function crearPreventasDeBorrador(eventoId: string, borradores: BorradorPreventa[]): Promise<Preventa[]> {
  borradores.forEach((b) => exigirCupo(b.cupo));
  if (borradores.length === 0) return [];
  const { data, error } = await supabase.from('event_preventas').select('orden').eq('event_id', eventoId);
  if (error) throw error;
  let orden = siguienteOrden((data ?? []) as { orden: number }[]);
  const creadas: Preventa[] = [];
  for (const b of borradores) {
    creadas.push(await insertarPreventa(eventoId, b, orden));
    orden += 1;
  }
  return creadas;
}

export type CambiosPreventa = Partial<BorradorPreventa> & { activa?: boolean };

interface PreventasState {
  preventas: Preventa[];
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  crear: (borrador: BorradorPreventa) => Promise<Preventa>;
  actualizar: (id: string, cambios: CambiosPreventa) => Promise<Preventa>;
  cerrar: (id: string) => Promise<Preventa>;
}

/** Sin `eventoId` (formulario de un evento nuevo) no consulta: las preventas de ese
 * caso viven en el formulario y se crean con `crearPreventasDeBorrador`. */
export function usePreventas(eventoId: string | null | undefined): PreventasState {
  const [preventas, setPreventas] = useState<Preventa[]>([]);
  const [cargando, setCargando] = useState(Boolean(eventoId));
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!eventoId) {
      setPreventas([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('event_preventas')
        .select(SELECT_PREVENTA)
        .eq('event_id', eventoId)
        .order('orden', { ascending: true });
      if (error) throw error;
      setPreventas((data ?? []).map(mapPreventaFromDB));
    } catch (e: any) {
      console.error('[usePreventas]', e);
      setError(e?.message ?? 'No se pudieron cargar las preventas');
    } finally {
      setCargando(false);
    }
  }, [eventoId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  // `existentes` es la lista ya cargada: no hace falta otra consulta para saber el
  // siguiente número (mismo criterio que la web).
  const crear = useCallback(async (borrador: BorradorPreventa) => {
    if (!eventoId) throw new Error('El evento todavía no existe');
    const nueva = await insertarPreventa(eventoId, borrador, siguienteOrden(preventas));
    setPreventas((prev) => [...prev, nueva]);
    return nueva;
  }, [eventoId, preventas]);

  /** Parcial: `monto` se recalcula solo si viene `precio` (si no,
   * `montoDesdePrecio(undefined)` daría 0 y pisaría el real); el cierre viaja como
   * trío o no viaja. */
  const actualizar = useCallback(async (id: string, cambios: CambiosPreventa) => {
    const out: Record<string, any> = {};
    if (cambios.precio !== undefined) {
      out.precio = cambios.precio;
      out.monto = montoDesdePrecio(cambios.precio);
    }
    if (cambios.cupo !== undefined) {
      exigirCupo(cambios.cupo);
      out.cupo = cambios.cupo;
    }
    if (cambios.activa !== undefined) out.activa = cambios.activa;
    if (cambios.cierreTipo !== undefined) {
      Object.assign(out, cierreToDB({
        cierreTipo: cambios.cierreTipo,
        cierreHorasAntes: cambios.cierreHorasAntes ?? null,
        cierreAt: cambios.cierreAt ?? null,
      }));
    }
    const { data, error } = await supabase
      .from('event_preventas')
      .update(out)
      .eq('id', id)
      .select(SELECT_PREVENTA)
      .single();
    if (error) throw error;
    const actualizada = mapPreventaFromDB(data);
    setPreventas((prev) => prev.map((p) => (p.id === id ? actualizada : p)));
    return actualizada;
  }, []);

  /** Deja de venderse aunque le quede cupo. Nunca se borra la fila: los tickets
   * vendidos apuntan a ella. */
  const cerrar = useCallback((id: string) => actualizar(id, { activa: false }), [actualizar]);

  return { preventas, cargando, error, recargar, crear, actualizar, cerrar };
}
