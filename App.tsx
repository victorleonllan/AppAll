import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { VenuesProvider } from './src/context/VenuesContext';
import { EventosProvider } from './src/context/EventosContext';
import AppNavigator from './src/navigation';

export default function App() {
  return (
    <AuthProvider>
      <VenuesProvider>
        <EventosProvider>
          <AppNavigator />
          <StatusBar style="light" />
        </EventosProvider>
      </VenuesProvider>
    </AuthProvider>
  );
}
