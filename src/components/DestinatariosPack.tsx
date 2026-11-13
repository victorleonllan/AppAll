import { View, Text, TextInput, StyleSheet } from 'react-native';
import { CORREO_VALIDO } from '../lib/especiales';
import { borderRadius, spacing, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

interface Props {
  valores: string[]; // posición 0 = entrada 2
  onCambiar: (i: number, valor: string) => void;
  correoComprador: string | null;
  error: string | null;
}

/**
 * Spec 166 — «¿Quién recibe las otras entradas?» de W-260. La entrada 1 es siempre del
 * comprador; un campo vacío también llega a su correo. La validación que manda es la de
 * la Edge Function: acá solo se marca lo que claramente no es un correo.
 */
export default function DestinatariosPack({ valores, onCambiar, correoComprador, error }: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();

  return (
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>¿Quién recibe las otras entradas?</Text>

      <View style={styles.fila}>
        <Text style={styles.etiqueta}>Entrada 1</Text>
        <Text style={styles.comprador}>{correoComprador ? `Tú (${correoComprador})` : 'Tú'}</Text>
      </View>

      {valores.map((valor, i) => {
        const correo = valor.trim();
        const mal = correo !== '' && !CORREO_VALIDO.test(correo);
        return (
          <View key={i} style={styles.fila}>
            <Text style={styles.etiqueta}>Entrada {i + 2}</Text>
            <TextInput
              style={[styles.input, mal && styles.inputMal]}
              value={valor}
              onChangeText={(t) => onCambiar(i, t)}
              placeholder="correo@ejemplo.com"
              placeholderTextColor={colores.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              accessibilityLabel={`Correo de la entrada ${i + 2}`}
            />
          </View>
        );
      })}

      <Text style={styles.nota}>Si dejas uno vacío, esa entrada llega a tu correo.</Text>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  contenedor: { marginTop: spacing.md, gap: spacing.sm },
  titulo: { fontSize: fontSize.md, fontWeight: 'bold', color: c.primary },
  fila: { gap: 4 },
  etiqueta: { fontSize: fontSize.sm, color: c.muted },
  comprador: { fontSize: fontSize.md, color: c.primary },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
    color: c.primary,
    backgroundColor: c.cardBackground,
  },
  inputMal: { borderColor: c.danger },
  nota: { fontSize: fontSize.sm, color: c.muted, fontStyle: 'italic' },
  error: { fontSize: fontSize.sm, color: c.danger },
});
