import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '../theme';

export default function DashboardCafeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icono}>☕</Text>
      <Text style={styles.titulo}>Tu Café</Text>
      <Text style={styles.sub}>Próximamente podrás gestionar tu café aquí.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  icono: { fontSize: fontSize.xxl },
  titulo: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.primary, marginTop: spacing.sm },
  sub: { fontSize: fontSize.md, color: colors.secondary, marginTop: spacing.sm, textAlign: 'center' },
});
