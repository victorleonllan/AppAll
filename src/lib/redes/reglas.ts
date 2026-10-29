// Spec 150 — validación de una publicación en redes. COPIA de
// sonopolisWeb/libs/redes/reglas.js (W-233), línea por línea y con los mismos
// mensajes: la API vuelve a correr la misma función y su 400 debe decir lo mismo
// que el redactor. La regla propia de la app (`validarEnApp`) va aparte, al final,
// para que la copia siga siendo comparable con la web.

import { REDES, Red } from './catalogo';

export type TipoMedio = 'imagen' | 'video';

export interface MedioRed {
  path: string;
  url: string;
  tipo: TipoMedio;
  ancho: number | null;
  alto: number | null;
  duracion: number | null;
}

export interface ValidacionPublicacion {
  ok: boolean;
  generales: string[];
  porRed: Partial<Record<Red, string[]>>;
}

export interface DatosPublicacion {
  texto: string;
  textosPorRed?: Partial<Record<Red, string>> | null;
  medios?: MedioRed[] | null;
  redes?: Red[] | null;
  programadaPara?: Date | string | null;
}

const URL_RE = /https?:\/\/\S+/g;
const LARGO_LINK_X = 23;
const MIN_ADELANTO_MS = 2 * 60 * 1000;
const MAX_ADELANTO_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_IMAGENES = 10;
const MIN_VIDEO_SEG = 3;

/**
 * Largo del texto como lo cuenta la red. En X cada URL cuenta 23 caracteres
 * (X la acorta a un t.co de ese largo). En las demás, por code points
 * (`[...texto]`), para que un emoji cuente como uno y no como dos.
 */
export function largoParaRed(texto: string | null | undefined, red: Red): number {
  const t = texto ?? '';
  if (red === 'x') {
    const links = t.match(URL_RE) ?? [];
    return [...t.replace(URL_RE, '')].length + links.length * LARGO_LINK_X;
  }
  return [...t].length;
}

/** El texto propio de la red si se editó, si no el general. */
export function textoPara(
  publicacion: { texto: string; textosPorRed?: Partial<Record<Red, string>> | null },
  red: Red
): string {
  return publicacion.textosPorRed?.[red] ?? publicacion.texto;
}

/**
 * → `{ ok, generales, porRed }`. Los mensajes van en español y se muestran
 * tal cual. `porRed` trae una entrada por cada red elegida (vacía si no tiene
 * problemas), para que la UI pueda marcar cada una.
 *
 * `programadaPara` llega como `Date`, como ISO o como `null` (publicar ahora).
 */
export function validarPublicacion(
  { texto, textosPorRed, medios, redes, programadaPara }: DatosPublicacion,
  ahora: Date | string | number = new Date()
): ValidacionPublicacion {
  const lista = medios ?? [];
  const elegidas = redes ?? [];
  const imagenes = lista.filter((m) => m.tipo === 'imagen');
  const videos = lista.filter((m) => m.tipo === 'video');
  const video = videos[0] ?? null;

  const generales: string[] = [];
  if (elegidas.length === 0) generales.push('Elige al menos una red');
  if (imagenes.length > 0 && videos.length > 0) {
    generales.push('Usa imágenes o un video, no los dos');
  }
  if (videos.length > 1) generales.push('Solo un video por publicación');
  if (imagenes.length > MAX_IMAGENES) generales.push(`Hasta ${MAX_IMAGENES} imágenes`);

  if (programadaPara != null) {
    const cuando = new Date(programadaPara).getTime();
    const base = new Date(ahora).getTime();
    if (Number.isNaN(cuando)) {
      generales.push('La fecha programada no es válida');
    } else if (cuando < base + MIN_ADELANTO_MS) {
      generales.push('Programa al menos 2 minutos hacia adelante');
    } else if (cuando > base + MAX_ADELANTO_MS) {
      generales.push('Programa hasta 90 días hacia adelante');
    }
  }

  const porRed: Partial<Record<Red, string[]>> = {};
  for (const red of elegidas) {
    const reglas = REDES[red];
    const errores: string[] = [];
    porRed[red] = errores;
    if (!reglas) {
      errores.push('Esta red no existe');
      continue;
    }

    const textoRed = textoPara({ texto, textosPorRed }, red) ?? '';
    if (textoRed.trim() === '' && lista.length === 0) {
      errores.push('Escribe algo o agrega una imagen');
    }
    const largo = largoParaRed(textoRed, red);
    if (largo > reglas.maxTexto) {
      errores.push(`Te pasas por ${largo - reglas.maxTexto} caracteres`);
    }
    if (reglas.requiereMedio && lista.length === 0) {
      errores.push(`${reglas.nombre} necesita una imagen o un video`);
    }
    if (imagenes.length > reglas.maxImagenes) {
      errores.push(`${reglas.nombre} acepta hasta ${reglas.maxImagenes} imágenes`);
    }
    if (video && typeof video.duracion === 'number') {
      if (video.duracion > reglas.maxVideoSeg) {
        errores.push(
          `El video dura más de lo que acepta ${reglas.nombre} (máx. ${reglas.maxVideoSeg} s)`
        );
      }
      if ((red === 'instagram' || red === 'tiktok') && video.duracion < MIN_VIDEO_SEG) {
        errores.push('El video debe durar al menos 3 segundos');
      }
    }
  }

  const ok =
    generales.length === 0 && Object.values(porRed).every((errores) => errores!.length === 0);
  return { ok, generales, porRed };
}

// ── Regla propia de la app ──────────────────────────────────────────────────

// Proporción (ancho/alto) que acepta el feed de Instagram: de 4:5 a 1,91:1.
const PROPORCION_MIN = 0.8;
const PROPORCION_MAX = 1.91;
const ERROR_PROPORCION_IG = 'Instagram acepta fotos de 4:5 a 1,91:1: recórtala o quita Instagram';

/**
 * `validarPublicacion` más la proporción de las fotos para Instagram. En la web
 * `prepararImagen` rellena con barras negras y esto nunca pasa; en la app el
 * relleno (`extent` de expo-image-manipulator) es solo web, así que sin esta regla
 * la foto llegaría a Instagram y fallaría a la hora programada, sin nadie mirando.
 */
export function validarEnApp(
  datos: DatosPublicacion,
  ahora: Date | string | number = new Date()
): ValidacionPublicacion {
  const resultado = validarPublicacion(datos, ahora);
  if (!(datos.redes ?? []).includes('instagram')) return resultado;

  const errores = resultado.porRed.instagram ?? [];
  for (const medio of datos.medios ?? []) {
    if (medio.tipo !== 'imagen' || !medio.ancho || !medio.alto) continue;
    const proporcion = medio.ancho / medio.alto;
    if (proporcion < PROPORCION_MIN || proporcion > PROPORCION_MAX) {
      errores.push(ERROR_PROPORCION_IG);
    }
  }
  const porRed = { ...resultado.porRed, instagram: errores };
  const ok =
    resultado.generales.length === 0 &&
    Object.values(porRed).every((lista) => lista!.length === 0);
  return { ok, generales: resultado.generales, porRed };
}
