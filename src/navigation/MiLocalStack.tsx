import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardLocalScreen from '../screens/DashboardLocalScreen';
import CrearEventoScreen from '../screens/CrearEventoScreen';
import VerMusicoScreen from '../screens/VerMusicoScreen';
import EquipoEventoScreen from '../screens/EquipoEventoScreen';
import EditarEventoScreen from '../screens/EditarEventoScreen';
import EntradasEventoScreen from '../screens/EntradasEventoScreen';
import EscanerQRScreen from '../screens/EscanerQRScreen';
import EditarLocalScreen from '../screens/EditarLocalScreen';
import VentasMusicoScreen from '../screens/VentasMusicoScreen';
import MisEntradasScreen from '../screens/MisEntradasScreen';
import CambiarContrasenaScreen from '../screens/CambiarContrasenaScreen';
import SolicitudesScreen from '../screens/SolicitudesScreen';
import CobrarEventoScreen from '../screens/CobrarEventoScreen';
import ContactosScreen from '../screens/ContactosScreen';
import RedesScreen from '../screens/RedesScreen';
import PublicarRedesScreen from '../screens/PublicarRedesScreen';
import type { TipoTenant } from '../hooks/useTenantCrm';
import { pantallasAdmin, AdminParamList } from './pantallasAdmin';
import { colors, fontSize } from '../theme';

export type MiLocalStackParamList = {
  Dashboard: undefined;
  CrearEvento: undefined;
  VerMusico: { musicoId: string };
  EquipoEvento: { eventoId: string };
  EditarEvento: { eventoId: string };
  EntradasEvento: { eventoId: string };
  Escaner: { eventoId?: string } | undefined;
  EditarLocal: undefined;
  Ventas: undefined;
  MisEntradas: undefined;
  CambiarContrasena: undefined;
  Solicitudes: undefined;
  CobrarEvento: { eventoId: string };
  Contactos: { tipo: TipoTenant };
  Redes: undefined;
  PublicarRedes: { eventoId?: string } | undefined;
} & AdminParamList;

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
      <Stack.Screen name="EntradasEvento" component={EntradasEventoScreen} options={{ title: 'Entradas' }} />
      {/* Spec 041 — el mismo archivo que monta MusicoStack, con el mismo nombre
          de ruta: DetalleEventoScreen navega a 'Escaner' sin saber en qué stack
          está. Un componente por rol sería el mismo código dos veces, con la
          misma autorización delegada a can_edit_event(). */}
      <Stack.Screen name="Escaner" component={EscanerQRScreen} options={{ title: 'Escanear entradas' }} />
      <Stack.Screen name="EditarLocal" component={EditarLocalScreen} options={{ title: 'Editar local' }} />
      {/* Reutiliza VentasMusicoScreen tal cual (spec 031): el componente muestra
          "las ventas que RLS me deja ver", sin lógica propia de rol — así que
          sirve igual para un músico y para un local. Desde el spec 038 la policy
          de tickets mira event_collaborators (no created_by), así que un local
          invitado como admin también ve sus ventas sin haber tocado esta pantalla. */}
      <Stack.Screen name="Ventas" component={VentasMusicoScreen} options={{ title: 'Ventas' }} />
      {/* Spec 114 — registradas de antemano; cada spec de pantalla reemplaza solo su archivo. */}
      <Stack.Screen name="MisEntradas" component={MisEntradasScreen} options={{ title: 'Mis entradas' }} />
      <Stack.Screen name="CambiarContrasena" component={CambiarContrasenaScreen} options={{ title: 'Cambiar contraseña' }} />
      <Stack.Screen name="Solicitudes" component={SolicitudesScreen} options={{ title: 'Solicitudes' }} />
      <Stack.Screen name="CobrarEvento" component={CobrarEventoScreen} options={{ title: 'Cobrar' }} />
      {/* Spec 155 — la misma pantalla en los dos stacks, como Escaner: cambia el tenant, no el código. */}
      <Stack.Screen name="Contactos" component={ContactosScreen} options={{ title: 'Contactos' }} />
      {/* Spec 157 — igual que Contactos: el tenant sale de useTenantRedes, no de la ruta. */}
      <Stack.Screen name="Redes" component={RedesScreen} options={{ title: 'Redes' }} />
      <Stack.Screen name="PublicarRedes" component={PublicarRedesScreen} options={{ title: 'Publicar en redes' }} />
      {/* Spec 158 — el back office: admin es una fila en platform_admins, no un rol. */}
      {pantallasAdmin(Stack)}
    </Stack.Navigator>
  );
}
