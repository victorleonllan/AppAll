import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useVenues } from '../context/VenuesContext';
import { usePais } from '../context/PaisContext';
import { PAISES } from '../constants/paises';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { venueEmoji, venueLabel } from '../lib/venues';
import { LocalesStackParamList } from '../navigation/LocalesStack';

type NavigationProp = NativeStackNavigationProp<LocalesStackParamList, 'LocalesList'>;

export default function LocalesScreen() {
  const navigation = useNavigation<NavigationProp>();
  // Un solo listado de locales (spec 018): la separación por tipo venía de
  // usar `type` como si fuera un tier de asociación, que nunca fue.
  // Spec 096 — solo los locales del país activo (el que se elige en Cartelera).
  const { venuesDelPais: locales } = useVenues();
  const { pais } = usePais();

  return (
    <ScrollView style={styles.container}>
      {/* Spec 122 — entrada al directorio real; reemplaza la búsqueda por género sobre el mock. */}
      <TouchableOpacity style={styles.tarjetaMusicos} onPress={() => navigation.navigate('DirectorioMusicos')}>
        <Text style={styles.tituloMusicos}>🎸 Músicos</Text>
        <Text style={styles.infoVenue}>Descubre quién toca en {PAISES[pais]?.nombre ?? pais}</Text>
      </TouchableOpacity>

      <View style={styles.filaTitulo}>
        <Text style={styles.titulo}>📍 Locales</Text>
        <TouchableOpacity style={styles.botonMapa} onPress={() => navigation.navigate('MapaLocales')}>
          <Text style={styles.textoBotonMapa}>🗺 Ver mapa de locales</Text>
        </TouchableOpacity>
      </View>
      {locales.length === 0 && (
        <Text style={styles.vacio}>Todavía no hay locales en {PAISES[pais]?.nombre ?? pais}.</Text>
      )}
      {locales.map((venue) => (
        <TouchableOpacity
          key={venue.id}
          style={styles.tarjetaVenue}
          onPress={() => navigation.navigate('DetalleLocal', { venueId: venue.id })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.nombreVenue}>
              {venueEmoji(venue.type)} {venue.name}
            </Text>
            <Text style={styles.infoVenue}>{venueLabel(venue.type)}</Text>
            {venue.estilo && <Text style={styles.infoVenue}>🎵 {venue.estilo}</Text>}
            <Text style={styles.infoVenue}>
              📍 {[venue.address, venue.comuna].filter(Boolean).join(', ') || venue.distance}
            </Text>
            {!!venue.aforo && <Text style={styles.infoVenue}>👥 Aforo {venue.aforo}</Text>}
            {!!venue.horarios && <Text style={styles.infoVenue}>🕒 {venue.horarios}</Text>}
            {(venue.tieneEscenario || venue.tieneSonido || venue.tieneBackline) && (
              <Text style={styles.infoVenue}>
                {[
                  venue.tieneEscenario ? '🎭 escenario' : null,
                  venue.tieneSonido ? '🎤 sonido' : null,
                  venue.tieneBackline ? '🎸 backline' : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            )}
            {(venue.telefono || venue.instagram || venue.sitioWeb) && (
              <Text style={styles.infoVenue}>
                {[venue.telefono, venue.instagram, venue.sitioWeb].filter(Boolean).join(' · ')}
              </Text>
            )}
            {/* `rating` no se muestra: los valores actuales se cargaron a mano
                y ningún flujo lo escribe — mostrarlo sería engañoso (spec 031). */}
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 20 },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginLeft: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm },
  filaTitulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: spacing.md },
  botonMapa: { backgroundColor: colors.accentLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: borderRadius.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  textoBotonMapa: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  tarjetaMusicos: {
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: 14,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  tituloMusicos: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  tarjetaVenue: {
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.md,
    marginVertical: 4,
    padding: 14,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nombreVenue: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  infoVenue: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
  vacio: { textAlign: 'center', color: colors.muted, marginTop: spacing.md },
});
