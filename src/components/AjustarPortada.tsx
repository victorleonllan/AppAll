// Spec 201 — «Ajustar portada»: arrastrar la foto dentro del marco de la ficha. Hermano
// de `components/perfil/AjustarPortada.js` de la web (W-346).
//
// Es un `Modal` porque arrastrar dentro del `ScrollView` de la pantalla de edición pelea
// con el desplazamiento.

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, LayoutChangeEvent, Modal, PanResponder, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Medidas, PuntoPortada, encuadreCover, hayQueAjustar, puntoTrasArrastre } from '../lib/portada';
import { useTamanoImagen } from './PortadaEncuadrada';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

interface Props {
  visible: boolean;
  uri: string;
  puntoInicial: PuntoPortada;
  proporcion: number; // ancho / alto del marco de la ficha
  onGuardar: (p: PuntoPortada) => Promise<void>;
  onCerrar: () => void;
}

export default function AjustarPortada({
  visible, uri, puntoInicial, proporcion, onGuardar, onCerrar,
}: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const [punto, setPunto] = useState(puntoInicial);
  const [marco, setMarco] = useState<Medidas | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // No se pide hasta la primera apertura; después se conserva para que la foto no
  // desaparezca mientras el modal baja.
  const abierta = useRef(false);
  if (visible) abierta.current = true;
  const { tamano, fallo } = useTamanoImagen(abierta.current ? uri : null);

  // Cada apertura parte del punto guardado: así «Cancelar» no deja rastro.
  useEffect(() => {
    if (!visible) return;
    setPunto(puntoInicial);
    setError(null);
  }, [visible, puntoInicial.x, puntoInicial.y]);

  // El `PanResponder` se crea una sola vez: lee lo actual por referencia.
  const actual = useRef({ punto, marco, tamano, guardando });
  actual.current = { punto, marco, tamano, guardando };
  const alEmpezar = useRef(punto);

  const arrastre = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !actual.current.guardando,
      onMoveShouldSetPanResponder: () => !actual.current.guardando,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        alEmpezar.current = actual.current.punto;
      },
      onPanResponderMove: (_, { dx, dy }) => {
        const { marco: m, tamano: t } = actual.current;
        if (!m || !t) return;
        setPunto(puntoTrasArrastre({ punto: alEmpezar.current, delta: { dx, dy }, marco: m, imagen: t }));
      },
    }),
  ).current;

  const medir = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setMarco({ w: width, h: height });
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(punto);
      onCerrar();
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo guardar la portada.');
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = () => {
    if (!guardando) onCerrar();
  };

  const listo = !!marco && !!tamano;
  const nadaQueAjustar = !!marco && !!tamano && !hayQueAjustar({ marco, imagen: tamano });
  const soloCerrar = fallo || nadaQueAjustar;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cancelar}>
      <SafeAreaView style={styles.hoja}>
        <Text style={styles.titulo}>Ajustar portada</Text>

        <View style={[styles.marco, { aspectRatio: proporcion }]} onLayout={medir} {...arrastre.panHandlers}>
          {marco && tamano ? (
            // Sin `pointerEvents` la web arrastraría la imagen en vez de mover el punto.
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Image
                source={{ uri }}
                style={[styles.foto, encuadreCover({ marco, imagen: tamano, punto })]}
                resizeMode="cover"
              />
              {!nadaQueAjustar && (
                <>
                  <View style={[styles.guiaVertical, { left: '33.333%' }]} />
                  <View style={[styles.guiaVertical, { left: '66.667%' }]} />
                  <View style={[styles.guiaHorizontal, { top: '33.333%' }]} />
                  <View style={[styles.guiaHorizontal, { top: '66.667%' }]} />
                </>
              )}
            </View>
          ) : fallo ? null : (
            <ActivityIndicator color={colores.accent} style={styles.cargando} />
          )}
        </View>

        <View style={styles.cuerpo}>
          {fallo ? (
            <Text style={styles.instruccion}>No se pudo cargar la foto.</Text>
          ) : nadaQueAjustar ? (
            <Text style={styles.instruccion}>
              Esta foto ya se ve completa en la ficha: no hay nada que ajustar.
            </Text>
          ) : (
            <>
              <Text style={styles.instruccion}>Arrastra para mover la foto</Text>
              <Text style={styles.ayuda}>En el computador se ve más ancho, con este mismo punto al centro.</Text>
            </>
          )}

          {soloCerrar ? (
            <TouchableOpacity style={styles.botonSecundario} onPress={onCerrar}>
              <Text style={styles.textoSecundario}>Cerrar</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.boton, (!listo || guardando) && styles.botonDesactivado]}
                onPress={guardar}
                disabled={!listo || guardando}
              >
                <Text style={styles.textoBoton}>{guardando ? 'Guardando…' : 'Guardar'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.botonSecundario} onPress={cancelar} disabled={guardando}>
                <Text style={styles.textoSecundario}>Cancelar</Text>
              </TouchableOpacity>
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  hoja: { flex: 1, backgroundColor: c.background },
  titulo: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: c.primary,
    textAlign: 'center',
    padding: spacing.md,
  },
  marco: { width: '100%', overflow: 'hidden', backgroundColor: c.accentLight },
  foto: { position: 'absolute' },
  guiaVertical: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: c.white, opacity: 0.6 },
  guiaHorizontal: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: c.white, opacity: 0.6 },
  cargando: { flex: 1 },
  cuerpo: { padding: spacing.md },
  instruccion: { fontSize: fontSize.md, color: c.primary, textAlign: 'center' },
  ayuda: { fontSize: fontSize.sm, color: c.muted, textAlign: 'center', marginTop: spacing.xs },
  boton: {
    backgroundColor: c.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  botonDesactivado: { opacity: 0.6 },
  textoBoton: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.md },
  botonSecundario: {
    backgroundColor: c.accentLight,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  textoSecundario: { color: c.accent, fontWeight: 'bold', fontSize: fontSize.md },
  error: { fontSize: fontSize.sm, color: c.dangerText, textAlign: 'center', marginTop: spacing.sm },
});
