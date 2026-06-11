import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, borderRadius, fontSize } from '../theme';

interface Props {
  onSwitchToRegister: () => void;
}

export default function LoginScreen({ onSwitchToRegister }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn } = useAuth();

  const handleLogin = async () => {
    const error = await signIn(email, password);
    if (error) Alert.alert('Error', error);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.icono}>🔐</Text>
      <Text style={styles.titulo}>Iniciar sesión</Text>

      <TextInput
        style={styles.input}
        placeholder="Correo electrónico"
        placeholderTextColor={colors.muted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        placeholderTextColor={colors.muted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.boton} onPress={handleLogin}>
        <Text style={styles.textoBoton}>Entrar</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onSwitchToRegister}>
        <Text style={styles.link}>¿No tienes cuenta? Regístrate</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  icono: { fontSize: fontSize.xxl },
  titulo: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.primary, marginTop: spacing.sm, marginBottom: spacing.lg },
  input: { width: '100%', backgroundColor: colors.cardBackground, padding: 14, borderRadius: borderRadius.sm, marginBottom: spacing.sm, fontSize: fontSize.md, color: colors.primary, borderWidth: 1, borderColor: colors.border },
  boton: { width: '100%', backgroundColor: colors.accent, padding: 14, borderRadius: borderRadius.sm, alignItems: 'center', marginTop: spacing.sm },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  link: { color: colors.accent, marginTop: spacing.md, fontSize: fontSize.sm },
});
