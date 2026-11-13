import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import FormElegirRol from '../components/FormElegirRol';
import { PerfilStackParamList } from '../navigation/PerfilStack';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';

type NavProp = NativeStackNavigationProp<PerfilStackParamList, 'ElegirRol'>;

const NOMBRE_ROL = { fan: 'fan', musician: 'músico', local: 'local' } as const;

// Spec 128 — la ruta para llegar a mano. En la práctica GuardaRol ya tapa la app
// mientras no hay rol; esta pantalla solo evita que la ruta se rompa.
export default function ElegirRolScreen() {
  const styles = useEstilos(crearEstilos);
  const navigation = useNavigation<NavProp>();
  const { session, role } = useAuth();

  // PerfilStack (spec 114) abre en ElegirRol cuando no hay rol: ahí no hay a
  // dónde volver, así que se cae a Perfil.
  const volver = () => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('Perfil'));

  if (!session) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.texto}>Inicia sesión para elegir cómo usas Sonópolis.</Text>
      </View>
    );
  }

  if (role === null) {
    return (
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <FormElegirRol onListo={volver} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.centrado}>
      <Text style={styles.texto}>
        Tu cuenta ya está configurada como {NOMBRE_ROL[role]}. Cambiar de rol todavía no se puede desde la app.
      </Text>
      <TouchableOpacity style={styles.boton} onPress={volver}>
        <Text style={styles.textoBoton}>Volver</Text>
      </TouchableOpacity>
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  centrado: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  texto: { fontSize: fontSize.md, color: c.secondary, textAlign: 'center', marginBottom: spacing.lg },
  boton: { backgroundColor: c.accent, paddingVertical: 14, paddingHorizontal: spacing.lg, borderRadius: borderRadius.sm },
  textoBoton: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.md },
});
