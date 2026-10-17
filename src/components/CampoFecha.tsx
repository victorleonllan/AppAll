import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Platform,
  StyleProp, ViewStyle,
} from 'react-native';
import DateTimePicker, { DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { formatearFechaEs } from '../lib/fecha';
import { colors, spacing, fontSize } from '../theme';

interface CampoFechaProps {
  value: string;                 // 'AAAA-MM-DD' o '' (CampoFecha) · 'HH:MM' o '' (CampoHora)
  onChange: (v: string) => void;
  placeholder: string;
  minimo?: Date;                 // solo CampoFecha
  opcional?: boolean;            // muestra «Quitar» cuando hay valor
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;  // para heredar el estilo `input` de cada pantalla
}

type Modo = 'date' | 'time';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Componentes locales del `Date`, nunca `toISOString()`: en Chile una fecha
 * elegida después de las 21:00 pasa a UTC y el campo mostraría el día siguiente.
 */
function aTexto(d: Date, modo: Modo): string {
  return modo === 'date'
    ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** El valor del campo como `Date` local; sin valor (o ilegible), hoy a las 21:00. */
function desdeTexto(value: string, modo: Modo): Date {
  const d = new Date();
  d.setHours(21, 0, 0, 0);
  if (modo === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) d.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  } else {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (m) d.setHours(Number(m[1]), Number(m[2]));
  }
  return d;
}

/**
 * Spec 144 — la fecha y la hora se eligen con el selector del sistema, pero el
 * estado de cada pantalla sigue siendo el texto `AAAA-MM-DD` / `HH:MM` que antes
 * se escribía a mano: `armarFecha`, `armarFechaHora` y `fechaHoraValidas` no
 * cambian. En web `DateTimePicker` no existe y queda el `TextInput` de siempre.
 */
function Campo({
  modo, value, onChange, placeholder, minimo, opcional, disabled, style,
}: CampoFechaProps & { modo: Modo }) {
  const [abierto, setAbierto] = useState(false);

  const quitar = opcional && !!value && !disabled ? (
    <TouchableOpacity onPress={() => onChange('')} style={styles.quitar}>
      <Text style={styles.textoQuitar}>Quitar</Text>
    </TouchableOpacity>
  ) : null;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.fila}>
        <TextInput
          style={[style, styles.campo]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          editable={!disabled}
        />
        {quitar}
      </View>
    );
  }

  const elegir = (_e: DateTimePickerChangeEvent, d: Date) => {
    // Android es un diálogo: elegir lo cierra. En iOS queda abierto hasta «Listo».
    if (Platform.OS === 'android') setAbierto(false);
    onChange(aTexto(d, modo));
  };

  const texto = value ? (modo === 'date' ? formatearFechaEs(value) : value) : placeholder;

  return (
    <View>
      <View style={styles.fila}>
        <TouchableOpacity
          style={[style, styles.campo]}
          onPress={() => setAbierto(!abierto)}
          disabled={disabled}
        >
          <Text style={value ? styles.texto : styles.placeholder}>{texto}</Text>
        </TouchableOpacity>
        {quitar}
      </View>
      {abierto && (
        <View style={Platform.OS === 'ios' ? styles.cajaIos : undefined}>
          <DateTimePicker
            value={desdeTexto(value, modo)}
            mode={modo}
            is24Hour
            display={Platform.OS === 'ios' ? (modo === 'date' ? 'inline' : 'spinner') : 'default'}
            minimumDate={modo === 'date' ? minimo : undefined}
            locale="es-CL"
            themeVariant="light"
            onValueChange={elegir}
            onDismiss={() => setAbierto(false)}
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity onPress={() => setAbierto(false)} style={styles.listo}>
              <Text style={styles.textoListo}>Listo</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export function CampoFecha(props: CampoFechaProps) {
  return <Campo {...props} modo="date" />;
}

export function CampoHora(props: Omit<CampoFechaProps, 'minimo'>) {
  return <Campo {...props} modo="time" />;
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  campo: { flex: 1 },
  texto: { fontSize: fontSize.md, color: colors.primary },
  placeholder: { fontSize: fontSize.md, color: colors.muted },
  quitar: { paddingVertical: spacing.xs },
  textoQuitar: { fontSize: fontSize.sm, color: colors.accent, fontWeight: '600' },
  cajaIos: { marginTop: spacing.xs },
  listo: { alignSelf: 'flex-end', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  textoListo: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600' },
});
