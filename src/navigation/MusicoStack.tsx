import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PerfilMusicoScreen from '../screens/PerfilMusicoScreen';
import CrearEventoScreen from '../screens/CrearEventoScreen';
import { colors, fontSize } from '../theme';

export type MusicoStackParamList = {
  PerfilMusico: undefined;
  CrearEvento: undefined;
};

const Stack = createNativeStackNavigator<MusicoStackParamList>();

export default function MusicoStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontSize: fontSize.lg },
      }}
    >
      <Stack.Screen
        name="PerfilMusico"
        component={PerfilMusicoScreen}
        options={{ title: 'Mi Perfil' }}
      />
      <Stack.Screen
        name="CrearEvento"
        component={CrearEventoScreen}
        options={{ title: 'Nuevo Evento' }}
      />
    </Stack.Navigator>
  );
}
