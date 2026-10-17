import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CarteleraScreen from '../screens/CarteleraScreen';
import DetalleEventoScreen from '../screens/DetalleEventoScreen';
import ConfirmacionCompraScreen from '../screens/ConfirmacionCompraScreen';
import EquipoEventoScreen from '../screens/EquipoEventoScreen';
import EditarEventoScreen from '../screens/EditarEventoScreen';
import EntradasEventoScreen from '../screens/EntradasEventoScreen';
import EscanerQRScreen from '../screens/EscanerQRScreen';
import MisEntradasScreen from '../screens/MisEntradasScreen';
import DetalleLocalScreen from '../screens/DetalleLocalScreen';
import CobrarEventoScreen from '../screens/CobrarEventoScreen';
import InvitacionLocalScreen from '../screens/InvitacionLocalScreen';
import { colors, fontSize } from '../theme';

export type CarteleraStackParamList = {
  CarteleraList: undefined;
  DetalleEvento: { eventoId: string };
  // Spec 114 — todo opcional: desde el deep link `appall://compra` solo llegan
  // `status` y `ref` (tickets.preference_id, spec 072); el ticket aún no existe
  // cuando create-preference arma las back_urls.
  ConfirmacionCompra: {
    eventoId?: string;
    ticketId?: string;
    ref?: string;
    status?: 'success' | 'failure' | 'pending';
  };
  EquipoEvento: { eventoId: string };
  EditarEvento: { eventoId: string };
  EntradasEvento: { eventoId: string };
  Escaner: { eventoId?: string } | undefined;
  MisEntradas: undefined;
  DetalleLocal: { venueId: string };
  CobrarEvento: { eventoId: string };
  InvitacionLocal: { token: string };
};

const Stack = createNativeStackNavigator<CarteleraStackParamList>();

export default function CarteleraStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontSize: fontSize.lg },
      }}
    >
      <Stack.Screen
        name="CarteleraList"
        component={CarteleraScreen}
        options={{ title: 'Cartelera' }}
      />
      <Stack.Screen
        name="DetalleEvento"
        component={DetalleEventoScreen}
        options={{ title: 'Evento' }}
      />
      <Stack.Screen
        name="ConfirmacionCompra"
        component={ConfirmacionCompraScreen}
        options={{ headerShown: false }}
        // Spec 114 — en Android el retorno del pago lo reciben el linking y
        // openAuthSessionAsync; si los dos empujan la pantalla, con el mismo id
        // la segunda navegación vuelve a la existente en vez de apilar otra.
        getId={({ params }) => params?.ref ?? params?.ticketId}
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
      {/* Registrada también acá porque DetalleEventoScreen vive en este stack:
          sin esto, el botón de escanear desde el detalle del evento no resuelve
          la ruta. Mismo motivo por el que el 033 registró EquipoEvento tres veces. */}
      <Stack.Screen
        name="Escaner"
        component={EscanerQRScreen}
        options={{ title: 'Escanear entradas' }}
      />
      {/* Spec 114 — registradas de antemano: MisEntradas por la confirmación de
          compra, DetalleLocal por el «Lugar» del evento, CobrarEvento donde ya
          está EquipoEvento, e InvitacionLocal porque es destino de deep link y
          esta pestaña existe con o sin sesión y para cualquier rol. */}
      <Stack.Screen name="MisEntradas" component={MisEntradasScreen} options={{ title: 'Mis entradas' }} />
      <Stack.Screen name="DetalleLocal" component={DetalleLocalScreen} options={{ title: 'Local' }} />
      <Stack.Screen name="CobrarEvento" component={CobrarEventoScreen} options={{ title: 'Cobrar' }} />
      <Stack.Screen name="InvitacionLocal" component={InvitacionLocalScreen} options={{ title: 'Invitación' }} />
    </Stack.Navigator>
  );
}
