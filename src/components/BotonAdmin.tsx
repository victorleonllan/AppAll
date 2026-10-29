import { TouchableOpacity, Text, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEsAdmin } from '../hooks/useEsAdmin';
import type { AdminParamList } from '../navigation/pantallasAdmin';

interface Props {
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/**
 * Spec 158 — la entrada al back office en el perfil de los tres roles. Mientras
 * carga, si no es admin o si hubo error, no se dibuja: quien no es admin no se entera
 * de que existe, como el redirect silencioso de `admin/layout.js` en la web. El
 * estilo lo pone cada pantalla para que se vea igual que sus vecinos.
 */
export default function BotonAdmin({ style, textStyle }: Props) {
  const { esAdmin, cargando, error } = useEsAdmin();
  const navigation = useNavigation<NativeStackNavigationProp<AdminParamList>>();

  if (cargando || error || !esAdmin) return null;

  return (
    <TouchableOpacity style={style} onPress={() => navigation.navigate('Admin')}>
      <Text style={textStyle}>🛠️ Administración</Text>
    </TouchableOpacity>
  );
}
