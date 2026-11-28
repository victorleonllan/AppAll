// Spec 206 — franja «Estás editando como admin» sobre los formularios del dueño (W-352).

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

const QUE = { musico: 'el perfil de ', local: 'el perfil de ', evento: 'el evento ' };

interface Props {
  nombre: string;
  tipo: 'musico' | 'local' | 'evento';
  onVerFicha: () => void;
}

export default function AvisoEdicionAdmin({ nombre, tipo, onVerFicha }: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const navigation = useNavigation();

  return (
    <View style={styles.franja}>
      <Ionicons name="shield-checkmark-outline" size={20} color={colores.warningText} />
      <View style={styles.cuerpo}>
        <Text style={styles.texto}>
          Estás editando como admin {QUE[tipo]}
          <Text style={styles.negrita}>{nombre}</Text>. Lo que guardes lo verá como suyo.
        </Text>
        <View style={styles.enlaces}>
          <TouchableOpacity onPress={onVerFicha}>
            <Text style={styles.enlace}>Ver ficha pública</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.enlace}>Volver al admin</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  franja: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: c.warningBg,
    borderWidth: 1,
    borderColor: c.warning,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cuerpo: { flex: 1, gap: spacing.xs },
  texto: { fontSize: fontSize.sm, color: c.primary },
  negrita: { fontWeight: 'bold' },
  enlaces: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  enlace: { fontSize: fontSize.sm, fontWeight: '600', color: c.accent },
});
