import { View, Text, TouchableOpacity, StyleSheet, Linking, ScrollView } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { musicosMock } from '../data/mock/musicos';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type ParamList = {
  VerMusico: { musicoId: string };
};

export default function VerMusicoScreen() {
  const route = useRoute<RouteProp<ParamList, 'VerMusico'>>();
  const { musicoId } = route.params;
  const musico = musicosMock.find((m) => m.id === musicoId);

  if (!musico) {
    return (
      <View style={styles.container}>
        <Text style={styles.aviso}>Músico no encontrado</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.nombre}>{musico.nombre}</Text>
        <Text style={styles.genero}>{musico.genero}</Text>

        <View style={styles.separador} />

        <Text style={styles.bio}>{musico.bio}</Text>

        {musico.instagram && (
          <TouchableOpacity onPress={() => Linking.openURL(`https://instagram.com/${musico.instagram!.replace('@', '')}`)}>
            <Text style={styles.enlace}>📷 Instagram: {musico.instagram}</Text>
          </TouchableOpacity>
        )}

        {musico.spotify && (
          <TouchableOpacity onPress={() => Linking.openURL(musico.spotify!)}>
            <Text style={styles.enlace}>🎵 Spotify: {musico.spotify}</Text>
          </TouchableOpacity>
        )}

        {musico.youtube && (
          <TouchableOpacity onPress={() => Linking.openURL(musico.youtube!)}>
            <Text style={styles.enlace}>📺 YouTube: {musico.youtube}</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  nombre: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.primary,
  },
  genero: {
    fontSize: fontSize.md,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  separador: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  bio: {
    fontSize: fontSize.md,
    color: colors.secondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  enlace: {
    fontSize: fontSize.md,
    color: colors.accent,
    textDecorationLine: 'underline',
    marginTop: spacing.sm,
  },
  aviso: {
    fontSize: fontSize.md,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
  },
});
