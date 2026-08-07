import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, fontSize } from '../theme';

export default function PerfilScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icono}>👤</Text>
      <Text style={styles.titulo}>Tu Perfil</Text>
      <Text style={styles.sub}>Crea tu cuenta para empezar</Text>

      <View style={styles.tarjetaRol}>
        <Text style={styles.label}>Yo soy...</Text>
        <TouchableOpacity style={[styles.botonRol, styles.botonActivo]}>
          <Text style={styles.textoRol}>🎭 Público</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonRol}>
          <Text style={styles.textoRolInactivo}>🎸 Músico</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonRol}>
          <Text style={styles.textoRolInactivo}>📍 Dueño de local</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.aviso}>Si eres músico o local, podrás gestionar tu perfil después.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', paddingTop: 60 },
  icono: { fontSize: fontSize.xxl },
  titulo: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.primary, marginTop: spacing.sm },
  sub: { fontSize: fontSize.md, color: colors.secondary, marginTop: spacing.sm },
  tarjetaRol: { backgroundColor: colors.cardBackground, padding: 20, borderRadius: borderRadius.lg, marginTop: 30, width: '85%' },
  label: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary, marginBottom: 12 },
  botonRol: { paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, marginBottom: spacing.sm, backgroundColor: colors.accentLight },
  botonActivo: { backgroundColor: colors.accent },
  textoRol: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  textoRolInactivo: { color: colors.secondary, fontSize: fontSize.md },
  aviso: { fontSize: fontSize.xs, color: colors.muted, marginTop: 20, textAlign: 'center', paddingHorizontal: 30 },
});
