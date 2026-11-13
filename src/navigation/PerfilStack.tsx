import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PerfilScreen from '../screens/PerfilScreen';
import MisEntradasScreen from '../screens/MisEntradasScreen';
import PanelFanScreen from '../screens/PanelFanScreen';
import CambiarContrasenaScreen from '../screens/CambiarContrasenaScreen';
import ElegirRolScreen from '../screens/ElegirRolScreen';
import { useAuth } from '../context/AuthContext';
import { pantallasAdmin, AdminParamList } from './pantallasAdmin';
import { fontSize } from '../theme';
import { useTema } from '../context/TemaContext';
import BotonTema from '../components/BotonTema';

export type PerfilStackParamList = {
  Perfil: undefined;
  MisEntradas: undefined;
  PanelFan: undefined;
  CambiarContrasena: undefined;
  ElegirRol: undefined;
} & AdminParamList;

const Stack = createNativeStackNavigator<PerfilStackParamList>();

// Spec 114 — la tercera pestaña de toda sesión que no es músico ni local. Antes
// era PerfilScreen suelta, sin stack, y el fan no tenía a dónde navegar.
export default function PerfilStack() {
  const { colores } = useTema();
  const { role } = useAuth();

  return (
    <Stack.Navigator
      // Misma regla que /quien-eres en la web: aparece cuando user_metadata.role falta.
      initialRouteName={role === null ? 'ElegirRol' : 'Perfil'}
      screenOptions={{
        headerStyle: { backgroundColor: colores.block },
        headerTintColor: colores.white,
        headerTitleStyle: { fontSize: fontSize.lg },
        // Spec 174 — botón de tema en toda pantalla con header, con o sin sesión.
        headerRight: () => <BotonTema />,
      }}
    >
      <Stack.Screen name="Perfil" component={PerfilScreen} options={{ title: 'Perfil' }} />
      <Stack.Screen name="MisEntradas" component={MisEntradasScreen} options={{ title: 'Mis entradas' }} />
      <Stack.Screen name="PanelFan" component={PanelFanScreen} options={{ title: 'Mi panel' }} />
      <Stack.Screen name="CambiarContrasena" component={CambiarContrasenaScreen} options={{ title: 'Cambiar contraseña' }} />
      <Stack.Screen name="ElegirRol" component={ElegirRolScreen} options={{ title: '¿Quién eres?' }} />
      {/* Spec 158 — el back office: admin es una fila en platform_admins, no un rol. */}
      {pantallasAdmin(Stack)}
    </Stack.Navigator>
  );
}
