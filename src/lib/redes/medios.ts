// Spec 150 — elegir, preparar y subir las fotos y videos de una publicación en redes.
// Hermano de sonopolisWeb/libs/redes/medios.js (W-236), con los mismos textos.
//
// `/api/redes/medios` solo firma `image/jpeg`, `video/mp4` y `video/quicktime`, así que
// toda imagen pasa a JPEG con expo-image-manipulator (sin `<canvas>` en nativo). Las
// barras negras de la web no se portan: `extent` es solo web; en su lugar
// `validarEnApp` (reglas.ts) avisa la proporción antes de publicar.
//
// El archivo sube directo al bucket con la URL firmada, sin pasar por Vercel, y con
// `XMLHttpRequest` en vez de `uploadToSignedUrl`: este usa `fetch`, que no informa
// progreso, y un video de 100 MB sin barra de avance parece colgado.

import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { firmarSubidaRed, TenantType } from './api';
import type { MedioRed, TipoMedio } from './reglas';

const ANCHO_MAXIMO = 1440;
const CALIDADES = [0.9, 0.8, 0.7];
const MAX_JPEG = 8 * 1024 * 1024; // lo que admite Instagram
const MAX_VIDEO = 100 * 1024 * 1024; // lo que admite el bucket `redes`
const TIPOS_VIDEO = ['video/mp4', 'video/quicktime'];
const TIPO_POR_EXTENSION: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime' };
const ESPERAS_REINTENTO_MS = [2000, 5000]; // 3 intentos en total

const ERROR_IMAGEN = 'No pudimos preparar la imagen';
const ERROR_PESO_IMAGEN = 'La imagen pesa demasiado para Instagram (máx. 8 MB)';
const ERROR_SUBIDA = 'No pudimos subir el archivo. Intenta de nuevo.';

// Las mismas variables que src/lib/supabase.ts; ese archivo no se toca.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export interface ArchivoElegido {
  uri: string;
  tipo: TipoMedio;
  mime: string | null;
  ancho: number;
  alto: number;
  duracionSeg: number | null;
  tamano: number | null;
}

/**
 * Una subida que no llegó. `reintentable` si fue error de red, timeout o 5xx.
 * `duplicado` si Storage dijo que el path ya existe (`statusCode: '409'`).
 */
export class ErrorSubida extends Error {
  status: number;
  reintentable: boolean;
  duplicado: boolean;

  constructor(status: number, reintentable: boolean, duplicado = false, mensaje = ERROR_SUBIDA) {
    super(mensaje);
    this.name = 'ErrorSubida';
    this.status = status;
    this.reintentable = reintentable;
    this.duplicado = duplicado;
  }
}

async function tamanoDe(uri: string): Promise<number> {
  const blob = await fetch(uri).then((r) => r.blob());
  return blob.size;
}

/**
 * Galería del sistema, hasta 10 archivos. `quality: 1` porque la imagen se recomprime
 * después, una sola vez. El modo `Compatible` hace que iOS entregue HEIC y HEVC
 * convertidos. Cancelar → `[]`.
 */
export async function elegirArchivos(): Promise<ArchivoElegido[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    selectionLimit: 10,
    quality: 1,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => {
    const esVideo = asset.type === 'video' || asset.type === 'pairedVideo';
    return {
      uri: asset.uri,
      tipo: esVideo ? 'video' : 'imagen',
      mime: asset.mimeType ?? null,
      ancho: asset.width,
      alto: asset.height,
      // `asset.duration` viene en milisegundos; `validarPublicacion` compara segundos.
      duracionSeg: esVideo && typeof asset.duration === 'number' ? asset.duration / 1000 : null,
      tamano: asset.fileSize ?? null,
    };
  });
}

/**
 * → JPEG de hasta 1440 px de ancho y ≤ 8 MB, probando calidad 0.9, 0.8 y 0.7.
 * Con `ancho` null (el flyer, que llega como data URI) se lee del render.
 */
export async function prepararImagen(
  uri: string,
  ancho: number | null
): Promise<{ uri: string; ancho: number; alto: number; tamano: number }> {
  let imagen;
  try {
    let contexto = ImageManipulator.manipulate(uri);
    if (ancho == null) {
      const original = await contexto.renderAsync();
      ancho = original.width;
      contexto = ImageManipulator.manipulate(uri);
    }
    if (ancho > ANCHO_MAXIMO) contexto = contexto.resize({ width: ANCHO_MAXIMO });
    imagen = await contexto.renderAsync();
  } catch {
    throw new Error(ERROR_IMAGEN);
  }

  for (const compress of CALIDADES) {
    let guardada;
    let tamano;
    try {
      guardada = await imagen.saveAsync({ format: SaveFormat.JPEG, compress });
      tamano = await tamanoDe(guardada.uri);
    } catch {
      throw new Error(ERROR_IMAGEN);
    }
    if (tamano <= MAX_JPEG) {
      return { uri: guardada.uri, ancho: guardada.width, alto: guardada.height, tamano };
    }
  }
  throw new Error(ERROR_PESO_IMAGEN);
}

/** → `{ mime, tamano }` si el video se puede subir; si no, tira con el texto para la pantalla. */
export async function revisarVideo(archivo: ArchivoElegido): Promise<{ mime: string; tamano: number }> {
  const extension = archivo.uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const mime = archivo.mime ?? TIPO_POR_EXTENSION[extension] ?? null;
  if (!mime || !TIPOS_VIDEO.includes(mime)) throw new Error('El video tiene que ser MP4 o MOV');
  const tamano = archivo.tamano ?? (await tamanoDe(archivo.uri));
  if (tamano > MAX_VIDEO) throw new Error('El video pesa más de 100 MB');
  return { mime, tamano };
}

