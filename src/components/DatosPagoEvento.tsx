import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { DatosPago, TIPOS_CUENTA } from '../lib/datosPago';
import { colors, spacing, borderRadius, fontSize } from '../theme';

/**
 * Spec 136 — la cuenta a la que Sonópolis transfiere lo recaudado. Controlado:
 * validar (`datosPagoCompletos`) y guardar (`guardarDatosPago`) lo hace la
 * pantalla, porque al crear es obligatorio y al editar no.
 */
interface DatosPagoEventoProps {
  value: DatosPago;
  onChange: (v: DatosPago) => void;
  obligatorio: boolean;
}

export const DATOS_PAGO_VACIOS: DatosPago = {
  banco: '',
  tipoCuenta: 'corriente',
  numeroCuenta: '',
  titular: '',
  rut: '',
  emailContacto: null,
};

export default function DatosPagoEvento({ value, onChange, obligatorio }: DatosPagoEventoProps) {
  const ast = obligatorio ? ' *' : '';
  const set = (cambios: Partial<DatosPago>) => onChange({ ...value, ...cambios });

  return (
    <View>
      <Text style={styles.cabecera}>
        Acá te transferimos lo recaudado después del show. El público paga un 10% sobre tu precio,
        que se queda Sonópolis: tú recibes íntegro el precio que pusiste arriba.
      </Text>

      <Text style={styles.label}>Banco{ast}</Text>
      <TextInput
        style={styles.input}
        value={value.banco}
        onChangeText={(banco) => set({ banco })}
        placeholder="Banco de Chile"
        placeholderTextColor={colors.muted}
      />

      <Text style={styles.label}>Tipo de cuenta{ast}</Text>
      <View style={styles.chips}>
        {TIPOS_CUENTA.map((t) => {
          const activo = value.tipoCuenta === t.valor;
          return (
            <TouchableOpacity
              key={t.valor}
              style={[styles.chip, activo && styles.chipActivo]}
              onPress={() => set({ tipoCuenta: t.valor })}
            >
              <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{t.etiqueta}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Número de cuenta{ast}</Text>
      <TextInput
        style={styles.input}
        value={value.numeroCuenta}
        onChangeText={(numeroCuenta) => set({ numeroCuenta })}
        placeholder="00012345678"
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>Titular{ast}</Text>
      <TextInput
        style={styles.input}
        value={value.titular}
        onChangeText={(titular) => set({ titular })}
        placeholder="Nombre de quien recibe"
        placeholderTextColor={colors.muted}
      />

      <Text style={styles.label}>RUT{ast}</Text>
      <TextInput
        style={styles.input}
        value={value.rut}
        onChangeText={(rut) => set({ rut })}
        placeholder="12.345.678-9"
        placeholderTextColor={colors.muted}
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Correo de contacto (opcional)</Text>
      <TextInput
        style={styles.input}
        value={value.emailContacto ?? ''}
        onChangeText={(t) => set({ emailContacto: t || null })}
        placeholder="tu@correo.cl"
        placeholderTextColor={colors.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cabecera: { fontSize: fontSize.xs, color: colors.muted, marginBottom: spacing.xs },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.cardBackground,
    padding: 12,
    borderRadius: borderRadius.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActivo: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipTexto: { fontSize: fontSize.sm, color: colors.primary },
  chipTextoActivo: { color: colors.white, fontWeight: '600' },
});
