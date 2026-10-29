// Spec 151 — con qué pasarelas cobra cada país. Port de sonopolisWeb/libs/data/pasarelas.js
// (W-189): misma consulta a `pasarelas_cobro` (spec 104), que es el interruptor que
// comparten la web y la app.

import { supabase } from './supabase';

/** Valores del CHECK de `pasarelas_cobro.pasarela` (spec 104). */
export type Pasarela = 'mercadopago' | 'flow';

/** Nombre visible de cada pasarela, igual que `NOMBRE_PASARELA` de la web. */
export const NOMBRE_PASARELA: Record<Pasarela, string> = {
  mercadopago: 'Mercado Pago',
  flow: 'Flow',
};

/** Solo las pasarelas que esta versión de la app sabe cobrar. La web no filtra porque se
 * despliega junto con la base; una app instalada puede tener meses. */
function soloConocidas(pasarelas: string[]): Pasarela[] {
  return pasarelas.filter((p): p is Pasarela => p in NOMBRE_PASARELA);
}

/**
 * Pasarelas activas del país, en el orden en que se muestran
 * (`['mercadopago', 'flow']`). Sin filas devuelve `[]`: el país no vende.
 * Lanza si la consulta falla; quien llama decide qué mostrar.
 */
export async function getPasarelas(pais: string): Promise<Pasarela[]> {
  // Solo en desarrollo: `EXPO_PUBLIC_PASARELAS_LOCAL=mercadopago,flow` muestra el selector
  // del spec 160 aunque Flow esté apagado en la base (que es la de producción). `__DEV__` es
  // false en un build de tienda. Tocar «Pagar con Flow» igual responde `pasarela_inactiva`.
  const local: string | undefined = process.env.EXPO_PUBLIC_PASARELAS_LOCAL;
  if (__DEV__ && local) {
    return soloConocidas(local.split(',').map((p) => p.trim()).filter(Boolean));
  }

  const { data, error } = await supabase
    .from('pasarelas_cobro')
    .select('pasarela')
    .eq('pais', pais)
    .eq('activo', true)
    .order('orden');
  if (error) throw error;
  return soloConocidas((data ?? []).map((f) => f.pasarela as string));
}
