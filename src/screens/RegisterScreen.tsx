import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors, spacing, borderRadius, fontSize } from "../theme";

type RoleOption = "musician" | "cafe";

interface Props {
  preselectedRole: RoleOption;
  onSwitchToLogin: () => void;
  onBack: () => void;
}

export default function RegisterScreen({
  preselectedRole,
  onSwitchToLogin,
  onBack,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [role, setRole] = useState<RoleOption>(preselectedRole);
  const { signUp } = useAuth();

  const handleRegister = async () => {
    if (!nombre.trim()) {
      Alert.alert("Error", "Ingresa tu nombre o el nombre de tu proyecto");
      return;
    }
    const error = await signUp(email, password, role, nombre);
    if (error) {
      Alert.alert("Error", error);
    } else {
      Alert.alert("Listo", "Revisa tu correo para confirmar la cuenta");
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.botonVolver}>
        <Text style={styles.textoVolver}>← Volver</Text>
      </TouchableOpacity>

      <Text style={styles.icono}>🎸</Text>
      <Text style={styles.titulo}>Crear cuenta</Text>

      <TextInput
        style={styles.input}
        placeholder="Nombre / Nombre del proyecto"
        placeholderTextColor={colors.muted}
        value={nombre}
        onChangeText={setNombre}
      />
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
        placeholder="Contraseña (mín. 6 caracteres)"
        placeholderTextColor={colors.muted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <Text style={styles.label}>Soy...</Text>
      <View style={styles.roles}>
        <TouchableOpacity
          style={[styles.botonRol, role === "musician" && styles.botonRolActivo]}
          onPress={() => setRole("musician")}
        >
          <Text
            style={[styles.textoRol, role === "musician" && styles.textoRolActivo]}
          >
            🎸 Músico
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.botonRol, role === "cafe" && styles.botonRolActivo]}
          onPress={() => setRole("cafe")}
        >
          <Text
            style={[styles.textoRol, role === "cafe" && styles.textoRolActivo]}
          >
            📍 Dueño de local
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.boton} onPress={handleRegister}>
        <Text style={styles.textoBoton}>Crear cuenta</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onSwitchToLogin}>
        <Text style={styles.link}>¿Ya tienes cuenta? Inicia sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  botonVolver: { alignSelf: "flex-start", marginBottom: spacing.sm },
  textoVolver: { fontSize: fontSize.md, color: colors.accent, fontWeight: "600" },
  icono: { fontSize: fontSize.xxl },
  titulo: {
    fontSize: fontSize.xl,
    fontWeight: "bold",
    color: colors.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  input: {
    width: "100%",
    backgroundColor: colors.cardBackground,
    padding: 14,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: colors.primary,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  roles: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  botonRol: {
    flex: 1,
    padding: 12,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.accentLight,
    alignItems: "center",
  },
  botonRolActivo: { backgroundColor: colors.accent },
  textoRol: { fontSize: fontSize.sm, color: colors.secondary },
  textoRolActivo: { color: colors.white, fontWeight: "bold" },
  boton: {
    width: "100%",
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  textoBoton: { color: colors.white, fontWeight: "bold", fontSize: fontSize.md },
  link: {
    color: colors.accent,
    marginTop: spacing.md,
    fontSize: fontSize.sm,
  },
});
