import { useMemo } from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { COLOR_TIPO_LOCAL, mapaDisponible } from '../lib/mapa';
import type { Punto } from '../lib/ubicacion';
import type { VenueType } from '../types';
// Spec 176 — las teselas son claras en los dos temas: colores de la paleta clara.
import { paletaClara } from '../theme';

// Spec 200 — el mapa de un solo pin. En web se resuelve MapaPin.web.tsx.
export interface PropsMapaPin {
  centro: Punto;                         // encuadre inicial
  pin: Punto | null;
  tipo?: VenueType | null;               // color del pin
  circulo?: { centro: Punto; metros: number } | null;
  puntoDelMapa?: Punto | null;           // marca del punto que encontró la búsqueda
  editable?: boolean;                    // arrastrar el pin y tocar el mapa para ponerlo
  onCambiarPin?: (p: Punto) => void;
  style?: StyleProp<ViewStyle>;
}

/** Más o menos una cuadra a cada lado. */
const DELTA = 0.004;

const coordenada = (p: Punto) => ({ latitude: p.lat, longitude: p.lng });

export default function MapaPin({
  centro, pin, tipo, circulo, puntoDelMapa, editable = false, onCambiarPin, style,
}: PropsMapaPin) {
  // Solo el encuadre inicial: mover el pin no debe saltar la cámara.
  const regionInicial = useMemo(
    () => ({ ...coordenada(centro), latitudeDelta: DELTA, longitudeDelta: DELTA }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // En Android sin clave, montar el MapView cierra la app.
  if (!mapaDisponible()) return null;

  const mover = (c: { latitude: number; longitude: number }) =>
    onCambiarPin?.({ lat: c.latitude, lng: c.longitude });

  return (
    <MapView
      style={[styles.mapa, style]}
      initialRegion={regionInicial}
      scrollEnabled={editable}
      zoomEnabled={editable}
      rotateEnabled={false}
      pitchEnabled={false}
      onPress={editable ? (e) => mover(e.nativeEvent.coordinate) : undefined}
    >
      {circulo && (
        <Circle
          center={coordenada(circulo.centro)}
          radius={circulo.metros}
          strokeColor={paletaClara.accent}
          strokeWidth={2}
          fillColor="transparent"
          lineDashPattern={[6, 6]}
        />
      )}
      {puntoDelMapa && (
        <Marker coordinate={coordenada(puntoDelMapa)} pinColor={paletaClara.muted} />
      )}
      {pin && (
        <Marker
          // Por encima de la marca del punto del mapa, que arranca en el mismo lugar.
          zIndex={1}
          coordinate={coordenada(pin)}
          pinColor={tipo ? COLOR_TIPO_LOCAL[tipo] : paletaClara.primary}
          draggable={editable}
          onDragEnd={(e) => mover(e.nativeEvent.coordinate)}
        />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  mapa: { flex: 1 },
});
