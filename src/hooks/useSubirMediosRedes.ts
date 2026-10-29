import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TenantType } from '../lib/redes/api';
import type { MedioRed, TipoMedio } from '../lib/redes/reglas';
import { ArchivoElegido, elegirArchivos, subirMedioRed, traerFlyer } from '../lib/redes/medios';

const AVISO_MEZCLA = 'Usa imágenes o un video, no los dos';
const AVISO_FLYER = 'No pudimos traer el flyer del evento; súbelo a mano';
const ERROR_SUBIDA = 'No pudimos subir el archivo';

export interface ItemMedio {
  id: string;
  tipo: TipoMedio;
  estado: 'preparando' | 'subiendo' | 'listo' | 'error';
  progreso: number;
  preview: string;
  medio?: MedioRed;
  error?: string;
}

interface SubirMediosRedesState {
  items: ItemMedio[];
  /** Los ya subidos, en el orden de la lista (el del carrusel). */
  medios: MedioRed[];
  subiendo: boolean;
  tieneVideo: boolean;
  aviso: string | null;
  agregarDeGaleria: () => Promise<void>;
  agregarFlyer: (url: string) => Promise<void>;
  quitar: (id: string) => void;
  reintentar: (id: string) => void;
}

let siguienteId = 0;
const nuevoId = () => `medio-${++siguienteId}`;

/**
 * Spec 150 — las fotos o el video de una publicación en redes. Cada archivo empieza a
 * subir apenas se agrega (como `SubirMedios.js` de la web): al publicar ya está todo
 * arriba. Los cambios de estado usan el updater de `setItems` porque varias subidas
 * terminan a la vez y cada una tiene que partir de la lista más reciente.
 *
 * Lo que ya subió y se quita queda en el bucket: lo borra la limpieza de 30 días de la
 * web (`config.redes.diasConservarMedios`).
 */
export function useSubirMediosRedes(tenantType: TenantType | null): SubirMediosRedesState {
  const [items, setItems] = useState<ItemMedio[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  // Lo que ya hay, para decidir la mezcla de tipos fuera de un updater (el picker es
  // asíncrono y el `items` del render puede estar viejo).
  const itemsRef = useRef<ItemMedio[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const archivos = useRef(new Map<string, ArchivoElegido>());
  const controles = useRef(new Map<string, AbortController>());
  const flyersPedidos = useRef(new Set<string>());

  const actualizar = useCallback((id: string, cambios: Partial<ItemMedio>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...cambios } : it)));
  }, []);

  /** Sube desde cero: prepara, pide una firma nueva y sube. → el error, o null si subió. */
  const subir = useCallback(
    async (id: string): Promise<string | null> => {
      const archivo = archivos.current.get(id);
      if (!archivo || !tenantType) return ERROR_SUBIDA;
      controles.current.get(id)?.abort();
      const control = new AbortController();
      controles.current.set(id, control);
      actualizar(id, { estado: 'preparando', progreso: 0, error: undefined });
      try {
        const medio = await subirMedioRed(tenantType, archivo, {
          señal: control.signal,
          onProgreso: (fraccion) => actualizar(id, { estado: 'subiendo', progreso: fraccion }),
        });
        actualizar(id, { estado: 'listo', progreso: 1, medio });
        return null;
      } catch (e: any) {
        const mensaje = e?.message || ERROR_SUBIDA;
        // Si se quitó, el item ya no está y el updater no hace nada.
        actualizar(id, { estado: 'error', error: mensaje });
        return mensaje;
      } finally {
        if (controles.current.get(id) === control) controles.current.delete(id);
      }
    },
    [tenantType, actualizar]
  );

  /** Lo que no calza con el tipo que ya hay (sin contar las fallidas) se descarta. */
  const agregar = useCallback(
    (nuevos: { archivo: ArchivoElegido; preview: string }[]): string[] => {
      const tipos = new Set(
        itemsRef.current.filter((it) => it.estado !== 'error').map((it) => it.tipo)
      );
      const ids: string[] = [];
      const aAgregar: ItemMedio[] = [];
      for (const { archivo, preview } of nuevos) {
        if ([...tipos].some((t) => t !== archivo.tipo)) {
          setAviso(AVISO_MEZCLA);
          continue;
        }
        tipos.add(archivo.tipo);
        const id = nuevoId();
        archivos.current.set(id, archivo);
        ids.push(id);
        aAgregar.push({ id, tipo: archivo.tipo, estado: 'preparando', progreso: 0, preview });
      }
      if (aAgregar.length > 0) {
        itemsRef.current = [...itemsRef.current, ...aAgregar];
        setItems((prev) => [...prev, ...aAgregar]);
      }
      return ids;
    },
    []
  );

  const agregarDeGaleria = useCallback(async () => {
    setAviso(null);
    const elegidos = await elegirArchivos();
    const ids = agregar(elegidos.map((archivo) => ({ archivo, preview: archivo.uri })));
    for (const id of ids) subir(id);
  }, [agregar, subir]);

  const quitar = useCallback((id: string) => {
    controles.current.get(id)?.abort();
    controles.current.delete(id);
    archivos.current.delete(id);
    itemsRef.current = itemsRef.current.filter((it) => it.id !== id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  /** Una sola vez por URL. Si falla, quita el item y avisa: el redactor sigue sin imagen. */
  const agregarFlyer = useCallback(
    async (url: string) => {
      if (flyersPedidos.current.has(url)) return;
      flyersPedidos.current.add(url);
      // Sin ancho: `prepararImagen` lo lee del render. La `uri` se completa con el data
      // URI cuando llega; mientras, la miniatura ya muestra el flyer.
      const archivo: ArchivoElegido = {
        uri: '',
        tipo: 'imagen',
        mime: null,
        ancho: 0,
        alto: 0,
        duracionSeg: null,
        tamano: null,
      };
      const [id] = agregar([{ archivo, preview: url }]);
      if (!id) return;
      try {
        archivo.uri = await traerFlyer(url);
      } catch {
        quitar(id);
        setAviso(AVISO_FLYER);
        return;
      }
      const error = await subir(id);
      if (error) {
        quitar(id);
        setAviso(AVISO_FLYER);
      }
    },
    [agregar, subir, quitar]
  );

  /** Vuelve a empezar desde la firma: pasadas 2 horas la firma vieja ya no sirve. */
  const reintentar = useCallback(
    (id: string) => {
      if (!itemsRef.current.some((it) => it.id === id && it.estado === 'error')) return;
      subir(id);
    },
    [subir]
  );

  // Al desmontar, aborta todas las subidas en curso.
  useEffect(() => {
    const enCurso = controles.current;
    return () => {
      enCurso.forEach((control) => control.abort());
      enCurso.clear();
    };
  }, []);

  const medios = useMemo(
    () => items.filter((it) => it.estado === 'listo' && it.medio).map((it) => it.medio!),
    [items]
  );
  const subiendo = items.some((it) => it.estado === 'preparando' || it.estado === 'subiendo');
  const tieneVideo = items.some((it) => it.tipo === 'video' && it.estado !== 'error');

  return { items, medios, subiendo, tieneVideo, aviso, agregarDeGaleria, agregarFlyer, quitar, reintentar };
}
