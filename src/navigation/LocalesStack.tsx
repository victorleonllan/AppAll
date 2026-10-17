import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LocalesScreen from '../screens/LocalesScreen';
import VerMusicoScreen from '../screens/VerMusicoScreen';
import DirectorioMusicosScreen from '../screens/DirectorioMusicosScreen';
import DetalleLocalScreen from '../screens/DetalleLocalScreen';
import MapaLocalesScreen from '../screens/MapaLocalesScreen';
import { colors, fontSize } from '../theme';

export type LocalesStackParamList = {
  LocalesList: undefined;
  VerMusico: { musicoId: string };
  DirectorioMusicos: undefined;
  DetalleLocal: { venueId: string };
  MapaLocales: undefined;
};

const Stack = createNativeStackNavigator<LocalesStackParamList>();

export default function LocalesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontSize: fontSize.lg },
      }}
    >
      <Stack.Screen name="LocalesList" component={LocalesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="VerMusico" component={VerMusicoScreen} options={{ title: 'Músico' }} />
      {/* Spec 114 — registradas de antemano; cada spec de pantalla reemplaza solo su archivo. */}
      <Stack.Screen name="DirectorioMusicos" component={DirectorioMusicosScreen} options={{ title: 'Músicos' }} />
      <Stack.Screen name="DetalleLocal" component={DetalleLocalScreen} options={{ title: 'Local' }} />
      <Stack.Screen name="MapaLocales" component={MapaLocalesScreen} options={{ title: 'Mapa de locales' }} />
    </Stack.Navigator>
  );
}