/**
 * El flyer del evento (bucket `media`, WebP) como data URI: el manipulador solo acepta
 * archivos locales o data URI, no una URL remota. Después pasa por `prepararImagen`.
 */
export async function traerFlyer(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error('No pudimos traer la imagen del evento'));
    lector.readAsDataURL(blob);
  });
}

function esDuplicado(xhr: XMLHttpRequest): boolean {
  if (xhr.status === 409) return true;
  try {
    const cuerpo = JSON.parse(xhr.responseText || '{}');
    return String(cuerpo?.statusCode) === '409';
  } catch {
    // Respuesta no JSON (página de error de un proxy): no es el duplicado de Storage.
    return false;
  }
}

/**
 * PUT al endpoint de subida firmada de Storage, el mismo `FormData` que arma
 * `uploadToSignedUrl` de supabase-js (`cacheControl` y el archivo bajo el nombre `''`).
 * En nativo el archivo va como `{ uri, type, name }`, que React Native lee del disco
 * sin cargar 100 MB en memoria; en web va el `Blob`.
 *
 * El token de la firma nunca va a un `console.*`: con él cualquiera sube a ese path.
 */
export async function subirArchivoFirmado({
  uri,
  mime,
  path,
  token,
  onProgreso,
  señal,
}: {
  uri: string;
  mime: string;
  path: string;
  token: string;
  onProgreso?: (fraccion: number) => void;
  señal?: AbortSignal;
}): Promise<void> {
  if (señal?.aborted) throw new ErrorSubida(0, false, false, 'Subida cancelada');

  const form = new FormData();
  form.append('cacheControl', '3600');
  if (Platform.OS === 'web') {
    const blob = await fetch(uri).then((r) => r.blob());
    form.append('', blob);
  } else {
    const nombre = path.split('/').pop() || 'archivo';
    form.append('', { uri, type: mime, name: nombre } as any);
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${SUPABASE_URL}/storage/v1/object/upload/sign/redes/${path}?token=${token}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('x-upsert', 'false');

    const abortar = () => xhr.abort();
    señal?.addEventListener('abort', abortar);
    const terminar = () => señal?.removeEventListener('abort', abortar);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgreso?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      terminar();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgreso?.(1);
        resolve();
        return;
      }
      reject(new ErrorSubida(xhr.status, xhr.status >= 500, esDuplicado(xhr)));
    };
    xhr.onerror = () => {
      terminar();
      reject(new ErrorSubida(0, true));
    };
    xhr.ontimeout = () => {
      terminar();
      reject(new ErrorSubida(0, true));
    };
    xhr.onabort = () => {
      terminar();
      reject(new ErrorSubida(0, false, false, 'Subida cancelada'));
    };

    onProgreso?.(0);
    xhr.send(form);
  });
}

function esperar(ms: number, señal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (señal?.aborted) {
      reject(new ErrorSubida(0, false, false, 'Subida cancelada'));
      return;
    }
    const t = setTimeout(() => {
      señal?.removeEventListener('abort', cancelar);
      resolve();
    }, ms);
    function cancelar() {
      clearTimeout(t);
      reject(new ErrorSubida(0, false, false, 'Subida cancelada'));
    }
    señal?.addEventListener('abort', cancelar);
  });
}

/**
 * Prepara (imagen) o revisa (video), pide la firma y sube. Hasta 3 intentos con la
 * misma firma, esperando 2 s y 5 s, solo si el fallo es reintentable. Un duplicado
 * (409) en un reintento cuenta como éxito: el path es un UUID nuevo de esta subida,
 * así que solo puede ser el intento anterior, que llegó aunque se perdió la respuesta.
 *
 * → el `MedioRed` que `POST /api/redes/publicaciones` exige que coincida con la URL
 * pública del path.
 */
export async function subirMedioRed(
  t: TenantType,
  archivo: ArchivoElegido,
  { onProgreso, señal }: { onProgreso?: (fraccion: number) => void; señal?: AbortSignal } = {}
): Promise<MedioRed> {
  let uri: string;
  let mime: string;
  let tamano: number;
  let ancho: number | null;
  let alto: number | null;
  if (archivo.tipo === 'imagen') {
    const imagen = await prepararImagen(archivo.uri, archivo.ancho || null);
    uri = imagen.uri;
    mime = 'image/jpeg';
    tamano = imagen.tamano;
    ancho = imagen.ancho;
    alto = imagen.alto;
  } else {
    const video = await revisarVideo(archivo);
    uri = archivo.uri;
    mime = video.mime;
    tamano = video.tamano;
    ancho = archivo.ancho || null;
    alto = archivo.alto || null;
  }
  if (señal?.aborted) throw new ErrorSubida(0, false, false, 'Subida cancelada');

  const firmada = await firmarSubidaRed(t, mime, tamano);

  for (let intento = 0; ; intento++) {
    try {
      await subirArchivoFirmado({ uri, mime, path: firmada.path, token: firmada.token, onProgreso, señal });
      break;
    } catch (e) {
      if (e instanceof ErrorSubida && e.duplicado && intento > 0) break;
      const quedan = intento < ESPERAS_REINTENTO_MS.length;
      if (!(e instanceof ErrorSubida) || !e.reintentable || !quedan) throw e;
      await esperar(ESPERAS_REINTENTO_MS[intento], señal);
    }
  }

  return {
    path: firmada.path,
    url: firmada.url,
    tipo: archivo.tipo,
    ancho,
    alto,
    duracion: archivo.tipo === 'video' ? archivo.duracionSeg : null,
  };
}
