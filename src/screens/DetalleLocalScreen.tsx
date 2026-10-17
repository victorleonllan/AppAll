import { useRoute, RouteProp } from '@react-navigation/native';
import PantallaEnCamino from '../components/PantallaEnCamino';
import { LocalesStackParamList } from '../navigation/LocalesStack';

// Montada en LocalesStack y CarteleraStack con los mismos params; el tipo de
// LocalesStack alcanza para leerlos.
type DetalleLocalRoute = RouteProp<LocalesStackParamList, 'DetalleLocal'>;

// Spec 114 — provisoria; el contenido real lo trae su spec de pantalla.
export default function DetalleLocalScreen() {
  const { venueId } = useRoute<DetalleLocalRoute>().params;
  return <PantallaEnCamino titulo="Local" rutaWeb={`/locales/${venueId}`} />;
}
