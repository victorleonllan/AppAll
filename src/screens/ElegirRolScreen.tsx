import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import PantallaEnCamino from '../components/PantallaEnCamino';
import { PerfilStackParamList } from '../navigation/PerfilStack';

type NavProp = NativeStackNavigationProp<PerfilStackParamList, 'ElegirRol'>;

// Spec 114 — provisoria. Es la pantalla inicial de una sesión sin rol, así que
// necesita una salida dentro de la app: sin «Ahora no» quedaría encerrada acá.
export default function ElegirRolScreen() {
  const navigation = useNavigation<NavProp>();
  return (
    <PantallaEnCamino
      titulo="¿Quién eres?"
      rutaWeb="/quien-eres"
      accionSecundaria={{ texto: 'Ahora no', onPress: () => navigation.replace('Perfil') }}
    />
  );
}
