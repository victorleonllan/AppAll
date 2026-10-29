import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { useRoute, RouteProp, useNavigation, NavigationProp } from '@react-navigation/native';
import { useVenues } from '../context/VenuesContext';
import { useAuth } from '../context/AuthContext';
import { useEventosDelLocal } from '../hooks/useEventosDelLocal';
import BotonSeguir from '../components/BotonSeguir';
import OptInWhatsApp from '../components/OptInWhatsApp';
import { useTelefonoPropio } from '../hooks/useOptInWhatsApp';
import MapaLocales from '../components/MapaLocales';
import { mapaDisponible, puntosDeVenues, urlComoLlegar } from '../lib/mapa';
import { venueEmoji, venueLabel } from '../lib/venues';
import { LocalesStackParamList } from '../navigation/LocalesStack';
import { RootTabParamList } from '../navigation/linking';
import { colors, spacing, fontSize, borderRadius } from '../theme';

// Montada en LocalesStack y CarteleraStack con los mismos params; el tipo de
// LocalesStack alcanza para leerlos.
type DetalleLocalRoute = RouteProp<LocalesStackParamList, 'DetalleLocal'>;

function urlInstagram(instagram: string): string {
  if (/^https?:\/\//i.test(instagram)) return instagram;
  return `https://instagram.com/${instagram.replace(/^@/, '')}`;
}

function urlSitio(sitio: string): string {
  return /^https?:\/\//i.test(sitio) ? sitio : `https://${sitio}`;
}

// Spec 127 — ficha del local, hermana de /locales/[id] en la web.
export default function DetalleLocalScreen() {
  const { venueId } = useRoute<DetalleLocalRoute>().params;
  const navigation = useNavigation();
  const { allVenues, loading } = useVenues();
  const { user } = useAuth();
  const venue = allVenues.find((v) => v.id === venueId);
  const fechas = useEventosDelLocal(venue?.id);
  const telefonoPropio = useTelefonoPropio();

  if (loading) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }
  if (!venue) {
    return (
      <View style={styles.centro}>
        <Text style={styles.vacio}>No encontramos este local.</Text>
      </View>
    );
  }

  const puntos = puntosDeVenues([venue]);
  const comoLlegar = urlComoLlegar(venue);
  // Seguir tu propio local no tiene sentido (misma regla que la web).
  const mostrarSeguir = !!user && user.id !== venue.ownerId;
  const equipamiento = [
    venue.tieneEscenario ? '🎭 Escenario' : null,
    venue.tieneSonido ? '🎤 Sonido' : null,
    venue.tieneBackline ? '🎸 Backline' : null,
  ].filter(Boolean) as string[];
  const filas = [
    venue.estilo ? ['Estilo musical', venue.estilo] : null,
    venue.aforo ? ['Aforo', String(venue.aforo)] : null,
    venue.horarios ? ['Horarios', venue.horarios] : null,
  ].filter(Boolean) as [string, string][];
  const contactos = [
    venue.telefono ? { etiqueta: `📞 ${venue.telefono}`, url: `tel:${venue.telefono}` } : null,
    venue.emailContacto ? { etiqueta: `✉️ ${venue.emailContacto}`, url: `mailto:${venue.emailContacto}` } : null,
    venue.instagram ? { etiqueta: `📷 ${venue.instagram}`, url: urlInstagram(venue.instagram) } : null,
    venue.sitioWeb ? { etiqueta: `🌐 ${venue.sitioWeb}`, url: urlSitio(venue.sitioWeb) } : null,
  ].filter(Boolean) as { etiqueta: string; url: string }[];

  // DetalleEvento vive en CarteleraStack: se sube al Tab (spec 114), así
  // funciona igual si la ficha se abrió desde Locales o desde Cartelera.
  const verEvento = (eventoId: string) =>
    navigation.getParent<NavigationProp<RootTabParamList>>()
      ?.navigate('Cartelera', { screen: 'DetalleEvento', params: { eventoId } });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <View style={styles.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={styles.nombre}>{venueEmoji(venue.type)} {venue.name}</Text>
          <Text style={styles.tipo}>{venueLabel(venue.type)}</Text>
        </View>
        {mostrarSeguir && <BotonSeguir tipo="venue" targetId={venue.id} />}
      </View>

      {/* Spec 156 — para todos, con o sin sesión y con o sin Pro del local (W-053):
          Pro decide quién manda, no quién recibe. */}
      <OptInWhatsApp tenantTipo="venue" tenantId={venue.id} telefonoInicial={telefonoPropio} />

      <Text style={styles.seccion}>Dónde</Text>
      {!!venue.address && <Text style={styles.texto}>📍 {venue.address}</Text>}
      {(venue.comuna || venue.ciudad) && (
        <Text style={styles.textoSuave}>{[venue.comuna, venue.ciudad].filter(Boolean).join(', ')}</Text>
      )}
      {puntos.length === 0 ? (
        <Text style={styles.textoSuave}>Este local todavía no tiene ubicación cargada.</Text>
      ) : mapaDisponible() ? (
        <View style={styles.miniMapa}>
          <MapaLocales puntos={puntos} interactivo={false} deltaMinimo={0.008} />
        </View>
      ) : null}
      {comoLlegar && (
        <TouchableOpacity style={styles.boton} onPress={() => Linking.openURL(comoLlegar)}>
          <Text style={styles.textoBoton}>Cómo llegar</Text>
        </TouchableOpacity>
      )}

      {(!!venue.description || filas.length > 0 || equipamiento.length > 0) && (
        <>
          <Text style={styles.seccion}>Sobre el local</Text>
          {!!venue.description && <Text style={styles.texto}>{venue.description}</Text>}
          {filas.map(([etiqueta, valor]) => (
            <View key={etiqueta} style={styles.fila}>
              <Text style={styles.etiqueta}>{etiqueta}</Text>
              <Text style={styles.valor}>{valor}</Text>
            </View>
          ))}
          {equipamiento.length > 0 && (
            <View style={styles.chips}>
              {equipamiento.map((e) => (
                <View key={e} style={styles.chip}><Text style={styles.textoChip}>{e}</Text></View>
              ))}
            </View>
          )}
        </>
      )}

      {contactos.length > 0 && (
        <>
          <Text style={styles.seccion}>Contacto</Text>
          {contactos.map((c) => (
            <TouchableOpacity key={c.url} onPress={() => Linking.openURL(c.url)}>
              <Text style={styles.enlace}>{c.etiqueta}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      <Text style={styles.seccion}>Próximas fechas</Text>
      {fechas.cargando ? (
        <ActivityIndicator color={colors.accent} />
      ) : fechas.error ? (
        <Text style={styles.error}>{fechas.error}</Text>
      ) : fechas.eventos.length === 0 ? (
        <Text style={styles.textoSuave}>Este local no tiene fechas próximas publicadas.</Text>
      ) : (
        fechas.eventos.map((e) => (
          <TouchableOpacity key={e.id} style={styles.fecha} onPress={() => verEvento(e.id)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.textoSuave}>{[e.fecha, e.hora].filter(Boolean).join(' · ')}</Text>
              <Text style={styles.artista}>{e.artista}</Text>
            </View>
            {e.status === 'cancelled' && <Text style={styles.cancelado}>Cancelado</Text>}
          </TouchableOpacity>
        ))
      )}
      {/* `rating` no se muestra: los valores se cargaron a mano, no salen de
          reseñas (spec 031). */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: spacing.md, paddingBottom: spacing.xl },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nombre: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.primary },
  tipo: { fontSize: fontSize.md, color: colors.secondary, marginTop: 2 },
  seccion: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginTop: spacing.lg, marginBottom: spacing.sm },
  texto: { fontSize: fontSize.md, color: colors.primary, marginBottom: 4 },
  textoSuave: { fontSize: fontSize.sm, color: colors.secondary, marginBottom: 4 },
  miniMapa: { height: 180, borderRadius: borderRadius.md, overflow: 'hidden', marginVertical: spacing.sm },
  boton: { alignSelf: 'flex-start', backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: borderRadius.sm, marginTop: spacing.sm },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.sm },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  etiqueta: { fontSize: fontSize.sm, color: colors.secondary },
  valor: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: { backgroundColor: colors.accentLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: borderRadius.sm },
  textoChip: { color: colors.accent, fontSize: fontSize.sm },
  enlace: { fontSize: fontSize.md, color: colors.accent, paddingVertical: 6 },
  fecha: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardBackground,
    padding: 12, borderRadius: borderRadius.md, marginBottom: spacing.sm,
    borderLeftWidth: 4, borderLeftColor: colors.accent,
  },
  artista: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  cancelado: { color: colors.danger, fontWeight: 'bold', fontSize: fontSize.sm, marginLeft: spacing.sm },
  error: { color: colors.danger, fontSize: fontSize.sm },
  vacio: { color: colors.muted, fontSize: fontSize.md },
});
