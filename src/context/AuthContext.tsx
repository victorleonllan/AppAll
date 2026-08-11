import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';

type UserRole = 'public' | 'musician' | 'cafe' | null;

interface AuthState {
  session: Session | null;
  user: User | null;
  role: UserRole;
  loading: boolean;
  signUp: (email: string, password: string, role: UserRole, nombre: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInOtp: (email: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setRole((session?.user?.user_metadata?.role as UserRole) ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setRole((session?.user?.user_metadata?.role as UserRole) ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, role: UserRole, nombre: string): Promise<string | null> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, nombre },
      },
    });
    return error ? error.message : null;
  };

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };

  const signInOtp = async (email: string): Promise<string | null> => {
    const redirectTo = typeof window !== 'undefined'
      ? window.location.origin
      : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        data: { role: 'public', nombre: email.split('@')[0] },
        shouldCreateUser: true,
        emailRedirectTo: redirectTo,
      },
    });
    return error ? error.message : null;
  };

  // Google OAuth (spec 042). En web, Supabase redirige la pestaña entera y
  // `detectSessionInUrl` (activo en src/lib/supabase.ts) captura la sesión sola al
  // volver — no hace falta nada más acá. En nativo no hay redirect de navegador:
  // se abre un navegador embebido (WebBrowser.openAuthSessionAsync) que vuelve al
  // deep link `appall://` con los tokens en la URL, y la sesión se arma a mano con
  // `setSession`. Requiere el provider Google habilitado en el dashboard de
  // Supabase Auth (Client ID + Secret) — sin eso, `signInWithOAuth` devuelve error.
  const signInWithGoogle = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      return error ? error.message : null;
    }

    const redirectTo = 'appall://';
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return error.message;
    if (!data?.url) return 'Google no devolvió una URL de autenticación';

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) {
      // 'cancel' / 'dismiss': el usuario cerró el navegador embebido — no es un
      // error que mostrar, simplemente no quedó sesión.
      return null;
    }

    const fragment = result.url.split('#')[1] ?? result.url.split('?')[1] ?? '';
    const params = new URLSearchParams(fragment);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) {
      return params.get('error_description') ?? 'Google no devolvió una sesión válida';
    }

    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    return sessionError ? sessionError.message : null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user, role, loading, signUp, signIn, signInOtp, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
