import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { paletaClara, paletaOscura, Paleta } from '../theme';

/**
 * Spec 173 — qué tema está activo y la elección guardada en el teléfono. Hermano de
 * W-272 en la web (`son-tema` en `localStorage`, script en `app/layout.js`).
 *
 * Sin elección guardada el tema es el claro. No se sigue la preferencia del sistema
 * (`useColorScheme`), igual que la web: casi todos los celulares están en oscuro y
 * seguirlo cambiaría la app para casi todos el día del despliegue.
 */
export type Tema = 'light' | 'dark';

// Misma clave que la web (W-272).
export const CLAVE_TEMA = 'son-tema';

export function temaDesdeGuardado(valor: string | null): Tema {
  return valor === 'dark' ? 'dark' : 'light';
}

interface TemaState {
  tema: Tema;
  colores: Paleta;
  setTema: (t: Tema) => void;
  alternar: () => void;
}

const TemaContext = createContext<TemaState | null>(null);

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>('light');
  const [listo, setListo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const guardado = await AsyncStorage.getItem(CLAVE_TEMA);
        setTemaState(temaDesdeGuardado(guardado));
      } catch (error) {
        console.warn('[tema] no se pudo leer la preferencia', error);
      } finally {
        setListo(true);
      }
    })();
  }, []);

  const setTema = useCallback((t: Tema) => {
    setTemaState(t);
    // Si no se puede guardar, el tema elegido sigue activo hasta cerrar la app.
    AsyncStorage.setItem(CLAVE_TEMA, t).catch((error) =>
      console.warn('[tema] no se pudo guardar la preferencia', error)
    );
  }, []);

  const alternar = useCallback(() => {
    setTema(tema === 'dark' ? 'light' : 'dark');
  }, [tema, setTema]);

  const valor = useMemo<TemaState>(
    () => ({
      tema,
      colores: tema === 'dark' ? paletaOscura : paletaClara,
      setTema,
      alternar,
    }),
    [tema, setTema, alternar]
  );

  // Equivalente del script en línea de la web: hasta leer la elección no se pinta
  // nada, para que quien eligió oscuro no vea la app clara y el salto en cada arranque.
  if (!listo) return null;

  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}

export function useTema(): TemaState {
  const ctx = useContext(TemaContext);
  // Sin valor por defecto: escondería en silencio una pantalla montada fuera del árbol.
  if (!ctx) throw new Error('useTema fuera de TemaProvider');
  return ctx;
}
