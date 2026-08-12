// Fallback nativo (iOS/Android) de Splash.web.tsx. La versión web usa
// <div>/<img> del DOM, que no son primitivas válidas de React Native — en
// nativo no hay splash propio todavía, así que este archivo no renderiza
// nada y deja el splash nativo por defecto de Expo.
export function Splash() {
  return null;
}
