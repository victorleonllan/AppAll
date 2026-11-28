import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { spacing, borderRadius, fontSize, Paleta } from "../theme";
import { useEstilos } from "../hooks/useEstilos";
import { useTema } from "../context/TemaContext";
import { validarCorreo } from "../lib/validacionAuth";

type RoleOption = "musician" | "local";
type Campo = "nombre" | "email" | "password";
type Errores = Partial<Record<Campo, string>>;

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
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [role, setRole] = useState<RoleOption>(preselectedRole);
  // Spec 203 — cada error bajo su campo, o sobre el botón si es de la cuenta.
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [correoEnviado, setCorreoEnviado] = useState(false);
  const { crearCuenta } = useAuth();

  const escribirEnCampo = (campo: Campo, valor: string) => {
    const guardar = { nombre: setNombre, email: setEmail, password: setPassword }[campo];
    guardar(valor);
    setErrores((previos) => ({ ...previos, [campo]: undefined }));
  };

  const handleRegister = async () => {
    setErrores({});
    setErrorGeneral(null);
    const correoValido = validarCorreo(email);
    const nuevos: Errores = {};
    if (!nombre.trim()) nuevos.nombre = "Falta el nombre";
    if (correoValido !== true) nuevos.email = correoValido;
    if (!password) nuevos.password = "Falta la contraseña";
    if (nuevos.nombre || nuevos.email || nuevos.password) {
      setErrores(nuevos);
      return;
    }
    setCreando(true);
    const { error, sesion } = await crearCuenta(email.trim(), password, role, nombre);
    setCreando(false);
    if (error) {
      if (error.campo) setErrores({ [error.campo]: error.mensaje });
      else setErrorGeneral(error.mensaje);
      return;
    }
    if (!sesion) setCorreoEnviado(true);
  };

  if (correoEnviado) {
    return (
      <View style={styles.container}>
        <Text style={styles.icono}>🎸</Text>
        <Text style={styles.titulo}>Crear cuenta</Text>
        <Text style={styles.texto}>Revisa tu correo para confirmar la cuenta.</Text>
        <TouchableOpacity onPress={onSwitchToLogin}>
          <Text style={styles.link}>¿Ya tienes cuenta? Inicia sesión</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.botonVolver}>
        <Text style={styles.textoVolver}>← Volver</Text>
      </TouchableOpacity>

      <Text style={styles.icono}>🎸</Text>
      <Text style={styles.titulo}>Crear cuenta</Text>

      <TextInput
        style={[styles.input, errores.nombre && styles.inputConError]}
        placeholder="Nombre / Nombre del proyecto"
        placeholderTextColor={colores.muted}
        value={nombre}
        onChangeText={(valor) => escribirEnCampo("nombre", valor)}
      />
      {errores.nombre && (
        <Text style={styles.textoError} accessibilityLabel={errores.nombre}>{errores.nombre}</Text>
      )}
      <TextInput
        style={[styles.input, errores.email && styles.inputConError]}
        placeholder="Correo electrónico"
        placeholderTextColor={colores.muted}
        value={email}
        onChangeText={(valor) => escribirEnCampo("email", valor)}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      {errores.email && (
        <Text style={styles.textoError} accessibilityLabel={errores.email}>{errores.email}</Text>
      )}
      <TextInput
        style={[styles.input, errores.password && styles.inputConError]}
        placeholder="Contraseña (mín. 6 caracteres)"
        placeholderTextColor={colores.muted}
        value={password}
        onChangeText={(valor) => escribirEnCampo("password", valor)}
        secureTextEntry
      />
      {errores.password && (
        <Text style={styles.textoError} accessibilityLabel={errores.password}>{errores.password}</Text>
      )}

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
          style={[styles.botonRol, role === "local" && styles.botonRolActivo]}
          onPress={() => setRole("local")}
        >
          <Text
            style={[styles.textoRol, role === "local" && styles.textoRolActivo]}
          >
            📍 Dueño de local
          </Text>
        </TouchableOpacity>
      </View>

      {errorGeneral && (
        <View style={styles.bloqueError}>
          <Text style={styles.textoBloqueError} accessibilityLabel={errorGeneral}>{errorGeneral}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.boton, creando && styles.botonDeshabilitado]}
        onPress={handleRegister}
        disabled={creando}
      >
        <Text style={styles.textoBoton}>{creando ? "Un momento…" : "Crear cuenta"}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onSwitchToLogin}>
        <Text style={styles.link}>¿Ya tienes cuenta? Inicia sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  botonVolver: { alignSelf: "flex-start", marginBottom: spacing.sm },
  textoVolver: { fontSize: fontSize.md, color: c.accent, fontWeight: "600" },
  icono: { fontSize: fontSize.xxl },
  titulo: {
    fontSize: fontSize.xl,
    fontWeight: "bold",
    color: c.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  input: {
    width: "100%",
    backgroundColor: c.cardBackground,
    padding: 14,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    fontSize: fontSize.md,
    color: c.primary,
    borderWidth: 1,
    borderColor: c.border,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: c.primary,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  roles: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  botonRol: {
    flex: 1,
    padding: 12,
    borderRadius: borderRadius.sm,
    backgroundColor: c.accentLight,
    alignItems: "center",
  },
  botonRolActivo: { backgroundColor: c.accent },
  textoRol: { fontSize: fontSize.sm, color: c.secondary },
  textoRolActivo: { color: c.onAccent, fontWeight: "bold" },
  boton: {
    width: "100%",
    backgroundColor: c.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  textoBoton: { color: c.onAccent, fontWeight: "bold", fontSize: fontSize.md },
  botonDeshabilitado: { opacity: 0.6 },
  texto: {
    color: c.primary,
    fontSize: fontSize.md,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  textoError: {
    alignSelf: "flex-start",
    color: c.danger,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  inputConError: { borderColor: c.danger, borderWidth: 1.5 },
  bloqueError: {
    width: "100%",
    backgroundColor: c.dangerBg,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
  },
  textoBloqueError: { color: c.dangerText, fontSize: fontSize.sm },
  link: {
    color: c.accent,
    marginTop: spacing.md,
    fontSize: fontSize.sm,
  },
});
