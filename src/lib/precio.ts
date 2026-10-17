/** Spec 116 — comisión de plataforma sobre el precio que pone el músico o el local.
 * Misma constante que sonopolisWeb/libs/mappers.js — si cambia en un repo, cambia en el otro. */
export const RECARGO_PLATAFORMA = 0.1;

/**
 * `precio` es texto libre que escribe el músico ("$5.000", "$1,200.00"); `monto`
 * es el entero que Mercado Pago cobra. El formulario solo captura el primero, así
 * que el segundo se deriva: sin esto `monto` queda NULL y la compra se bloquea con
 * "Sin precio".
 *
 * Spec 116 — port de `montoDesdePrecio` de sonopolisWeb (W-167): 1 o 2 dígitos
 * después del último separador son centavos y se descartan, sin preguntar el país
 * ("$5.000" -> 5000, "$1,200.00" -> 1200). Antes la app quitaba todo lo que no
 * fuera dígito y "$1,200.00" cobraba 120000. El resultado incluye el recargo de
 * plataforma: el comprador paga precio + 10 %, el local recibe el precio íntegro.
 */
export function montoDesdePrecio(precio: string | undefined | null): number {
  const sinCentavos = (precio ?? '').trim().replace(/[.,]\d{1,2}$/, '');
  const digitos = sinCentavos.replace(/\D/g, '');
  if (!digitos) return 0;
  return Math.round(parseInt(digitos, 10) * (1 + RECARGO_PLATAFORMA));
}

/** Separador de miles por moneda; CLP y moneda desconocida usan punto, como la web. */
const SEPARADOR_MILES: Record<string, string> = { CLP: '.', MXN: ',' };

/**
 * Spec 119 — port de `formatearMonto` de sonopolisWeb/libs/moneda.js (W-167):
 * `$5.000 CLP` · `$1,320 MXN` · `$5.000` sin moneda (país sin fila en
 * `paises_cobro`). El código va siempre que se conoce: con dos países, "$500"
 * no dice si son pesos chilenos o mexicanos.
 *
 * Sin `toLocaleString`: el soporte de locales de `Intl` en Hermes (el motor JS de
 * React Native) no está garantizado en todos los builds, y un precio no puede
 * depender de eso. Los montos son enteros (`events.monto integer`).
 */
export function formatearMonto(monto: number | null | undefined, moneda: string | null | undefined): string {
  const sep = (moneda && SEPARADOR_MILES[moneda]) || '.';
  const n = String(Math.round(monto ?? 0)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return moneda ? `$${n} ${moneda}` : `$${n}`;
}
