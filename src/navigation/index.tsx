import { useMemo } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme, Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';
import CarteleraStack from './CarteleraStack';
import AuthScreen from '../screens/AuthScreen';
import MusicoStack from './MusicoStack';
import PerfilStack from './PerfilStack';
import LocalesStack from './LocalesStack';
import MiLocalStack from './MiLocalStack';
import { linking } from './linking';
import { useAuth, UserRole } from '../context/AuthContext';
import { useTema } from '../context/TemaContext';

const Tab = createBottomTabNavigator();

function getThirdTab(session: unknown, role: UserRole) {
  if (!session) return { name: 'Sonópolis' as const, component: AuthScreen, icon: 'apps' as const };
  if (role === 'musician') return { name: 'Mi Perfil' as const, component: MusicoStack, icon: 'person-circle' as const };
  if (role === 'local') return { name: 'Mi Local' as const, component: MiLocalStack, icon: 'location' as const };
  // Spec 114 — con stack propio, para que el fan pueda navegar desde su perfil
  // (Mis entradas, Mi panel) y una sesión sin rol entre por ElegirRol.
  return { name: 'Perfil' as const, component: PerfilStack, icon: 'person' as const };
}

export default function AppNavigator() {
  const { session, role, loading } = useAuth();
  const { tema, colores } = useTema();

  // Spec 174 — sin `theme`, React Navigation usa su DefaultTheme y el fondo detrás de
  // cada pantalla y la barra de pestañas quedan claros en oscuro. Se parte del tema
  // base porque en v7 el tema exige también `fonts`.
  const temaNavegacion = useMemo<Theme>(() => {
    const base = tema === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        primary: colores.accent,
        background: colores.background,
        card: colores.cardBackground,
        text: colores.primary,
        border: colores.border,
        notification: colores.danger,
      },
    };
  }, [tema, colores]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colores.background }}>
        <ActivityIndicator size="large" color={colores.accent} />
      </View>
    );
  }

  const thirdTab = getThirdTab(session, role);

  return (
    <NavigationContainer linking={linking} theme={temaNavegacion}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'musical-notes';
            if (route.name === 'Cartelera') iconName = 'musical-notes';
            else if (route.name === 'Locales') iconName = 'location';
            else iconName = thirdTab.icon;
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: colores.accent,
          tabBarInactiveTintColor: colores.muted,
          headerStyle: { backgroundColor: colores.block },
          headerTintColor: colores.white,
        })}
      >
        <Tab.Screen
          name="Cartelera"
          component={CarteleraStack}
          options={{ headerShown: false }}
        />
        <Tab.Screen
          name="Locales"
          component={LocalesStack}
          options={{ headerShown: false }}
        />
        <Tab.Screen
          name={thirdTab.name}
          component={thirdTab.component}
          options={{
            // Las cuatro variantes ocultan el header de la pestaña: AuthScreen no
            // lo usa y los tres stacks ponen el suyo (PerfilStack desde el spec 114).
            headerShown: false,
            title: thirdTab.name,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
