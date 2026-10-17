import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Evento } from '../types';
import { usePrecioVigente } from '../hooks/usePrecioVigente';
import PrecioEvento from './PrecioEvento';
import { colors, spacing, fontSize, borderRadius } from '../theme';

interface Props {
  evento: Evento;
  onPress: () => void;
}

/**
 * Spec 119 — tarjeta grande de un evento creado en Sonópolis, arriba de la
 * cartelera (W-128: todos los internos van destacados, no solo el más próximo).
 * Superficie oscura del W-016 con los tokens de esta app.
 */
export default function EventoDestacado({ evento, onPress }: Props) {
  const cancelado = evento.status === 'cancelled';
  // Solo vale la pena cotizar preventas cuando el evento se vende en puerta y sigue en pie.
  const { vigente } = usePrecioVigente(
    evento.tipoPrecio === 'puerta' && !cancelado ? evento.id : null
  );

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.tarjeta}>
      {evento.imagen ? (
        // `contain` con alto máximo: respeta la proporción del flyer sin medirlo.
        <Image
          source={{ uri: evento.imagen }}
          style={[styles.flyer, cancelado && styles.flyerCancelado]}
          resizeMode="contain"
        />
      ) : null}
      <View style={styles.cuerpo}>
        <View style={styles.chips}>
          <View style={styles.chipDestacado}>
            <Text style={styles.chipDestacadoTexto}>Destacado</Text>
          </View>
          {cancelado && (
            <View style={styles.chipCancelado}>
              <Text style={styles.chipCanceladoTexto}>Cancelado</Text>
            </View>
          )}
        </View>
        <Text style={styles.artista}>{evento.artista}</Text>
        {evento.genero ? <Text style={styles.genero}>{evento.genero}</Text> : null}
        <Text style={styles.detalle}>
          📍 {evento.venueName} · {evento.fecha} · {evento.hora}
        </Text>
        {evento.descripcion ? (
          <Text style={styles.descripcion} numberOfLines={2}>
            {evento.descripcion}
          </Text>
        ) : null}
        {!cancelado && <PrecioEvento evento={evento} vigente={vigente} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.md,
    marginVertical: 6,
    padding: 14,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    gap: 12,
  },
  flyer: { width: 112, height: 160, borderRadius: borderRadius.sm },
  flyerCancelado: { opacity: 0.5 },
  cuerpo: { flex: 1 },
  chips: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  chipDestacado: {
    backgroundColor: colors.accentLight,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipDestacadoTexto: { fontSize: fontSize.xs, fontWeight: '600', color: colors.accent },
  chipCancelado: {
    backgroundColor: colors.danger,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipCanceladoTexto: { fontSize: fontSize.xs, fontWeight: '600', color: colors.white },
  artista: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.white },
  genero: { fontSize: fontSize.sm, color: colors.white, opacity: 0.8, marginTop: 2 },
  detalle: { fontSize: fontSize.xs, color: colors.white, opacity: 0.8, marginTop: 4 },
  descripcion: { fontSize: fontSize.sm, color: colors.white, opacity: 0.9, marginTop: 6 },
});
