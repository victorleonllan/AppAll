// Spec 119 — fechas de la Cartelera, port de sonopolisWeb/components/Cartelera.js.
// Todo en la hora local del teléfono (la web usa la del navegador, `Cartelera.js:61`).
//
// Sin `Intl.DateTimeFormat` ni `toLocaleString`: el soporte de locales de `Intl`
// en Hermes (el motor JS de React Native) no está garantizado en todos los builds.

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export type FiltroFecha = 'todos' | 'hoy' | 'finde' | 'semana';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "YYYY-MM-DD" en hora local. Slicear el ISO (que es UTC) corre el día de los
 * eventos entre las 21:00 y las 00:00 en Chile. */
export function claveDiaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Sábado 18 de octubre". */
export function formatearDiaLargo(iso: string): string {
  const d = new Date(iso);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** [inicio, fin) en hora local, o null para "todos". Copia de `Cartelera.js:77`:
 * "hoy" depende de quién mira la pantalla. */
export function rangoFecha(filtro: FiltroFecha): [Date, Date] | null {
  const ahora = new Date();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

  if (filtro === 'hoy') {
    const fin = new Date(inicioHoy);
    fin.setDate(fin.getDate() + 1);
    return [inicioHoy, fin];
  }
  if (filtro === 'semana') {
    const fin = new Date(inicioHoy);
    fin.setDate(fin.getDate() + 7);
    return [inicioHoy, fin];
  }
  if (filtro === 'finde') {
    const diasHastaSabado = (6 - inicioHoy.getDay() + 7) % 7;
    const inicio = new Date(inicioHoy);
    inicio.setDate(inicio.getDate() + diasHastaSabado);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 2);
    return [inicio, fin];
  }
  return null;
}

/**
 * ISO de la medianoche de hoy en el teléfono. La web corta los externos en la
 * medianoche del país que se mira (`inicioDeHoyEn(pais)`); calcular otro huso pide
 * `Intl` con `timeZone`, el mismo riesgo de Hermes. Solo difiere si alguien mira
 * la cartelera de un país con otro huso que el suyo, y entonces se muestran u
 * ocultan unas horas de eventos de hoy.
 */
export function inicioDeHoyLocal(): string {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString();
}
