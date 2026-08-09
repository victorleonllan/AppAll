import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LocalesScreen from '../screens/LocalesScreen';
import VerMusicoScreen from '../screens/VerMusicoScreen';
import { colors, fontSize } from '../theme';

export type LocalesStackParamList = {
  LocalesList: undefined;
  VerMusico: { musicoId: string };
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
    </Stack.Navigator>
  );
}
