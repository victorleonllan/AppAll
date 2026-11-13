import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';

interface Props {
  motivo: string | null;
  onVerOtros?: () => void;
}

/**
 * Spec 120 — copia de sonopolisWeb/components/AvisoCancelacion.js. Un solo
 * componente para que el mensaje no se contradiga entre pantallas (Mis entradas
 * del spec 126 puede reusarlo).
 *
 * `motivo` es opcional porque `cancel_reason` es nullable: sin motivo el aviso
 * igual es inequívoco — lo que importa es que el show no va.
 */
export default function AvisoCancelacion({ motivo, onVerOtros }: Props) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.tarjeta} accessibilityRole="alert">
      {/* Título en primary, no rojo: el rojo ya está en el borde — repetirlo
          en el título hace que el aviso grite. */}
      <Text style={styles.titulo}>⚠️ Este evento fue cancelado</Text>
      {motivo ? <Text style={styles.texto}>{motivo}</Text> : null}
      <Text style={styles.texto}>Si compraste una entrada, tu compra no da acceso.</Text>
      {onVerOtros && (
        <TouchableOpacity onPress={onVerOtros}>
          <Text style={styles.enlace}>Ver otros eventos →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  tarjeta: {
    backgroundColor: c.cardBackground,
    borderRadius: borderRadius.lg,
    borderTopWidth: 3,
    borderTopColor: c.danger,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  titulo: { fontSize: fontSize.md, fontWeight: 'bold', color: c.primary },
  texto: { fontSize: fontSize.sm, color: c.secondary, marginTop: spacing.xs },
  enlace: { fontSize: fontSize.sm, fontWeight: '600', color: c.accent, marginTop: spacing.sm },
});
