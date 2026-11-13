import { useMemo } from 'react';
import { Paleta } from '../theme';
import { useTema } from '../context/TemaContext';

/**
 * Spec 173 — arma los estilos de una pantalla con la paleta activa. `crear` debe ser
 * una función a nivel de módulo (`const crearEstilos = (c: Paleta) =>
 * StyleSheet.create({...})`): su identidad es estable y las paletas son constantes,
 * así que los estilos solo se recalculan al cambiar el tema.
 */
export function useEstilos<T>(crear: (c: Paleta) => T): T {
  const { colores } = useTema();
  return useMemo(() => crear(colores), [crear, colores]);
}
