import { useState } from 'react';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';

export default function AuthScreen() {
  const [showLogin, setShowLogin] = useState(true);

  return showLogin ? (
    <LoginScreen onSwitchToRegister={() => setShowLogin(false)} />
  ) : (
    <RegisterScreen onSwitchToLogin={() => setShowLogin(true)} />
  );
}
