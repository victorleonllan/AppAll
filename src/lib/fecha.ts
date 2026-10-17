// Spec 116 — punto único donde se arma `comienza_at` a partir de fecha y hora, y
// se deriva el texto en español que siguen leyendo las pantallas mientras las tres
// columnas convivan. Port de sonopolisWeb/libs/fecha.js (W-007), mismos nombres.
//
// Supuesto heredado de la web: la hora se interpreta en el huso del dispositivo,
// que se asume el del evento. Es falso para quien carga un show en otro país.

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "2026-08-15" -> "15 de agosto". Parseo manual: `new Date("2026-08-15")` es UTC
 * y al formatearlo en hora local puede correr el día hacia atrás. */
export function formatearFechaEs(fechaISO: string): string {
  const [, mes, dia] = fechaISO.split('-').map(Number);
  return `${dia} de ${MESES[mes - 1]}`;
}

/** fechaISO ("YYYY-MM-DD") + horaISO ("HH:mm") -> comienzaAt (ISO con zona) y los
 * textos `fecha`/`hora` que siguen leyendo las pantallas viejas. Se interpretan en la
 * hora local del dispositivo, igual que la web en el navegador. Arma las tres a la
 * vez a propósito: si un formulario escribiera solo `comienzaAt`, las pantallas que
 * leen `fecha`/`hora` quedarían vacías. */
export function armarFechaHora(
  fechaISO: string,
  horaISO: string
): { comienzaAt: string; fecha: string; hora: string } {
  const comienzaAt = new Date(`${fechaISO}T${horaISO}:00`).toISOString();
  return { comienzaAt, fecha: formatearFechaEs(fechaISO), hora: horaISO };
}

/** El sentido inverso, para precargar un formulario al editar. */
export function separarFechaHora(
  comienzaAt: string | null | undefined
): { fechaISO: string; horaISO: string } {
  if (!comienzaAt) return { fechaISO: '', horaISO: '' };
  const d = new Date(comienzaAt);
  const fechaISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const horaISO = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { fechaISO, horaISO };
}

/** Spec 135 — si el par fecha/hora del formulario arma un `comienzaAt` real. Formato
 * solo no alcanza: "2026-02-31" pasa la regex, y según el motor el `Date` sale
 * inválido o corrido al 3 de marzo; por eso además se compara el día armado con el
 * pedido. La hora no se compara: en el día del cambio de horario las 00:00 pueden no
 * existir y el motor las corre a la 01:00, y eso no es un error de quien escribe. */
export function fechaHoraValidas(fechaISO: string, horaISO: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaISO) || !/^\d{2}:\d{2}$/.test(horaISO)) return false;
  const d = new Date(`${fechaISO}T${horaISO}:00`);
  if (Number.isNaN(d.getTime())) return false;
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return d.getFullYear() === anio && d.getMonth() + 1 === mes && d.getDate() === dia;
}
