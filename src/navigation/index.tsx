import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import CarteleraScreen from '../screens/CarteleraScreen';
import CafesScreen from '../screens/CafesScreen';
import PerfilScreen from '../screens/PerfilScreen';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'musical-notes';
            if (route.name === 'Cartelera') iconName = 'musical-notes';
            else if (route.name === 'Cafés') iconName = 'cafe';
            else iconName = 'person';
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
        <Tab.Screen name="Perfil" component={PerfilScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
