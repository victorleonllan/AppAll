import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';
import CarteleraScreen from '../screens/CarteleraScreen';
import AuthScreen from '../screens/AuthScreen';
import PerfilMusicoScreen from '../screens/PerfilMusicoScreen';
import PerfilScreen from '../screens/PerfilScreen';
import CafesStack from './CafesStack';
import CafeStack from './CafeStack';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

type UserRole = 'public' | 'musician' | 'cafe' | null;

const Tab = createBottomTabNavigator();

function getThirdTab(session: unknown, role: UserRole) {
  if (!session) return { name: 'AppAll' as const, component: AuthScreen, icon: 'apps' as const };
  if (role === 'musician') return { name: 'Mi Perfil' as const, component: PerfilMusicoScreen, icon: 'person-circle' as const };
  if (role === 'cafe') return { name: 'Mi Café' as const, component: CafeStack, icon: 'cafe' as const };
  return { name: 'Perfil' as const, component: PerfilScreen, icon: 'person' as const };
}

export default function AppNavigator() {
  const { session, role, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const thirdTab = getThirdTab(session, role);

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'musical-notes';
            if (route.name === 'Cartelera') iconName = 'musical-notes';
            else if (route.name === 'Cafés') iconName = 'cafe';
            else iconName = thirdTab.icon;
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
        })}
      >
        <Tab.Screen name="Cartelera" component={CarteleraScreen} />
        <Tab.Screen
          name="Cafés"
          component={CafesStack}
          options={{ headerShown: false }}
        />
        <Tab.Screen
          name={thirdTab.name}
          component={thirdTab.component}
          options={{
            headerShown: thirdTab.name !== 'AppAll' && thirdTab.name !== 'Mi Café',
            title: thirdTab.name,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
