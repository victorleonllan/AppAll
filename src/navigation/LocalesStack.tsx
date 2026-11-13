import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LocalesScreen from '../screens/LocalesScreen';
import VerMusicoScreen from '../screens/VerMusicoScreen';
import DirectorioMusicosScreen from '../screens/DirectorioMusicosScreen';
import DetalleLocalScreen from '../screens/DetalleLocalScreen';
import MapaLocalesScreen from '../screens/MapaLocalesScreen';
import { fontSize } from '../theme';
import { useTema } from '../context/TemaContext';
import BotonTema from '../components/BotonTema';

export type LocalesStackParamList = {
  LocalesList: undefined;
  VerMusico: { musicoId: string };
  DirectorioMusicos: undefined;
  DetalleLocal: { venueId: string };
  MapaLocales: undefined;
};

const Stack = createNativeStackNavigator<LocalesStackParamList>();

export default function LocalesStack() {
  const { colores } = useTema();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colores.block },
        headerTintColor: colores.white,
        headerTitleStyle: { fontSize: fontSize.lg },
        // Spec 174 — botón de tema en toda pantalla con header, con o sin sesión.
        headerRight: () => <BotonTema />,
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
