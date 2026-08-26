import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { VenuesProvider } from './src/context/VenuesContext';
import { EventosProvider } from './src/context/EventosContext';
import AppNavigator from './src/navigation';
import { Splash } from './src/components/Splash';
import { getOAuthErrorFromUrl } from './src/lib/oauthError';
import OAuthErrorScreen from './src/screens/OAuthErrorScreen';

export default function App() {
  // Solo en web: si Supabase volvió del login de Google con ?error=... (state
  // expirado o cancelado — ver AuthContext.signInWithGoogle), no montamos la
  // app normal. Cortamos acá antes para no dejar el error flotando sobre el
  // login de siempre.
  const oauthError = getOAuthErrorFromUrl();
  if (oauthError) {
    return <OAuthErrorScreen errorDescription={oauthError} />;
  }

  return (
    <AuthProvider>
      <VenuesProvider>
        <EventosProvider>
          <AppNavigator />
          <StatusBar style="light" />
        </EventosProvider>
      </VenuesProvider>
      {/* position: fixed por encima de todo — no bloquea el montaje del resto
          del árbol, solo lo tapa unos segundos mientras carga (solo web). */}
      <Splash />
    </AuthProvider>
  );
}
