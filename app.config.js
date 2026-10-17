// Spec 127 — la clave de Google Maps para Android sale del entorno, nunca del repo.
module.exports = ({ config }) => {
  const claveMapsAndroid = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ...(claveMapsAndroid
        ? [['react-native-maps', { androidGoogleMapsApiKey: claveMapsAndroid }]]
        : []),
    ],
  };
};
