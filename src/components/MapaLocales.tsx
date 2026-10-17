import { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import {
  PropsMapaLocales, COLOR_TIPO_LOCAL, clusterPrincipal, regionDe, mapaDisponible,
} from '../lib/mapa';
import { colors, fontSize } from '../theme';

// Spec 127 — iOS usa Apple Maps; Android, Google Maps con la clave de
// app.config.js. En web se resuelve MapaLocales.web.tsx.
export default function MapaLocales({
  puntos, seleccionadoId, onSeleccionar, onVerDetalle, interactivo = true, deltaMinimo, style,
}: PropsMapaLocales) {
  const mapRef = useRef<MapView>(null);
  // Solo el encuadre inicial: cambiar el filtro no debe saltar la cámara.
  const regionInicial = useMemo(
    () => regionDe(clusterPrincipal(puntos), deltaMinimo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (!seleccionadoId) return;
    const punto = puntos.find((p) => p.id === seleccionadoId);
    if (!punto) return;
    mapRef.current?.animateToRegion(
      { latitude: punto.lat, longitude: punto.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      400
    );
  }, [seleccionadoId, puntos]);

  // En Android sin clave, montar el MapView cierra la app.
  if (!mapaDisponible()) return null;

  return (
    <MapView
      ref={mapRef}
      style={[styles.mapa, style]}
      initialRegion={regionInicial ?? undefined}
      scrollEnabled={interactivo}
      zoomEnabled={interactivo}
      rotateEnabled={interactivo}
      pitchEnabled={interactivo}
    >
      {puntos.map((p) => (
        <Marker
          key={p.id}
          coordinate={{ latitude: p.lat, longitude: p.lng }}
          pinColor={COLOR_TIPO_LOCAL[p.tipo]}
          onPress={() => onSeleccionar?.(p.id)}
        >
          {onVerDetalle && (
            <Callout onPress={() => onVerDetalle(p.id)}>
              <View style={styles.callout}>
                <Text style={styles.nombre}>{p.nombre}</Text>
                <Text style={styles.ver}>Ver local ›</Text>
              </View>
            </Callout>
          )}
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  mapa: { flex: 1 },
  callout: { minWidth: 140, padding: 4 },
  nombre: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  ver: { fontSize: fontSize.sm, color: colors.accent, marginTop: 2 },
});
