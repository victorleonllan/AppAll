import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { colors, spacing, borderRadius, fontSize } from "../theme";

interface Props {
  errorDescription: string | null;
}

// A donde mandamos a rehacer el login. Deliberadamente fuera de la app: el
// origin en el que cayó el usuario puede ser el mismo deployment reciclado
// que provocó el error, así que no conviene reintentar desde acá.
const LOGIN_URL = "https://sonopolis.org/unete";

// Placeholder de estilos — el diseño final se arma aparte (Victor lo hace en
// otra ventana). Esto solo deja la lógica funcionando: lee el error, lo
// muestra, y da un único camino de salida.
export default function OAuthErrorScreen({ errorDescription }: Props) {
  const handleVolver = () => {
    Linking.openURL(LOGIN_URL);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.icono}>⚠️</Text>
      <Text style={styles.titulo}>No se pudo completar el login</Text>
      <Text style={styles.mensaje}>
        {errorDescription ?? "El enlace de Google expiró o se canceló."}
      </Text>
      <TouchableOpacity style={styles.boton} onPress={handleVolver}>
        <Text style={styles.textoBoton}>Volver a intentar</Text>
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
  icono: { fontSize: fontSize.xxl, marginBottom: spacing.sm },
  titulo: {
    fontSize: fontSize.xl,
    fontWeight: "bold",
    color: colors.primary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  mensaje: {
    fontSize: fontSize.md,
    color: colors.secondary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  boton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.sm,
  },
  textoBoton: { color: colors.white, fontWeight: "bold", fontSize: fontSize.md },
});
