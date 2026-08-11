import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PerfilMusicoScreen from '../screens/PerfilMusicoScreen';
import EditarPerfilBandaScreen from '../screens/EditarPerfilBandaScreen';
import CrearEventoScreen from '../screens/CrearEventoScreen';
import VentasMusicoScreen from '../screens/VentasMusicoScreen';
import EquipoEventoScreen from '../screens/EquipoEventoScreen';
import EditarEventoScreen from '../screens/EditarEventoScreen';
import EntradasEventoScreen from '../screens/EntradasEventoScreen';
import EscanerQRScreen from '../screens/EscanerQRScreen';
import { colors, fontSize } from '../theme';

export type MusicoStackParamList = {
  PerfilMusico: undefined;
  EditarPerfilBanda: undefined;
  CrearEvento: undefined;
  VentasMusico: undefined;
  EquipoEvento: { eventoId: string };
  EditarEvento: { eventoId: string };
  EntradasEvento: { eventoId: string };
  // Spec 041 — `eventoId` opcional: desde el dashboard se entra sin evento y la
  // pantalla lo pide; desde las entradas del evento se entra con él ya fijado.
  Escaner: { eventoId?: string } | undefined;
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
      {/* Mismo archivo y mismo nombre de ruta que en MiLocalStack y
          CarteleraStack (spec 041): no hay un escáner de banda y otro de local
          porque quien autoriza es can_edit_event(), que mira el equipo del
          evento y no el rol de la persona. */}
      <Stack.Screen
        name="Escaner"
        component={EscanerQRScreen}
        options={{ title: 'Escanear entradas' }}
      />
    </Stack.Navigator>
  );
}
