import { useRoute, RouteProp } from '@react-navigation/native';
import PantallaEnCamino from '../components/PantallaEnCamino';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';

type InvitacionLocalRoute = RouteProp<CarteleraStackParamList, 'InvitacionLocal'>;

// Spec 114 — provisoria; la página de la web ya hace el reclamo completo (W-232).
export default function InvitacionLocalScreen() {
  const { token } = useRoute<InvitacionLocalRoute>().params;
  return <PantallaEnCamino titulo="Invitación de local" rutaWeb={`/invitacion/${token}`} />;
}
