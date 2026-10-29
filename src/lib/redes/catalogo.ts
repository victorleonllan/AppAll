// Spec 150 — qué redes existen y qué acepta cada una. COPIA de
// sonopolisWeb/libs/redes/catalogo.js (W-233) y de `config.redes` de la web
// (sonopolisWeb/config.js). Un cambio de límite en la web obliga a cambiarlo acá:
// si divergen, la app deja pasar algo que la API rechaza con 400.

export type Red = 'instagram' | 'facebook' | 'threads' | 'x' | 'tiktok';

export interface ReglasRed {
  id: Red;
  nombre: string;
  proveedor: 'meta' | 'zernio';
  maxTexto: number;
  requiereMedio: boolean;
  maxImagenes: number;
  maxVideoSeg: number;
  linkClickeable: boolean;
  ayuda: string | null;
}

export const ORDEN_REDES: Red[] = ['instagram', 'facebook', 'threads', 'x', 'tiktok'];

export const REDES: Record<Red, ReglasRed> = {
  instagram: { id: 'instagram', nombre: 'Instagram', proveedor: 'meta',
               maxTexto: 2200, requiereMedio: true,  maxImagenes: 10, maxVideoSeg: 900,
               linkClickeable: false, ayuda: 'Necesitas una cuenta profesional (empresa o creador).' },
  facebook:  { id: 'facebook',  nombre: 'Facebook',  proveedor: 'meta',
               maxTexto: 63206, requiereMedio: false, maxImagenes: 10, maxVideoSeg: 14400,
               linkClickeable: true, ayuda: 'Publica en una página de Facebook que administres.' },
  threads:   { id: 'threads',   nombre: 'Threads',   proveedor: 'meta',
               maxTexto: 500,  requiereMedio: false, maxImagenes: 10, maxVideoSeg: 300,
               linkClickeable: true, ayuda: null },
  x:         { id: 'x',         nombre: 'X',         proveedor: 'zernio',
               maxTexto: 280,  requiereMedio: false, maxImagenes: 4,  maxVideoSeg: 140,
               linkClickeable: true, ayuda: 'En X cada link cuenta como 23 caracteres.' },
  tiktok:    { id: 'tiktok',    nombre: 'TikTok',    proveedor: 'zernio',
               maxTexto: 2200, requiereMedio: true,  maxImagenes: 35, maxVideoSeg: 600,
               linkClickeable: false, ayuda: 'Los videos se publican como públicos.' },
};

/** Topes por tenant, copia de `config.redes` de la web. */
export const TOPES_REDES = { maxPublicacionesDia: 10, maxPostsXMes: 30 };

export function esRed(valor: unknown): valor is Red {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(REDES, valor);
}
