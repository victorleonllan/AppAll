# Spec 003: Autenticación con roles (Supabase Auth)

## Objetivo

Configurar Supabase Auth con registro/login por roles (público, músico, café). Crear el flujo de autenticación que separe lo público de lo privado.

---

## Fase 0: Setup manual en Supabase (hacerlo VICTOR, no OpenCode)

1. Ir a https://supabase.com y crear un proyecto nuevo (gratuito)
2. Anotar la **Project URL** y la **anon public key** de Settings > API
3. Ir a SQL Editor y ejecutar:

```sql
-- Tabla de perfiles con rol
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('public', 'musician', 'cafe')),
  nombre TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, nombre)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'public'),
    COALESCE(NEW.raw_user_meta_data->>'nombre', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

4. Copiar Project URL y anon key para usarlas en el .env

---

## Fase 1: Instalar dependencias

```bash
npm install @supabase/supabase-js
npm install @react-native-async-storage/async-storage
```

---

## Fase 2: Cliente Supabase

Crear `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

---

## Fase 3: Variables de entorno

Crear `.env` en la raíz del proyecto (NO subir a git):

```
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

Agregar `.env` al `.gitignore` si no está ya.

---

## Fase 4: Contexto de autenticación

Crear `src/context/AuthContext.tsx`:

```typescript
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';

type UserRole = 'public' | 'musician' | 'cafe' | null;

interface AuthState {
  session: Session | null;
  user: User | null;
  role: UserRole;
  loading: boolean;
  signUp: (email: string, password: string, role: UserRole, nombre: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setRole((session?.user?.user_metadata?.role as UserRole) ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setRole((session?.user?.user_metadata?.role as UserRole) ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, role: UserRole, nombre: string): Promise<string | null> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, nombre },
      },
    });
    return error ? error.message : null;
  };

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

---

## Fase 5: Pantalla de Login

Crear `src/screens/LoginScreen.tsx`:

```typescript
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
```

---

## Fase 6: Pantalla de Registro

Crear `src/screens/RegisterScreen.tsx`:

```typescript
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type RoleOption = 'musician' | 'cafe';

interface Props {
  onSwitchToLogin: () => void;
}

export default function RegisterScreen({ onSwitchToLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [role, setRole] = useState<RoleOption>('musician');
  const { signUp } = useAuth();

  const handleRegister = async () => {
    if (!nombre.trim()) {
      Alert.alert('Error', 'Ingresa tu nombre o el nombre de tu proyecto');
      return;
    }
    const error = await signUp(email, password, role, nombre);
    if (error) {
      Alert.alert('Error', error);
    } else {
      Alert.alert('Listo', 'Revisa tu correo para confirmar la cuenta');
    }
  };

  return (
    <View style={styles.container}>
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
          style={[styles.botonRol, role === 'musician' && styles.botonRolActivo]}
          onPress={() => setRole('musician')}
        >
          <Text style={[styles.textoRol, role === 'musician' && styles.textoRolActivo]}>🎸 Músico</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.botonRol, role === 'cafe' && styles.botonRolActivo]}
          onPress={() => setRole('cafe')}
        >
          <Text style={[styles.textoRol, role === 'cafe' && styles.textoRolActivo]}>☕ Dueño de café</Text>
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
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  icono: { fontSize: fontSize.xxl },
  titulo: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.primary, marginTop: spacing.sm, marginBottom: spacing.lg },
  input: { width: '100%', backgroundColor: colors.cardBackground, padding: 14, borderRadius: borderRadius.sm, marginBottom: spacing.sm, fontSize: fontSize.md, color: colors.primary, borderWidth: 1, borderColor: colors.border },
  label: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary, alignSelf: 'flex-start', marginTop: spacing.sm, marginBottom: spacing.xs },
  roles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  botonRol: { flex: 1, padding: 12, borderRadius: borderRadius.sm, backgroundColor: colors.accentLight, alignItems: 'center' },
  botonRolActivo: { backgroundColor: colors.accent },
  textoRol: { fontSize: fontSize.sm, color: colors.secondary },
  textoRolActivo: { color: colors.white, fontWeight: 'bold' },
  boton: { width: '100%', backgroundColor: colors.accent, padding: 14, borderRadius: borderRadius.sm, alignItems: 'center', marginTop: spacing.sm },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  link: { color: colors.accent, marginTop: spacing.md, fontSize: fontSize.sm },
});
```

---

## Fase 7: Pantalla de autenticación (contenedor)

Crear `src/screens/AuthScreen.tsx`:

```typescript
import { useState } from 'react';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';

export default function AuthScreen() {
  const [showLogin, setShowLogin] = useState(true);

  return showLogin ? (
    <LoginScreen onSwitchToRegister={() => setShowLogin(false)} />
  ) : (
    <RegisterScreen onSwitchToLogin={() => setShowLogin(true)} />
  );
}
```

---

## Fase 8: Actualizar navegación

Reemplazar `src/navigation/index.tsx`:

```typescript
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';
import CarteleraScreen from '../screens/CarteleraScreen';
import CafesScreen from '../screens/CafesScreen';
import AuthScreen from '../screens/AuthScreen';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'musical-notes';
            if (route.name === 'Cartelera') iconName = 'musical-notes';
            else if (route.name === 'Cafés') iconName = 'cafe';
            else iconName = session ? 'person-circle' : 'log-in';
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
        })}
      >
        <Tab.Screen name="Cartelera" component={CarteleraScreen} />
        <Tab.Screen name="Cafés" component={CafesScreen} />
        <Tab.Screen
          name={session ? 'Perfil' : 'Ingresar'}
          component={AuthScreen}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

---

## Fase 9: Actualizar App.tsx

Reemplazar `App.tsx`:

```typescript
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation';

export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
      <StatusBar style="light" />
    </AuthProvider>
  );
}
```

---

## Criterios de aceptación

- [ ] Supabase project creado y SQL migration ejecutada
- [ ] `.env` configurado con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY
- [ ] `src/lib/supabase.ts` creado
- [ ] `src/context/AuthContext.tsx` creado con signUp, signIn, signOut
- [ ] `src/screens/LoginScreen.tsx` funcional
- [ ] `src/screens/RegisterScreen.tsx` con selector de rol (músico / café)
- [ ] `src/screens/AuthScreen.tsx` alterna entre login y registro
- [ ] Navegación actualizada: tercer tab muestra "Ingresar" si no hay sesión, "Perfil" si hay
- [ ] App.tsx envuelto en AuthProvider
- [ ] La app compila sin errores
- [ ] Se puede registrar un usuario y ver el cambio en Supabase dashboard