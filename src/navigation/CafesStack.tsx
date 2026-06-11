import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CafesScreen from '../screens/CafesScreen';
import VerMusicoScreen from '../screens/VerMusicoScreen';
import { colors, fontSize } from '../theme';

export type CafesStackParamList = {
  CafesList: undefined;
  VerMusico: { musicoId: string };
};

const Stack = createNativeStackNavigator<CafesStackParamList>();

export default function CafesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontSize: fontSize.lg },
      }}
    >
      <Stack.Screen name="CafesList" component={CafesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="VerMusico" component={VerMusicoScreen} options={{ title: 'Músico' }} />
    </Stack.Navigator>
  );
}
