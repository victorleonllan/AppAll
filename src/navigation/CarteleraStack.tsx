import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CarteleraScreen from '../screens/CarteleraScreen';
import DetalleEventoScreen from '../screens/DetalleEventoScreen';
import ConfirmacionCompraScreen from '../screens/ConfirmacionCompraScreen';
import { colors, fontSize } from '../theme';

export type CarteleraStackParamList = {
  CarteleraList: undefined;
  DetalleEvento: { eventoId: string };
  ConfirmacionCompra: { eventoId: string; ticketId: string; status: 'success' | 'failure' | 'pending' };
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
      />
    </Stack.Navigator>
  );
}
