import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PAIS_POR_DEFECTO, esPaisActivo } from '../constants/paises';

/**
 * Spec 096 — de qué país es la cartelera que se está mirando. Precedencia:
 * elección guardada en AsyncStorage → `PAIS_POR_DEFECTO` (Decisión 1). Sin
 * geolocalización: pedir permiso de ubicación para elegir una cartelera es
 * desproporcionado, y con el selector a la vista el default acertado importa poco.
 *
 * La clave es la misma que la cookie de la web (`COOKIE_PAIS` en
 * `sonopolisWeb/libs/pais.js`), por simetría de nombre.
 */
const CLAVE_PAIS = 'sonopolis_pais';

interface PaisState {
  pais: string;
  setPais: (codigo: string) => void;
  // AsyncStorage es asíncrono: sin `listo` el primer render usa el default y la
  // cartelera parpadea de un país al otro cuando llega la elección guardada.
  listo: boolean;
}

const PaisContext = createContext<PaisState>({} as PaisState);

export function PaisProvider({ children }: { children: ReactNode }) {
  const [pais, setPaisState] = useState<string>(PAIS_POR_DEFECTO);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const guardado = await AsyncStorage.getItem(CLAVE_PAIS);
        // Un país que salió del catálogo (o un valor corrupto) cae al default
        // en vez de dejar la cartelera filtrada por algo que no existe.
        if (esPaisActivo(guardado)) setPaisState(guardado.trim().toUpperCase());
      } catch (e) {
        console.error('[Pais] no se pudo leer la elección guardada:', e);
      } finally {
        setListo(true);
      }
    })();
  }, []);

  const setPais = useCallback((codigo: string) => {
    if (!esPaisActivo(codigo)) return;
    const normalizado = codigo.trim().toUpperCase();
    setPaisState(normalizado);
    // Si no se puede guardar, la elección vale igual para esta sesión.
    AsyncStorage.setItem(CLAVE_PAIS, normalizado).catch((e) =>
      console.error('[Pais] no se pudo guardar la elección:', e)
    );
  }, []);

  return (
    <PaisContext.Provider value={{ pais, setPais, listo }}>
      {children}
    </PaisContext.Provider>
  );
}

export const usePais = () => useContext(PaisContext);
