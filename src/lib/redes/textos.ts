// Spec 150 — el anuncio que se arma desde un evento para cada red. COPIA de
// sonopolisWeb/libs/redes/textos.js (W-233). Puro: lo usa el redactor para
// precargar el texto.

import { URL_WEB } from '../../constants/web';
import { PAISES } from '../../constants/paises';
import type { Evento } from '../../types';
import { REDES, Red } from './catalogo';
import { largoParaRed } from './reglas';

type EventoAnuncio = Pick<Evento, 'id' | 'artista' | 'venueName' | 'fecha' | 'hora' | 'comienzaAt' | 'pais'>;

const DOMINIO = URL_WEB.replace(/^https?:\/\//, '');

/**
 * «Sábado 24 de octubre», copia de `formatearFechaLarga` de sonopolisWeb/libs/fecha.js.
 * Privada: solo la usa el anuncio, y `src/lib/fecha.ts` lo tocan otros specs.
 * Con la zona del país del evento, no la del teléfono: el día de la semana de un show
 * de las 22:00 en Chile no puede depender de dónde esté quien publica.
 */
function formatearFechaLarga(
  comienzaAt: string | null | undefined,
  fechaCorta: string | null | undefined,
  pais: string | null | undefined
): string {
  if (!comienzaAt) return fechaCorta ?? '';
  const zona = (pais && PAISES[pais]?.zonaHoraria) || 'America/Santiago';
  const texto = new Intl.DateTimeFormat('es-CL', {
    timeZone: zona,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(comienzaAt));
  // Intl da "lunes, 18 de agosto" (minúscula, con coma) — se capitaliza el día y se
  // saca la coma para que lea como el resto de la UI.
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace(',', '');
}

/**
 * Link a la ficha del evento con UTM, para que la analítica distinga las visitas
 * que trae cada red.
 */
export function urlDelEvento(eventoId: string, red: Red): string {
  return `${URL_WEB}/cartelera/${eventoId}?utm_source=${red}&utm_medium=social&utm_campaign=crm`;
}

function armar(evento: EventoAnuncio, red: Red, artista: string): string {
  const reglas = REDES[red];
  const fechaLarga = formatearFechaLarga(evento.comienzaAt, evento.fecha, evento.pais);
  const lineas = [`🎶 ${artista}`];
  if (fechaLarga) lineas.push(`📅 ${fechaLarga}${evento.hora ? ` · ${evento.hora} h` : ''}`);
  if (evento.venueName) lineas.push(`📍 ${evento.venueName}`);
  // En Instagram y TikTok el link no es clickeable: se reemplaza por el texto.
  lineas.push(
    reglas?.linkClickeable === false
      ? `🎟️ Entradas en ${DOMINIO} (link en la bio)`
      : `🎟️ Entradas: ${urlDelEvento(evento.id, red)}`
  );
  return lineas.join('\n');
}

/**
 * Anuncio del evento. Si no entra en `maxTexto` de la red (en X el link cuenta 23),
 * se recorta `artista` con «…» hasta que entre.
 */
export function textoDelEvento(evento: EventoAnuncio, red: Red): string {
  const artista = evento.artista ?? '';
  let texto = armar(evento, red, artista);
  const max = REDES[red]?.maxTexto;
  if (!max || largoParaRed(texto, red) <= max) return texto;

  const letras = [...artista];
  for (let n = letras.length - 1; n >= 0; n--) {
    texto = armar(evento, red, `${letras.slice(0, n).join('').trimEnd()}…`);
    if (largoParaRed(texto, red) <= max) return texto;
  }
  return texto;
}
