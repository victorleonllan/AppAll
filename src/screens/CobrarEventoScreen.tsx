import { useRoute, RouteProp } from '@react-navigation/native';
import PantallaEnCamino from '../components/PantallaEnCamino';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';

// Montada en CarteleraStack, MusicoStack y MiLocalStack con los mismos params.
type CobrarEventoRoute = RouteProp<CarteleraStackParamList, 'CobrarEvento'>;

// Spec 114 — provisoria; el contenido real lo trae su spec de pantalla.
export default function CobrarEventoScreen() {
  const { eventoId } = useRoute<CobrarEventoRoute>().params;
  return <PantallaEnCamino titulo="Cobrar evento" rutaWeb={`/cartelera/${eventoId}`} />;
}
