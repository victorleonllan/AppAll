import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { REGLA_CONTRASENA, faltaEnContrasena, mensajeDeErrorAuth, cambiarContrasena } from '../lib/contrasena';
import { colors, spacing, borderRadius, fontSize } from '../theme';

// Spec 128 — hermana de /perfil/contrasena en la web (W-228). Un solo campo con
// «Mostrar» en vez de campo de confirmación: en un teclado de teléfono el error
// de tipeo es más probable, y verlo escrito lo evita mejor que repetirlo.
// Registrada en PerfilStack, MusicoStack y MiLocalStack: solo usa goBack.
export default function CambiarContrasenaScreen() {
  const navigation = useNavigation();
  const { user, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ code?: string; message?: string } | null>(null);
  const [listo, setListo] = useState(false);

  if (!user) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.texto}>Inicia sesión para cambiar tu contraseña.</Text>
      </View>
    );
  }

  if (listo) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.texto}>Listo. Desde ahora puedes entrar con tu correo y esta contraseña.</Text>
        <TouchableOpacity style={styles.boton} onPress={() => navigation.goBack()}>
          <Text style={styles.textoBoton}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const falta = faltaEnContrasena(password);
  const deshabilitado = falta.length > 0 || enviando;

  const guardar = async () => {
    setEnviando(true);
    setError(null);
    const { error: err } = await cambiarContrasena(password);
    setEnviando(false);
    if (err) {
      setError({ code: err.code, message: err.message });
      return;
    }
    setListo(true);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Text style={styles.titulo}>Contraseña de tu cuenta</Text>
      <Text style={styles.correo}>{user.email}</Text>

      <Text style={styles.label}>Contraseña nueva</Text>
      <View style={styles.filaCampo}>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!mostrar}
          autoComplete="new-password"
          textContentType="newPassword"
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.muted}
        />
        <TouchableOpacity style={styles.botonMostrar} onPress={() => setMostrar((m) => !m)}>
          <Text style={styles.textoMostrar}>{mostrar ? 'Ocultar' : 'Mostrar'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.requisitos}>
        {REGLA_CONTRASENA.map((r) => {
          const cumple = r.cumple(password);
          return (
            <Text key={r.texto} style={[styles.requisito, { color: cumple ? colors.success : colors.muted }]}>
              {cumple ? '✓' : '○'} {r.texto}
            </Text>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.boton, deshabilitado && styles.botonDesactivado]}
        onPress={guardar}
        disabled={deshabilitado}
      >
        <Text style={styles.textoBoton}>{enviando ? 'Un momento…' : 'Guardar contraseña'}</Text>
      </TouchableOpacity>

      {error && (
        <>
          <Text style={styles.error}>{mensajeDeErrorAuth(error, password)}</Text>
          {error.code === 'reauthentication_needed' && (
            <TouchableOpacity style={styles.botonSalir} onPress={signOut}>
              <Text style={styles.textoSalir}>Cerrar sesión</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: spacing.lg },
  centrado: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  texto: { fontSize: fontSize.md, color: colors.secondary, textAlign: 'center', marginBottom: spacing.lg },
  titulo: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.primary },
  correo: { fontSize: fontSize.md, color: colors.secondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  label: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary, marginBottom: spacing.sm },
  filaCampo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: 12,
    fontSize: fontSize.md,
    color: colors.primary,
  },
  botonMostrar: { paddingVertical: 12, paddingHorizontal: spacing.sm },
  textoMostrar: { color: colors.accent, fontWeight: '600', fontSize: fontSize.sm },
  requisitos: { marginTop: spacing.md, marginBottom: spacing.lg, gap: spacing.xs },
  requisito: { fontSize: fontSize.sm },
  boton: { backgroundColor: colors.accent, paddingVertical: 14, paddingHorizontal: spacing.lg, borderRadius: borderRadius.sm, alignItems: 'center' },
  botonDesactivado: { opacity: 0.5 },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.md },
  botonSalir: { marginTop: spacing.md, alignItems: 'center', paddingVertical: spacing.sm },
  textoSalir: { color: colors.danger, fontWeight: '600', fontSize: fontSize.md },
});
