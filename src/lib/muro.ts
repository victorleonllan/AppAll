/**
 * Spec 186 — el muro de un local o banda: los correos que mandó a su público y los
 * flyers de sus eventos pasados, con los comentarios de la gente.
 * Port de `sonopolisWeb/libs/muro.js` (W-279). Módulo puro: sin imports, sin red.
 */

export const MAX_COMENTARIO = 500;
export const MAX_ENTRADAS = 30;

export interface ComentarioMuro {
  id: string;
  autorId: string;
  autorNombre: string;
  cuerpo: string;
  fecha: string;
}

export interface EntradaMuro {
  clave: string;                 // "correo:<id>" | "evento:<id>"
  tipo: 'correo' | 'evento';
  id: string;
  fecha: string;                 // created_at del correo o comienza_at del evento
  titulo: string;                // asunto del correo o artist_name del evento
  cuerpo: string | null;         // solo correo
  imagen: string | null;         // solo evento (el flyer)
  venue: string | null;          // solo evento (venue_name)
  comentarios: ComentarioMuro[]; // del más viejo al más nuevo
}

/** Milisegundos de una fecha ISO; una fecha ilegible vale 0 y queda al final del muro. */
function instante(fecha: unknown): number {
  const ms = Date.parse(String(fecha ?? ''));
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Mezcla publicaciones (filas de `muro_publicaciones`) y eventos pasados (filas de
 * `muro_eventos_pasados`) en una sola lista, de lo más nuevo a lo más viejo, corta las
 * primeras `MAX_ENTRADAS` y le cuelga a cada entrada sus comentarios (filas de
 * `muro_comentarios`), del más viejo al más nuevo.
 *
 * No modifica sus argumentos: cada lista se copia antes de ordenar. Un comentario cuyo
 * destino no quedó en la lista (la publicación se quitó o cayó fuera del corte) se descarta.
 */
export function armarMuro(publicaciones: any[], eventos: any[], comentarios: any[]): EntradaMuro[] {
  const correos: EntradaMuro[] = (publicaciones ?? []).map((p) => ({
    clave: `correo:${p.id}`,
    tipo: 'correo',
    id: p.id,
    fecha: p.created_at,
    titulo: p.titulo,
    cuerpo: p.cuerpo ?? null,
    imagen: null,
    venue: null,
    comentarios: [],
  }));
  const flyers: EntradaMuro[] = (eventos ?? []).map((e) => ({
    clave: `evento:${e.id}`,
    tipo: 'evento',
    id: e.id,
    fecha: e.comienza_at,
    titulo: e.artist_name ?? '',
    cuerpo: null,
    imagen: e.imagen ?? null,
    venue: e.venue_name ?? null,
    comentarios: [],
  }));

  const entradas = [...correos, ...flyers]
    .sort((a, b) => instante(b.fecha) - instante(a.fecha))
    .slice(0, MAX_ENTRADAS);

  const porClave = new Map<string, EntradaMuro>();
  for (const entrada of entradas) porClave.set(entrada.clave, entrada);

  const enOrden = [...(comentarios ?? [])].sort((a, b) => instante(a.created_at) - instante(b.created_at));
  for (const c of enOrden) {
    // Un comentario es de una publicación o de un evento, nunca de los dos (spec 185).
    const clave = c.publicacion_id ? `correo:${c.publicacion_id}` : c.event_id ? `evento:${c.event_id}` : null;
    const destino = clave ? porClave.get(clave) : undefined;
    if (!destino) continue;
    destino.comentarios.push({
      id: c.id,
      autorId: c.autor_id,
      autorNombre: c.autor_nombre,
      cuerpo: c.cuerpo,
      fecha: c.created_at,
    });
  }

  return entradas;
}

/** Mensaje para la persona a partir del error de `muro_comentar` (spec 185), que
 * manda su código en `message`. */
export function mensajeErrorMuro(error: { message?: string } | null): string {
  const mensaje = error?.message ?? '';
  if (mensaje.includes('sin_sesion')) return 'Inicia sesión para comentar.';
  if (mensaje.includes('comentario_invalido')) return 'El comentario va de 1 a 500 caracteres.';
  if (mensaje.includes('demasiados_comentarios')) return 'Estás comentando muy rápido. Espera unos minutos.';
  if (mensaje.includes('destino_desconocido')) return 'Esa publicación ya no está en el muro.';
  return 'No se pudo guardar. Intenta de nuevo.';
}
