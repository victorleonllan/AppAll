import { useState, useCallback } from 'react';
import { elegirImagen, subirImagen, CarpetaMedia } from '../lib/imagenes';

/**
 * Elegir de la galería y subir al bucket `media`. Devuelve la URL pública, o
 * `null` si la persona canceló. Lanza los errores tal cual: el hook no muestra
 * alertas, quien lo usa decide cómo avisar.
 */
export function useSubirImagen(destino: { carpeta: CarpetaMedia; id: string | undefined }): {
  subiendo: boolean;
  elegirYSubir: (opciones?: { aspecto?: [number, number] }) => Promise<string | null>;
} {
  const [subiendo, setSubiendo] = useState(false);
  const { carpeta, id } = destino;

  const elegirYSubir = useCallback(
    async (opciones?: { aspecto?: [number, number] }) => {
      if (id === undefined) {
        throw new Error('Todavía no hay dónde guardar la imagen.');
      }
      const imagen = await elegirImagen(opciones);
      if (!imagen) return null;
      setSubiendo(true);
      try {
        const { url } = await subirImagen({ imagen, carpeta, id });
        return url;
      } finally {
        setSubiendo(false);
      }
    },
    [carpeta, id],
  );

  return { subiendo, elegirYSubir };
}
