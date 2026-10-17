import { PropsMapaLocales } from '../lib/mapa';

// Spec 127 — react-native-maps no tiene implementación web y basta importarlo
// para romper el bundle: este archivo lo reemplaza en web. Las pantallas deciden
// qué mostrar en su lugar con mapaDisponible().
export default function MapaLocales(_props: PropsMapaLocales) {
  return null;
}
