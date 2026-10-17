import { View, Text, Image, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { EventoExterno } from '../types';
import { colors, spacing, borderRadius } from '../theme';

interface Props {
  evento: EventoExterno;
}

/**
 * Spec 119 — hermana de `TarjetaEvento`, no un modo de ella (W-024, Decisión 2):
 * un externo no se vende acá, así que no tiene precio ni botón de compra. Tocar
 * abre la fuente: una ficha propia para contenido de otra plataforma sería
 * republicarlo.
 */
export default function TarjetaEventoExterno({ evento }: Props) {
  const abrir = () => {
    Linking.openURL(evento.sourceUrl).catch((e) =>
      console.error('[TarjetaEventoExterno] no se pudo abrir la fuente:', e)
    );
  };

  const lugar = [evento.venueNombre, evento.comuna].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity onPress={abrir} activeOpacity={0.7} style={styles.tarjeta}>
      {evento.imagen ? (
        <Image source={{ uri: evento.imagen }} style={styles.flyer} resizeMode="cover" />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.titulo} numberOfLines={2}>
          {evento.titulo}
        </Text>
        {evento.venueNombre ? <Text style={styles.detalle}>📍 {lugar}</Text> : null}
        <Text style={styles.fuente}>vía {evento.fuenteNombre} ↗</Text>
        <Text style={styles.entradas}>Entradas en la fuente</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.md,
    marginVertical: 4,
    padding: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    gap: 12,
  },
  flyer: { width: 72, height: 96, borderRadius: borderRadius.sm },
  titulo: { fontSize: 15, fontWeight: '600', color: colors.primary },
  detalle: { fontSize: 12, color: colors.secondary, marginTop: 4 },
  fuente: { fontSize: 12, color: colors.muted, marginTop: 4 },
  entradas: { fontSize: 11, color: colors.muted, marginTop: 2 },
});
