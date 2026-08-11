import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PerfilMusicoScreen from '../screens/PerfilMusicoScreen';
import EditarPerfilBandaScreen from '../screens/EditarPerfilBandaScreen';
import CrearEventoScreen from '../screens/CrearEventoScreen';
import VentasMusicoScreen from '../screens/VentasMusicoScreen';
import EquipoEventoScreen from '../screens/EquipoEventoScreen';
import EditarEventoScreen from '../screens/EditarEventoScreen';
import EntradasEventoScreen from '../screens/EntradasEventoScreen';
import { colors, fontSize } from '../theme';

export type MusicoStackParamList = {
  PerfilMusico: undefined;
  EditarPerfilBanda: undefined;
  CrearEvento: undefined;
  VentasMusico: undefined;
  EquipoEvento: { eventoId: string };
  EditarEvento: { eventoId: string };
  EntradasEvento: { eventoId: string };
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
        name="EditarPerfilBanda"
        component={EditarPerfilBandaScreen}
        options={{ title: 'Editar perfil' }}
      />
      <Stack.Screen
        name="CrearEvento"
        component={CrearEventoScreen}
        options={{ title: 'Nuevo Evento' }}
      />
      <Stack.Screen
        name="VentasMusico"
        component={VentasMusicoScreen}
        options={{ title: 'Mis Ventas' }}
      />
      <Stack.Screen
        name="EquipoEvento"
        component={EquipoEventoScreen}
        options={{ title: 'Equipo del evento' }}
      />
      <Stack.Screen
        name="EditarEvento"
        component={EditarEventoScreen}
        options={{ title: 'Editar evento' }}
      />
      <Stack.Screen
        name="EntradasEvento"
        component={EntradasEventoScreen}
        options={{ title: 'Entradas' }}
      />
    </Stack.Navigator>
  );
}
