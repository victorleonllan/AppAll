import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PerfilScreen from '../screens/PerfilScreen';
import MisEntradasScreen from '../screens/MisEntradasScreen';
import PanelFanScreen from '../screens/PanelFanScreen';
import CambiarContrasenaScreen from '../screens/CambiarContrasenaScreen';
import ElegirRolScreen from '../screens/ElegirRolScreen';
import { useAuth } from '../context/AuthContext';
import { colors, fontSize } from '../theme';

export type PerfilStackParamList = {
  Perfil: undefined;
  MisEntradas: undefined;
  PanelFan: undefined;
  CambiarContrasena: undefined;
  ElegirRol: undefined;
};

const Stack = createNativeStackNavigator<PerfilStackParamList>();

// Spec 114 — la tercera pestaña de toda sesión que no es músico ni local. Antes
// era PerfilScreen suelta, sin stack, y el fan no tenía a dónde navegar.
export default function PerfilStack() {
  const { role } = useAuth();

  return (
    <Stack.Navigator
      // Misma regla que /quien-eres en la web: aparece cuando user_metadata.role falta.
      initialRouteName={role === null ? 'ElegirRol' : 'Perfil'}
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontSize: fontSize.lg },
      }}
    >
      <Stack.Screen name="Perfil" component={PerfilScreen} options={{ title: 'Perfil' }} />
      <Stack.Screen name="MisEntradas" component={MisEntradasScreen} options={{ title: 'Mis entradas' }} />
      <Stack.Screen name="PanelFan" component={PanelFanScreen} options={{ title: 'Mi panel' }} />
      <Stack.Screen name="CambiarContrasena" component={CambiarContrasenaScreen} options={{ title: 'Cambiar contraseña' }} />
      <Stack.Screen name="ElegirRol" component={ElegirRolScreen} options={{ title: '¿Quién eres?' }} />
    </Stack.Navigator>
  );
}
