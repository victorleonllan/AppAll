import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Evento } from '../types';
import { colors, spacing, borderRadius } from '../theme';

interface Props {
  evento: Evento;
  onComprar?: () => void;
}

export default function TarjetaEvento({ evento, onComprar }: Props) {
  return (
    <View style={styles.tarjeta}>
      <View style={{ flex: 1 }}>
        <Text style={styles.artista}>{evento.artista}</Text>
        <Text style={styles.genero}>{evento.genero}</Text>
        <Text style={styles.detalle}>
          📍 {evento.cafe} · {evento.fecha} · {evento.hora}
        </Text>
        <Text style={styles.precio}>{evento.precio}</Text>
      </View>
      {onComprar && (
        <TouchableOpacity style={styles.boton} onPress={onComprar}>
          <Text style={styles.textoBoton}>🎫 Comprar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
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
  artista: { fontSize: 16, fontWeight: '600', color: colors.primary },
  genero: { fontSize: 13, color: colors.secondary, marginTop: 2 },
  detalle: { fontSize: 12, color: colors.muted, marginTop: 4 },
  precio: { fontSize: 15, fontWeight: 'bold', color: colors.success, marginTop: 6 },
  boton: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: borderRadius.sm, marginLeft: 12 },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});
