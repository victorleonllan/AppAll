import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { VenuesProvider } from './src/context/VenuesContext';
import { EventosProvider } from './src/context/EventosContext';
import AppNavigator from './src/navigation';
import { Splash } from './src/components/Splash';

export default function App() {
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
