import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation';

export default function App() {
  return (
    <>
      <AppNavigator />
      <StatusBar style="light" />
    </>
  );
}
