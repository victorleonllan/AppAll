import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { useEventos } from '../context/EventosContext';
import { musicosMock } from '../data/mock/musicos';
import TarjetaEvento from '../components/TarjetaEvento';
import { colors, spacing, borderRadius, fontSize } from '../theme';
import { MiLocalStackParamList } from '../navigation/MiLocalStack';

type NavigationProp = NativeStackNavigationProp<MiLocalStackParamList, 'Dashboard'>;

export default function DashboardLocalScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { allVenues } = useVenues();
  const { eventos, misColaboraciones } = useEventos();

  // Busca entre todos los locales, no solo los de type 'cafe': tras el spec 018
  // el dueño puede tener un bar, una sala o un centro cultural.
  const miVenue = user ? allVenues.find((v) => v.ownerId === user.id) : null;
  // Spec 033 — incluye los eventos creados en el local por un músico: el
  // dueño entra como admin automático (events_claim_owner_trg) y necesita
  // verlos acá, no solo los que creó él mismo.
  const misEventoIds = new Set(misColaboraciones.map((c) => c.eventId));
  const misEventos = user
    ? eventos.filter((e) => e.createdBy === user.id || misEventoIds.has(e.id))
    : [];

  return (
    <FlatList
      style={styles.container}
      data={misEventos}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <TarjetaEvento evento={item} />}
      ListHeaderComponent={
        <View>
          <Text style={styles.bienvenida}>
            📍 Bienvenido, {miVenue?.name ?? "Local"}
          </Text>
          {miVenue?.address && (
            <Text style={styles.direccion}>📍 {miVenue.address}</Text>
          )}
          {miVenue?.estilo && (
            <Text style={styles.estilo}>🎵 {miVenue.estilo}</Text>
          )}

          <Text style={styles.titulo}>Mis Eventos</Text>
          {misEventos.length === 0 && (
            <Text style={styles.vacio}>Aún no tienes eventos. ¡Crea el primero!</Text>
          )}
        </View>
      }
      ListFooterComponent={
        <View>
          <TouchableOpacity
            style={styles.botonNuevo}
            onPress={() => navigation.navigate('CrearEvento')}
          >
            <Text style={styles.textoBotonNuevo}>+ Nuevo Evento</Text>
          </TouchableOpacity>

          <Text style={styles.titulo}>Músicos disponibles</Text>
          {musicosMock.map((musico) => (
            <TouchableOpacity
              key={musico.id}
              style={styles.tarjetaMusico}
              onPress={() => navigation.navigate('VerMusico', { musicoId: musico.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.nombreMusico}>{musico.nombre}</Text>
                <Text style={styles.generoMusico}>{(musico.generos ?? []).join(', ')}</Text>
              </View>
              <View style={styles.botonPerfil}>
                <Text style={styles.textoBotonPerfil}>Ver perfil</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      }
      contentContainerStyle={{ paddingBottom: 100 }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  bienvenida: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.primary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  direccion: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  estilo: {
    fontSize: fontSize.sm,
    color: colors.accent,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  titulo: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.primary,
    marginLeft: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  vacio: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginLeft: spacing.md,
    fontStyle: 'italic',
  },
  botonNuevo: {
    backgroundColor: colors.accent,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  textoBotonNuevo: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  tarjetaMusico: {
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
  nombreMusico: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  generoMusico: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
  botonPerfil: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    marginLeft: 12,
  },
  textoBotonPerfil: { color: colors.secondary, fontWeight: 'bold', fontSize: fontSize.sm },
});
