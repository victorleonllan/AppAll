// Spec 150 — programar en la hora del local o banda. Copia de las funciones puras de
// sonopolisWeb/components/redes/RedactorPublicacion.js (W-238), con la zona como
// parámetro.
//
// La zona es la del tenant (`PAISES[pais].zonaHoraria`) y no la del teléfono: quien
// programa «el sábado a las 21» piensa en la hora de su local. Un teléfono con la zona
// mal puesta programaría a otra hora real.

const MIN_ADELANTO_MIN = 5;
const PASO_MS = 5 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

interface Partes {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

function partesEnZona(ms: number, zona: string): Partes {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms));
  const p = Object.fromEntries(partes.map((x) => [x.type, Number(x.value)])) as Record<string, number>;
  return { anio: p.year, mes: p.month, dia: p.day, hora: p.hour, minuto: p.minute, segundo: p.second };
}

/** Minutos que `zona` está adelantada a UTC en ese instante (Chile: -180 o -240). */
function offsetMinutos(ms: number, zona: string): number {
  const p = partesEnZona(ms, zona);
  return Math.round((Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - ms) / 60000);
}

/**
 * Fecha («2026-10-24») y hora («21:00») leídas en `zona` → ISO con el offset de esa
 * zona en ese instante («2026-10-24T21:00:00-03:00»). Dos pasadas para acertar el
 * offset en los días de cambio de horario. Fecha y hora van separadas porque así las
 * entregan `CampoFecha`/`CampoHora` (spec 144).
 */
export function aISOEnZona(fecha: string, hora: string, zona: string): string | null {
  const mf = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha ?? '');
  const mh = /^(\d{2}):(\d{2})$/.exec(hora ?? '');
  if (!mf || !mh) return null;
  const [anio, mes, dia] = mf.slice(1).map(Number);
  const [horas, minuto] = mh.slice(1).map(Number);
  const ingenuo = Date.UTC(anio, mes - 1, dia, horas, minuto);
  let offset = offsetMinutos(ingenuo, zona);
  offset = offsetMinutos(ingenuo - offset * 60000, zona);
  const abs = Math.abs(offset);
  return `${fecha}T${hora}:00${offset < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Ahora + 5 min, redondeado a los 5 minutos siguientes, en `zona`. */
export function minimoProgramable(zona: string): { fecha: string; hora: string } {
  const ms = Math.ceil((Date.now() + MIN_ADELANTO_MIN * 60000) / PASO_MS) * PASO_MS;
  const p = partesEnZona(ms, zona);
  return { fecha: `${p.anio}-${pad(p.mes)}-${pad(p.dia)}`, hora: `${pad(p.hora)}:${pad(p.minuto)}` };
}

/**
 * «sábado 24 de octubre, 21:00». A diferencia de la web, con `hourCycle: 'h23'` y sin
 * la coma tras el día: `es-CL` sin eso da «sábado, 24 de octubre, 09:00 p. m.».
 */
export function formatearProgramada(iso: string, zona: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: zona,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(iso))
    .replace(',', '');
}

/** «24 oct, 21:00» para el historial, copia de `formatearFechaHoraCorta` de la web. */
export function formatearFechaHoraCorta(iso: string | null | undefined, zona: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: zona,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}
