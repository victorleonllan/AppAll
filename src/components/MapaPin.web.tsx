import type { PropsMapaPin } from './MapaPin';

// Spec 200 — react-native-maps no tiene implementación web y basta importarlo para
// romper el bundle (spec 127): este archivo lo reemplaza en web. `import type` se
// borra al compilar. UbicacionLocal decide qué mostrar con mapaDisponible().
export default function MapaPin(_props: PropsMapaPin) {
  return null;
}
