import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PerfilMusicoScreen from '../screens/PerfilMusicoScreen';
import EditarPerfilBandaScreen from '../screens/EditarPerfilBandaScreen';
import CrearEventoScreen from '../screens/CrearEventoScreen';
import VentasMusicoScreen from '../screens/VentasMusicoScreen';
import EquipoEventoScreen from '../screens/EquipoEventoScreen';
import EditarEventoScreen from '../screens/EditarEventoScreen';
import EntradasEventoScreen from '../screens/EntradasEventoScreen';
import EscanerQRScreen from '../screens/EscanerQRScreen';
import MisEntradasScreen from '../screens/MisEntradasScreen';
import CambiarContrasenaScreen from '../screens/CambiarContrasenaScreen';
import SolicitudesScreen from '../screens/SolicitudesScreen';
import CobrarEventoScreen from '../screens/CobrarEventoScreen';
import ContactosScreen from '../screens/ContactosScreen';
import type { TipoTenant } from '../hooks/useTenantCrm';
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
  MisEntradas: undefined;
  CambiarContrasena: undefined;
  Solicitudes: undefined;
  CobrarEvento: { eventoId: string };
  Contactos: { tipo: TipoTenant };
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
      {/* Spec 114 — registradas de antemano; cada spec de pantalla reemplaza solo su archivo. */}
      <Stack.Screen name="MisEntradas" component={MisEntradasScreen} options={{ title: 'Mis entradas' }} />
      <Stack.Screen name="CambiarContrasena" component={CambiarContrasenaScreen} options={{ title: 'Cambiar contraseña' }} />
      <Stack.Screen name="Solicitudes" component={SolicitudesScreen} options={{ title: 'Solicitudes' }} />
      <Stack.Screen name="CobrarEvento" component={CobrarEventoScreen} options={{ title: 'Cobrar' }} />
      {/* Spec 155 — la misma pantalla en los dos stacks, como Escaner: cambia el tenant, no el código. */}
      <Stack.Screen name="Contactos" component={ContactosScreen} options={{ title: 'Contactos' }} />
    </Stack.Navigator>
  );
}
