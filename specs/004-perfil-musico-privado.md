---
status: ✅ COMPLETADO
implementado_por: OpenCode + Hermes
fecha: 2026-06-11
---

# Spec 004: Perfil músico privado + Landing de roles

## Objetivo

Rediseñar la pantalla de Ingresar para que muestre los tres roles de AppAll desde el inicio (Público, Músico, Café), y crear el perfil privado del músico (bio, Instagram, Spotify, YouTube) visible para cafés.

---

## Archivos a tocar

- `src/screens/AuthScreen.tsx` — **reescribir**: ahora es el landing de roles
- `src/screens/RegisterScreen.tsx` — modificar: recibe rol pre-seleccionado
- `src/types/index.ts` — agregar interfaz `PerfilMusico` (ya está)
- `src/data/mock/musicos.ts` — crear datos mock (ya está)
- `src/screens/PerfilMusicoScreen.tsx` — crear pantalla editable (ya está)
- `src/screens/VerMusicoScreen.tsx` — crear pantalla read-only
- `src/screens/CafesScreen.tsx` — modificar (agregar "Buscar músicos")
- `src/navigation/index.tsx` — modificar (tercer tab dinámico según rol)
- `src/navigation/CafesStack.tsx` — crear stack para navegar a VerMusico

---

## Pasos de implementación

### 1. Reescribir `src/screens/AuthScreen.tsx` — Landing de roles

Reemplazar TODO el contenido de AuthScreen. Ahora es la pantalla que ve cualquier usuario sin sesión al tocar el tercer tab.

```tsx
import { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import RegisterScreen from "./RegisterScreen";
import LoginScreen from "./LoginScreen";
import { colors, spacing, borderRadius, fontSize } from "../theme";

type RoleOption = "public" | "musician" | "cafe";
type AuthView = "landing" | "register" | "login";

export default function AuthScreen() {
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

  // Landing: bienvenida con 3 opciones de rol
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>¡Bienvenido a AppAll!</Text>
      <Text style={styles.subtitle}>
        Conectamos público, músicos y cafés en Santiago.
      </Text>

      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          // Público no necesita registro — puede explorar directo
          // El tab ya existe (Cartelera, Cafés)
        }}
      >
        <Text style={styles.cardIcon}>🎭</Text>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Público</Text>
          <Text style={styles.cardDesc}>
            Descubre música en vivo en los mejores cafés
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.card, styles.cardHighlight]}
        onPress={() => {
          setSelectedRole("musician");
          setView("register");
        }}
      >
        <Text style={styles.cardIcon}>🎸</Text>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Músico</Text>
          <Text style={styles.cardDesc}>
            Consigue tocatas y muestra tu arte
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.card, styles.cardHighlight]}
        onPress={() => {
          setSelectedRole("cafe");
          setView("register");
        }}
      >
        <Text style={styles.cardIcon}>☕</Text>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Dueño de café</Text>
          <Text style={styles.cardDesc}>
            Llena tu sala con talento en vivo
          </Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.footer}>
            Puedes explorar la cartelera sin crear cuenta.
          </Text>
        </ScrollView>
      );
    }

    // ... styles con tokens del theme
```

La tarjeta de Público no redirige a registro — solo es informativa. El usuario puede explorar los tabs Cartelera y Cafés libremente.

Usar estos tokens:
- `colors.background` para fondo
- `colors.cardBackground` para cada tarjeta
- `colors.primary` para títulos
- `colors.secondary` para descripciones
- `colors.accent` para borde izquierdo de tarjetas Músico/Café
- `colors.muted` para textos secundarios
- `colors.accentLight` para fondos de tarjeta destacada
- `spacing.md`, `spacing.lg`, `fontSize.lg`, `fontSize.md`, `borderRadius.lg`

### 2. Modificar `src/screens/RegisterScreen.tsx`

Recibir `preselectedRole` como prop. Si viene, mostrar ese rol ya seleccionado por defecto. Además, agregar botón "Volver" (flecha) en vez de depender solo del header.

Props actualizadas:
```tsx
interface Props {
  preselectedRole: "musician" | "cafe";
  onSwitchToLogin: () => void;
  onBack: () => void;
}
```

Agregar un `TouchableOpacity` con "← Volver" al inicio del formulario.

### 3. Modificar `src/screens/LoginScreen.tsx`

Agregar prop `onBack` para volver al landing:
```tsx
interface Props {
  onSwitchToRegister: () => void;
  onBack: () => void;
}
```

Agregar "← Volver" al inicio.

### 4–7. Resto de spec 004 (PerfilMusicoScreen, VerMusicoScreen, mock, navegación)

Se mantienen IGUAL que en la versión anterior del spec. La navegación dinámica con `getThirdTab` sigue igual:

```tsx
function getThirdTab(session, role) {
  if (!session) return { name: "AppAll", component: AuthScreen, icon: "apps" };
  if (role === "musician") return { name: "Mi Perfil", component: PerfilMusicoScreen, icon: "person-circle" };
  if (role === "cafe") return { name: "Mi Café", component: DashboardCafeScreen, icon: "cafe" };
  return { name: "Perfil", component: PerfilScreen, icon: "person" };
}
```

NOTA: Cambiar el nombre del tab de "Ingresar" a "AppAll" cuando no hay sesión, con ícono de "apps" (grid).

### El resto (mock data, PerfilMusicoScreen, VerMusicoScreen, CafesStack, CafesScreen) no cambia respecto al spec anterior.

---

## Diseño / UI

- Landing centrado, scroll vertical si es necesario
- Tarjetas con icono grande a la izquierda, título y descripción
- Tarjetas de Músico y Café tienen borde izquierdo accent (como TarjetaEvento)
- Tarjeta de Público más tenue, sin acción de registro
- Footer: "Puedes explorar la cartelera sin crear cuenta"
- RegisterScreen y LoginScreen mantienen su diseño actual + botón Volver

---

## Criterios de aceptación

- [ ] AuthScreen muestra 3 tarjetas de rol al abrir AppAll sin sesión
- [ ] Al tocar "Músico" → RegisterScreen con rol musician pre-seleccionado
- [ ] Al tocar "Café" → RegisterScreen con rol cafe pre-seleccionado
- [ ] Al tocar "Público" → no pasa nada (sigue en landing, puede ir a Cartelera)
- [ ] RegisterScreen y LoginScreen tienen botón "← Volver" al landing
- [ ] `PerfilMusico` type existe en types/index.ts
- [ ] Datos mock de 3 músicos creados
- [ ] PerfilMusicoScreen editable funcional para músico logueado
- [ ] VerMusicoScreen read-only para cafés
- [ ] Tercer tab dinámico según rol (AppAll / Mi Perfil / Mi Café / Perfil)
- [ ] CafesStack existe con navegación a VerMusicoScreen
- [ ] CafesScreen tiene sección "Buscar músicos por género"
- [ ] TypeScript compila sin errores (`npx tsc --noEmit`)
