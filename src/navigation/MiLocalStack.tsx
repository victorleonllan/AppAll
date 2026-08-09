import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardLocalScreen from '../screens/DashboardLocalScreen';
import CrearEventoScreen from '../screens/CrearEventoScreen';
import VerMusicoScreen from '../screens/VerMusicoScreen';
import { colors, fontSize } from '../theme';

export type MiLocalStackParamList = {
  Dashboard: undefined;
  CrearEvento: undefined;
  VerMusico: { musicoId: string };
};

const Stack = createNativeStackNavigator<MiLocalStackParamList>();

export default function MiLocalStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontSize: fontSize.lg },
      }}
    >
      <Stack.Screen name="Dashboard" component={DashboardLocalScreen} options={{ title: 'Mi Local' }} />
      <Stack.Screen name="CrearEvento" component={CrearEventoScreen} options={{ title: 'Nuevo Evento' }} />
      <Stack.Screen name="VerMusico" component={VerMusicoScreen} options={{ title: 'Músico' }} />
    </Stack.Navigator>
  );
}
