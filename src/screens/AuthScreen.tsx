import { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import RegisterScreen from "./RegisterScreen";
import LoginScreen from "./LoginScreen";
import { spacing, borderRadius, fontSize, Paleta } from "../theme";
import { useEstilos } from "../hooks/useEstilos";

type RoleOption = "musician" | "local";
type AuthView = "landing" | "register" | "login";

export default function AuthScreen() {
  const styles = useEstilos(crearEstilos);
  const [view, setView] = useState<AuthView>("landing");
  const [selectedRole, setSelectedRole] = useState<RoleOption>("musician");

  if (view === "register") {
    return (
      <RegisterScreen
        preselectedRole={selectedRole}
        onSwitchToLogin={() => setView("login")}
        onBack={() => setView("landing")}
      />
    );
  }

  if (view === "login") {
    return (
      <LoginScreen
        onSwitchToRegister={() => setView("register")}
        onBack={() => setView("landing")}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.icon}>🎶</Text>
      <Text style={styles.title}>¡Bienvenido a Sonópolis!</Text>
      <Text style={styles.subtitle}>
        Conectamos público, músicos y locales en Santiago.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardIcon}>🎭</Text>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>Público</Text>
          <Text style={styles.cardDesc}>
            Descubre músicos y eventos en vivo en los mejores locales
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.card, styles.cardAction]}
        onPress={() => {
          setSelectedRole("musician");
          setView("register");
        }}
      >
        <Text style={styles.cardIcon}>🎸</Text>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, styles.cardTitleAction]}>Músico</Text>
          <Text style={styles.cardDesc}>
            Consigue tocatas y muestra tu arte al mundo
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.card, styles.cardAction]}
        onPress={() => {
          setSelectedRole("local");
          setView("register");
        }}
      >
        <Text style={styles.cardIcon}>📍</Text>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, styles.cardTitleAction]}>
            Dueño de local
          </Text>
          <Text style={styles.cardDesc}>
            Llena tu sala con talento en vivo
          </Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.footer}>
        Puedes explorar la cartelera sin crear cuenta.
      </Text>

      <TouchableOpacity onPress={() => setView("login")}>
        <Text style={styles.loginLink}>¿Ya tienes cuenta? Inicia sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: spacing.lg, paddingTop: 60, alignItems: "center" },
  icon: { fontSize: fontSize.xxl, marginBottom: spacing.sm },
  title: {
    fontSize: fontSize.xl,
    fontWeight: "bold",
    color: c.primary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: fontSize.md,
    color: c.secondary,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  card: {
    width: "100%",
    backgroundColor: c.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: c.muted,
    opacity: 0.85,
  },
  cardAction: {
    borderLeftColor: c.accent,
    opacity: 1,
  },
  cardIcon: { fontSize: 32, marginRight: spacing.md },
  cardBody: { flex: 1 },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: c.secondary,
  },
  cardTitleAction: { color: c.primary },
  cardDesc: {
    fontSize: fontSize.sm,
    color: c.muted,
    marginTop: 2,
    lineHeight: 18,
  },
  footer: {
    fontSize: fontSize.xs,
    color: c.muted,
    textAlign: "center",
    marginTop: spacing.lg,
    fontStyle: "italic",
  },
  loginLink: {
    color: c.accent,
    fontSize: fontSize.sm,
    fontWeight: "600",
    textAlign: "center",
    marginTop: spacing.md,
  },
});
