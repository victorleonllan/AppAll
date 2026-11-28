import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { spacing, borderRadius, fontSize, Paleta } from "../theme";
import { useEstilos } from "../hooks/useEstilos";
import { useTema } from "../context/TemaContext";
import { validarCorreo } from "../lib/validacionAuth";

interface Props {
  onSwitchToRegister: () => void;
  onBack: () => void;
}

export default function LoginScreen({ onSwitchToRegister, onBack }: Props) {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargandoGoogle, setCargandoGoogle] = useState(false);
  // Spec 145 — recuperación de contraseña por enlace a la web.
  const [modo, setModo] = useState<"login" | "recuperar" | "enviado">("login");
  const [enviando, setEnviando] = useState(false);
  const [errorRecuperar, setErrorRecuperar] = useState<string | null>(null);
  // Spec 203 — cada error bajo su campo, o sobre el botón si es de la cuenta.
  const [errores, setErrores] = useState<{ email?: string; password?: string }>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const { entrar, signInWithGoogle, pedirEnlaceRecuperacion } = useAuth();

  const limpiarErrores = () => {
    setErrores({});
    setErrorGeneral(null);
  };

  const escribirEnCampo = (campo: "email" | "password", valor: string) => {
    if (campo === "email") setEmail(valor);
    else setPassword(valor);
    setErrores((previos) => ({ ...previos, [campo]: undefined }));
    setErrorGeneral(null);
  };

  const handleLogin = async () => {
    limpiarErrores();
    const correoValido = validarCorreo(email);
    const nuevos: { email?: string; password?: string } = {};
    if (correoValido !== true) nuevos.email = correoValido;
    if (!password) nuevos.password = "Falta la contraseña";
    if (nuevos.email || nuevos.password) {
      setErrores(nuevos);
      return;
    }
    setEntrando(true);
    const err = await entrar(email.trim(), password);
    setEntrando(false);
    if (!err) return;
    if (err.campo) setErrores({ [err.campo]: err.mensaje });
    else setErrorGeneral(err.mensaje);
  };

  const handleLoginGoogle = async () => {
    setErrorGeneral(null);
    setCargandoGoogle(true);
    const error = await signInWithGoogle();
    setCargandoGoogle(false);
    if (error) setErrorGeneral(error);
  };

  const irARecuperar = () => {
    setErrorRecuperar(null);
    setModo("recuperar");
  };

  const volverALogin = () => {
    setErrorRecuperar(null);
    setModo("login");
  };

  // Error en un Text y no en un diálogo, para que también se lea en el build web.
  const handleEnviarEnlace = async () => {
    const correo = email.trim();
    const correoValido = validarCorreo(correo);
    if (correoValido !== true) {
      setErrorRecuperar(correoValido);
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
              placeholderTextColor={colores.muted}
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
        placeholder="Contraseña"
        placeholderTextColor={colores.muted}
        value={password}
        onChangeText={(valor) => escribirEnCampo("password", valor)}
        secureTextEntry
      />
      {errores.password && (
        <Text style={styles.textoError} accessibilityLabel={errores.password}>{errores.password}</Text>
      )}

      {errorGeneral && (
        <View style={styles.bloqueError}>
          <Text style={styles.textoBloqueError} accessibilityLabel={errorGeneral}>{errorGeneral}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.boton, entrando && styles.botonDeshabilitado]}
        onPress={handleLogin}
        disabled={entrando}
      >
        <Text style={styles.textoBoton}>{entrando ? "Un momento…" : "Entrar"}</Text>
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
  divisor: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginTop: spacing.md,
  },
  lineaDivisor: { flex: 1, height: 1, backgroundColor: c.border },
  textoDivisor: {
    color: c.muted,
    fontSize: fontSize.sm,
    marginHorizontal: spacing.sm,
  },
  botonGoogle: {
    width: "100%",
    backgroundColor: c.cardBackground,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  textoBotonGoogle: { color: c.primary, fontWeight: "600", fontSize: fontSize.md },
  link: {
    color: c.accent,
    marginTop: spacing.md,
    fontSize: fontSize.sm,
  },
});
