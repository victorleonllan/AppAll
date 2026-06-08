import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Cafe } from '../types';
import { colors, spacing, borderRadius } from '../theme';

interface Props {
  cafe: Cafe;
  tipo: 'asociado' | 'pendiente';
  onInvitar?: () => void;
}

export default function TarjetaCafe({ cafe, tipo, onInvitar }: Props) {
  return (
    <View style={[styles.base, tipo === 'asociado' ? styles.asociado : styles.pendiente]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.nombre}>{cafe.nombre}</Text>
        {cafe.estilo && (
          <Text style={styles.info}>
            {cafe.estilo} {cafe.rating ? '· ⭐ ' + cafe.rating : ''}
          </Text>
        )}
        <Text style={styles.info}>📍 {cafe.distancia}</Text>
      </View>
      {tipo === 'pendiente' && onInvitar && (
        <TouchableOpacity style={styles.boton} onPress={onInvitar}>
          <Text style={styles.textoBoton}>💬 Invitar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.md,
    marginVertical: 4,
    padding: 14,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  asociado: { borderLeftColor: colors.accent },
  pendiente: { opacity: 0.8 },
  nombre: { fontSize: 16, fontWeight: '600', color: colors.primary },
  info: { fontSize: 13, color: colors.secondary, marginTop: 2 },
  boton: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: borderRadius.sm },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});
