import { View, Text, TouchableOpacity, StyleSheet, Linking, ScrollView } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { musicosMock } from '../data/mock/musicos';
import { TIPO_PROYECTO_LABEL } from '../lib/profiles';
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
        <Text style={styles.genero}>
          {[musico.tipoProyecto ? TIPO_PROYECTO_LABEL[musico.tipoProyecto] : null, musico.ciudad]
            .filter(Boolean)
            .join(' · ')}
        </Text>

        <View style={styles.separador} />

        <Text style={styles.bio}>{musico.bio}</Text>

        {/* Spec 030: los datos con los que un local decide contratar.
            `!!x` en vez de `x` en cada gate: con 0 (p.ej. "0 integrantes")
            `x && <Text>` deja pasar el 0 y React lo renderiza como texto "0". */}
        {!!(musico.integrantes || musico.duracionShow || musico.generos?.length) && (
          <View style={styles.datosFila}>
            {!!musico.integrantes && (
              <Text style={styles.dato}>👥 {musico.integrantes} integrante{musico.integrantes === 1 ? '' : 's'}</Text>
            )}
            {!!musico.duracionShow && <Text style={styles.dato}>⏱ {musico.duracionShow} min</Text>}
            {musico.generos && musico.generos.length > 0 && (
              <Text style={styles.dato}>🎼 {musico.generos.join(', ')}</Text>
            )}
          </View>
        )}

        {musico.riderTecnico && (
          <View style={styles.rider}>
            <Text style={styles.riderTitulo}>Rider técnico</Text>
            <Text style={styles.bio}>{musico.riderTecnico}</Text>
          </View>
        )}

        <View style={styles.separador} />

        {musico.telefono && <Text style={styles.contacto}>📞 {musico.telefono}</Text>}
        {musico.emailContacto && <Text style={styles.contacto}>✉️ {musico.emailContacto}</Text>}

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

        {musico.tiktok && (
          <TouchableOpacity onPress={() => Linking.openURL(musico.tiktok!)}>
            <Text style={styles.enlace}>🎬 TikTok: {musico.tiktok}</Text>
          </TouchableOpacity>
        )}

        {musico.sitioWeb && (
          <TouchableOpacity onPress={() => Linking.openURL(musico.sitioWeb!)}>
            <Text style={styles.enlace}>🌐 {musico.sitioWeb}</Text>
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
  datosFila: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  dato: { fontSize: fontSize.sm, color: colors.secondary },
  rider: { marginBottom: spacing.md },
  riderTitulo: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary, marginBottom: spacing.xs },
  contacto: { fontSize: fontSize.md, color: colors.secondary, marginTop: spacing.xs },
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
