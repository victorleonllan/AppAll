import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useVenues } from '../context/VenuesContext';
import MapaLocales from '../components/MapaLocales';
import { COLOR_TIPO_LOCAL, mapaDisponible, puntosDeVenues } from '../lib/mapa';
import { venueEmoji, venueLabel } from '../lib/venues';
import { Venue, VenueType } from '../types';
import { LocalesStackParamList } from '../navigation/LocalesStack';
import { colors, spacing, fontSize, borderRadius } from '../theme';

type NavigationProp = NativeStackNavigationProp<LocalesStackParamList, 'MapaLocales'>;

const FILTROS: { tipo: VenueType | null; etiqueta: string }[] = [
  { tipo: null, etiqueta: 'Todos' },
  { tipo: 'cafe', etiqueta: 'Cafés' },
  { tipo: 'bar', etiqueta: 'Bares' },
  { tipo: 'sala', etiqueta: 'Salas' },
  { tipo: 'centro_cultural', etiqueta: 'Centros culturales' },
];

// Spec 127 — hermana de /locales en la web, que ES el mapa (W-149).
export default function MapaLocalesScreen() {
  const navigation = useNavigation<NavigationProp>();
  // Los locales del país activo, los mismos que lista LocalesScreen (spec 096).
  const { venuesDelPais: locales } = useVenues();
  const [filtro, setFiltro] = useState<VenueType | null>(null);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const disponible = mapaDisponible();

  // Conteo sobre todos los locales, no sobre el filtro activo: si no, al elegir
  // un tipo los demás dirían 0 (W-139).
  const conteo = (tipo: VenueType | null) =>
    tipo ? locales.filter((v) => v.type === tipo).length : locales.length;

  const filtrados = useMemo(
    () => (filtro ? locales.filter((v) => v.type === filtro) : locales),
    [locales, filtro]
  );
  const puntos = useMemo(() => puntosDeVenues(filtrados), [filtrados]);
  const idsConPunto = useMemo(() => new Set(puntos.map((p) => p.id)), [puntos]);
  const enMapa = filtrados.filter((v) => idsConPunto.has(v.id));
  const sinUbicacion = filtrados.filter((v) => !idsConPunto.has(v.id));
  const mapaVisible = disponible && puntos.length > 0;

  const verDetalle = (venueId: string) => navigation.navigate('DetalleLocal', { venueId });
  // Sin la lista, un mapa sin puntos no dejaría llegar a ningún local (W-030).
  const tocarFila = (v: Venue) => {
    if (mapaVisible && idsConPunto.has(v.id)) setSeleccionadoId(v.id);
    else verDetalle(v.id);
  };

  let aviso: string | null = null;
  if (!disponible) {
    aviso = Platform.OS === 'web'
      ? 'El mapa se ve en la app para iOS y Android. Aquí tienes la lista.'
      : 'El mapa no está disponible en esta versión de la app. Aquí tienes la lista.';
  } else if (puntos.length === 0) {
    aviso = 'Ningún local de este filtro tiene ubicación cargada todavía.';
  }

  const fila = (v: Venue) => (
    <TouchableOpacity
      key={v.id}
      style={[styles.fila, v.id === seleccionadoId && styles.filaSeleccionada]}
      onPress={() => tocarFila(v)}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.nombre}>{venueEmoji(v.type)} {v.name}</Text>
        <Text style={styles.info}>{[venueLabel(v.type), v.comuna].filter(Boolean).join(' · ')}</Text>
      </View>
      <TouchableOpacity onPress={() => verDetalle(v.id)} hitSlop={8}>
        <Text style={styles.ver}>Ver ›</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtros} contentContainerStyle={styles.filtrosContenido}>
        {FILTROS.map((f) => {
          const activo = filtro === f.tipo;
          return (
            <TouchableOpacity
              key={f.etiqueta}
              style={[styles.chip, activo && styles.chipActivo]}
              onPress={() => { setFiltro(f.tipo); setSeleccionadoId(null); }}
            >
              {f.tipo && <View style={[styles.punto, { backgroundColor: COLOR_TIPO_LOCAL[f.tipo] }]} />}
              <Text style={[styles.textoChip, activo && styles.textoChipActivo]}>
                {f.etiqueta} ({conteo(f.tipo)})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {mapaVisible ? (
        <View style={styles.mapa}>
          <MapaLocales
            puntos={puntos}
            seleccionadoId={seleccionadoId}
            onSeleccionar={setSeleccionadoId}
            onVerDetalle={verDetalle}
          />
        </View>
      ) : (
        aviso && <Text style={styles.aviso}>{aviso}</Text>
      )}

      <ScrollView style={mapaVisible ? styles.listaConMapa : styles.lista} contentContainerStyle={styles.listaContenido}>
        <Text style={styles.grupo}>En el mapa ({enMapa.length})</Text>
        {enMapa.map(fila)}
        <Text style={styles.grupo}>Sin ubicación ({sinUbicacion.length})</Text>
        {sinUbicacion.map(fila)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filtros: { flexGrow: 0 },
  filtrosContenido: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: borderRadius.lg,
  },
  chipActivo: { backgroundColor: colors.accent, borderColor: colors.accent },
  punto: { width: 10, height: 10, borderRadius: 5 },
  textoChip: { color: colors.primary, fontSize: fontSize.sm },
  textoChipActivo: { color: colors.white, fontWeight: 'bold' },
  mapa: { flex: 3 },
  aviso: { color: colors.secondary, fontSize: fontSize.sm, marginHorizontal: spacing.md, marginVertical: spacing.sm },
  listaConMapa: { flex: 2 },
  lista: { flex: 1 },
  listaContenido: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  grupo: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary, marginTop: spacing.md, marginBottom: spacing.xs },
  fila: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardBackground,
    padding: 12, borderRadius: borderRadius.md, marginVertical: 3,
    borderLeftWidth: 4, borderLeftColor: colors.accent,
  },
  filaSeleccionada: { borderLeftColor: colors.warning, backgroundColor: colors.accentLight },
  nombre: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  info: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
  ver: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm, marginLeft: spacing.sm },
});
