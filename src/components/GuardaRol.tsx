import { Modal, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import FormElegirRol from './FormElegirRol';
import { colors } from '../theme';

// Spec 128 — la guarda de /quien-eres: una sesión sin rol (Google, enlace de la
// web) no usa la app hasta elegir. Modal global y no pantalla de la navegación:
// al entrar desde la pestaña «Sonópolis», el tab navigator vuelve a Cartelera y
// una guarda dentro de Perfil nunca se vería. `onRequestClose` vacío: el atrás de
// Android no la cierra; las salidas son elegir o «¿No eres tú?».
export default function GuardaRol() {
  const { session, role, loading } = useAuth();
  const visible = !loading && !!session && role === null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => {}}>
      <SafeAreaView style={styles.container}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <FormElegirRol />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
