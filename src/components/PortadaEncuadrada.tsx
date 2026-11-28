// Spec 201 — la portada dibujada con el punto que eligió su dueño. `Image` no tiene
// `object-position`, así que el encuadre se calcula a mano (`encuadreCover`, spec 192).

import { useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Medidas, PuntoPortada, encuadreCover, esCentro } from '../lib/portada';

/** Tamaño natural de la foto. `uri` en `null` no pide nada. La respuesta de una `uri`
 * anterior se descarta. */
export function useTamanoImagen(uri: string | null): { tamano: Medidas | null; fallo: boolean } {
  const [estado, setEstado] = useState<{ uri: string; tamano: Medidas | null } | null>(null);

  useEffect(() => {
    if (!uri) return;
    let vigente = true;
    setEstado(null);
    Image.getSize(
      uri,
      (w, h) => {
        if (vigente) setEstado({ uri, tamano: { w, h } });
      },
      () => {
        if (vigente) setEstado({ uri, tamano: null });
      },
    );
    return () => {
      vigente = false;
    };
  }, [uri]);

  const actual = estado && estado.uri === uri ? estado : null;
  return { tamano: actual?.tamano ?? null, fallo: !!actual && !actual.tamano };
}

interface Props {
  uri: string;
  punto: PuntoPortada;
  style?: StyleProp<ViewStyle>; // tamaño, aspectRatio, bordes y margen del marco
  accessibilityLabel?: string;
}

export default function PortadaEncuadrada({ uri, punto, style, accessibilityLabel }: Props) {
  const [marco, setMarco] = useState<Medidas | null>(null);
  // Con el punto en el centro, `cover` ya hace lo mismo: no se pide el tamaño.
  const centrado = esCentro(punto);
  const { tamano } = useTamanoImagen(centrado ? null : uri);

  const medir = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setMarco({ w: width, h: height });
  };

  return (
    <View
      style={[style, styles.marco]}
      onLayout={medir}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {/* Sin marco o sin tamaño (o si `getSize` falló) se dibuja centrada: nunca un hueco. */}
      {!centrado && marco && tamano ? (
        <Image
          source={{ uri }}
          style={[styles.encuadrada, encuadreCover({ marco, imagen: tamano, punto })]}
          resizeMode="cover"
        />
      ) : (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  marco: { overflow: 'hidden' },
  encuadrada: { position: 'absolute' },
});
