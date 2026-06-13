import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { useEventos } from '../context/EventosContext';
import { musicosMock } from '../data/mock/musicos';
import TarjetaEvento from '../components/TarjetaEvento';
import { colors, spacing, borderRadius, fontSize } from '../theme';
import { CafeStackParamList } from '../navigation/CafeStack';

type NavigationProp = NativeStackNavigationProp<CafeStackParamList, 'Dashboard'>;

export default function DashboardCafeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { cafes } = useVenues();
  const { eventos } = useEventos();

  const miVenue = user ? cafes.find((v) => v.ownerId === user.id) : null;
  const misEventos = user
    ? eventos.filter((e) => e.createdBy === user.id)
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
            ☕ Bienvenido, {miVenue?.name ?? "Café"}
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
                <Text style={styles.generoMusico}>{musico.genero}</Text>
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
