import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors, spacing, borderRadius, fontSize } from "../theme";

interface Props {
  onSwitchToRegister: () => void;
  onBack: () => void;
}

export default function LoginScreen({ onSwitchToRegister, onBack }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargandoGoogle, setCargandoGoogle] = useState(false);
  // Spec 145 — recuperación de contraseña por enlace a la web.
  const [modo, setModo] = useState<"login" | "recuperar" | "enviado">("login");
  const [enviando, setEnviando] = useState(false);
  const [errorRecuperar, setErrorRecuperar] = useState<string | null>(null);
  const { signIn, signInWithGoogle, pedirEnlaceRecuperacion } = useAuth();

  const handleLogin = async () => {
    const error = await signIn(email, password);
    if (error) Alert.alert("Error", error);
  };

  const handleLoginGoogle = async () => {
    setCargandoGoogle(true);
    const error = await signInWithGoogle();
    setCargandoGoogle(false);
    if (error) Alert.alert("Error", error);
  };

  const irARecuperar = () => {
    setErrorRecuperar(null);
    setModo("recuperar");
  };

  const volverALogin = () => {
    setErrorRecuperar(null);
    setModo("login");
  };

  // Error en un Text y no en Alert, para que también se lea en el build web.
  const handleEnviarEnlace = async () => {
    const correo = email.trim();
    if (!correo.includes("@")) {
      setErrorRecuperar("Ingresa un correo válido");
      return;
    }
    setErrorRecuperar(null);
    setEnviando(true);
    const error = await pedirEnlaceRecuperacion(correo);
    setEnviando(false);
    if (error) {
      setErrorRecuperar(error);
      return;
    }
    setModo("enviado");
  };

  if (modo !== "login") {
    return (
      <View style={styles.container}>
        <Text style={styles.icono}>✉️</Text>
        <Text style={styles.titulo}>Recuperar contraseña</Text>

        {modo === "recuperar" ? (
          <>
            <Text style={styles.texto}>
              Te mandamos un enlace a tu correo. Al abrirlo eliges una contraseña nueva en
              sonopolis.org, y después entras aquí con ella.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {errorRecuperar && <Text style={styles.textoError}>{errorRecuperar}</Text>}
            <TouchableOpacity
              style={[styles.boton, enviando && styles.botonDeshabilitado]}
              onPress={handleEnviarEnlace}
              disabled={enviando}
            >
              <Text style={styles.textoBoton}>{enviando ? "Un momento…" : "Enviar enlace"}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.texto}>
            Listo. Revisa tu correo (también la carpeta de spam) y abre el enlace.
          </Text>
        )}

        <TouchableOpacity onPress={volverALogin}>
          <Text style={styles.link}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.botonVolver}>
        <Text style={styles.textoVolver}>← Volver</Text>
      </TouchableOpacity>

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

      <TouchableOpacity onPress={irARecuperar}>
        <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
      </TouchableOpacity>

      <View style={styles.divisor}>
        <View style={styles.lineaDivisor} />
        <Text style={styles.textoDivisor}>o</Text>
        <View style={styles.lineaDivisor} />
      </View>

      <TouchableOpacity
        style={styles.botonGoogle}
        onPress={handleLoginGoogle}
        disabled={cargandoGoogle}
      >
        <Text style={styles.textoBotonGoogle}>
          {cargandoGoogle ? "Conectando..." : "Continuar con Google"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onSwitchToRegister}>
        <Text style={styles.link}>¿No tienes cuenta? Regístrate</Text>
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
  boton: {
    width: "100%",
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  textoBoton: { color: colors.white, fontWeight: "bold", fontSize: fontSize.md },
  botonDeshabilitado: { opacity: 0.6 },
  texto: {
    color: colors.primary,
    fontSize: fontSize.md,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  textoError: {
    alignSelf: "flex-start",
    color: colors.danger,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  divisor: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginTop: spacing.md,
  },
  lineaDivisor: { flex: 1, height: 1, backgroundColor: colors.border },
  textoDivisor: {
    color: colors.muted,
    fontSize: fontSize.sm,
    marginHorizontal: spacing.sm,
  },
  botonGoogle: {
    width: "100%",
    backgroundColor: colors.cardBackground,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textoBotonGoogle: { color: colors.primary, fontWeight: "600", fontSize: fontSize.md },
  link: {
    color: colors.accent,
    marginTop: spacing.md,
    fontSize: fontSize.sm,
  },
});
