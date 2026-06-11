import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardCafeScreen from '../screens/DashboardCafeScreen';
import CrearEventoScreen from '../screens/CrearEventoScreen';
import VerMusicoScreen from '../screens/VerMusicoScreen';
import { colors, fontSize } from '../theme';

export type CafeStackParamList = {
  Dashboard: undefined;
  CrearEvento: undefined;
  VerMusico: { musicoId: string };
};

const Stack = createNativeStackNavigator<CafeStackParamList>();

export default function CafeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontSize: fontSize.lg },
      }}
    >
      <Stack.Screen name="Dashboard" component={DashboardCafeScreen} options={{ title: 'Mi Café' }} />
      <Stack.Screen name="CrearEvento" component={CrearEventoScreen} options={{ title: 'Nuevo Evento' }} />
      <Stack.Screen name="VerMusico" component={VerMusicoScreen} options={{ title: 'Músico' }} />
    </Stack.Navigator>
  );
}
