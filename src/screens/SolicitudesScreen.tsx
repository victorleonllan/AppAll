import { useAuth } from '../context/AuthContext';
import PantallaEnCamino from '../components/PantallaEnCamino';

// Spec 114 — provisoria; el contenido real lo trae su spec de pantalla.
// Montada en MusicoStack y MiLocalStack: la web separa las solicitudes por rol.
export default function SolicitudesScreen() {
  const { role } = useAuth();
  const rutaWeb = role === 'musician' ? '/musico/solicitudes' : '/local/solicitudes';
  return <PantallaEnCamino titulo="Solicitudes" rutaWeb={rutaWeb} />;
}
