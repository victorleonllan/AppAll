import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardLocalScreen from '../screens/DashboardLocalScreen';
import CrearEventoScreen from '../screens/CrearEventoScreen';
import VerMusicoScreen from '../screens/VerMusicoScreen';
import EquipoEventoScreen from '../screens/EquipoEventoScreen';
import EditarEventoScreen from '../screens/EditarEventoScreen';
import EditarLocalScreen from '../screens/EditarLocalScreen';
import VentasMusicoScreen from '../screens/VentasMusicoScreen';
import { colors, fontSize } from '../theme';

export type MiLocalStackParamList = {
  Dashboard: undefined;
  CrearEvento: undefined;
  VerMusico: { musicoId: string };
  EquipoEvento: { eventoId: string };
  EditarEvento: { eventoId: string };
  EditarLocal: undefined;
  Ventas: undefined;
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
      <Stack.Screen name="EquipoEvento" component={EquipoEventoScreen} options={{ title: 'Equipo del evento' }} />
      <Stack.Screen name="EditarEvento" component={EditarEventoScreen} options={{ title: 'Editar evento' }} />
      <Stack.Screen name="EditarLocal" component={EditarLocalScreen} options={{ title: 'Editar local' }} />
      {/*
        Reutiliza VentasMusicoScreen tal cual (spec 031): la policy
        tickets_select_event_owner filtra por events.created_by, así que
        el componente ya muestra exactamente "las ventas de mis eventos"
        sin importar si "mis" es un músico o un local. Ampliar la policy a
        "dueño del venue" queda fuera de alcance — ver spec.

        ⚠️ El spec 033 degradó created_by a hecho histórico: ahora quien
        autoriza es event_collaborators. La policy de tickets siguió usando
        created_by, así que un colaborador con role='owner' que no creó el
        evento no ve sus ventas. Es un hueco real, no un descuido de este
        spec — corregirlo es cambiar la policy, y eso pide su propio número.
      */}
      <Stack.Screen name="Ventas" component={VentasMusicoScreen} options={{ title: 'Ventas' }} />
    </Stack.Navigator>
  );
}
