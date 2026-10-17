import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

/** Un prefijo por dominio dentro del bucket `media` (spec 053 y 062). */
export type CarpetaMedia = 'perfiles' | 'locales' | 'eventos' | 'pendientes';

export interface ImagenElegida {
  uri: string;
  mimeType: string | null;
  nombreArchivo: string | null;
}

export const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const TAMANO_MAXIMO = 5 * 1024 * 1024;

const TIPO_POR_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

const EXTENSION_POR_TIPO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

function tipoDesdeExtension(ruta: string | null): string | null {
  if (!ruta) return null;
  const extension = ruta.split('?')[0].split('.').pop()?.toLowerCase();
  return extension ? TIPO_POR_EXTENSION[extension] ?? null : null;
}

/**
 * Abre la galería del sistema. `quality: 0.8` recomprime en el teléfono (el
 * equivalente nativo de la recompresión a WebP de la web) y el modo `Compatible`
 * hace que iOS entregue las fotos HEIC convertidas a JPEG. Cancelar devuelve `null`.
 */
export async function elegirImagen(opciones?: { aspecto?: [number, number] }): Promise<ImagenElegida | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: Boolean(opciones?.aspecto),
    aspect: opciones?.aspecto,
    quality: 0.8,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType ?? null, nombreArchivo: asset.fileName ?? null };
}

/**
 * Sube a `media/<carpeta>/<id>/<uuid>.<ext>` y devuelve la URL pública. El nombre
 * sale de un generador criptográfico porque el bucket no tiene policy de lectura
 * (spec 092): la URL imposible de adivinar es lo único que protege `pendientes/`.
 * Sin `upsert`: con él Storage exige `SELECT` sobre `storage.objects` y toda
 * subida daría 403.
 */
export async function subirImagen(args: {
  imagen: ImagenElegida;
  carpeta: CarpetaMedia;
  id: string;
}): Promise<{ url: string }> {
  const { imagen, carpeta, id } = args;

  const tipo = imagen.mimeType ?? tipoDesdeExtension(imagen.nombreArchivo) ?? tipoDesdeExtension(imagen.uri);
  if (!tipo || !TIPOS_PERMITIDOS.includes(tipo)) {
    throw new Error('Formato no soportado. Usa JPEG, PNG, WebP o AVIF.');
  }

  const bytes = await fetch(imagen.uri).then((r) => r.arrayBuffer());
  if (bytes.byteLength > TAMANO_MAXIMO) {
    throw new Error('La imagen pesa demasiado (máximo 5MB).');
  }

  const ruta = `${carpeta}/${id}/${Crypto.randomUUID()}.${EXTENSION_POR_TIPO[tipo]}`;
  const { error } = await supabase.storage.from('media').upload(ruta, bytes, { contentType: tipo });
  if (error) {
    if (/row-level security|policy|permission|unauthorized/i.test(error.message)) {
      throw new Error('No tienes permiso para subir una imagen acá.');
    }
    throw new Error('No se pudo subir la imagen. Intenta de nuevo.');
  }

  return { url: supabase.storage.from('media').getPublicUrl(ruta).data.publicUrl };
}
