import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { createClient, Session, User } from '@supabase/supabase-js';
import { URL_WEB } from '../constants/web';

export type UserRole = 'fan' | 'musician' | 'local' | null;

// Spec 142 — la base usa fan/musician/local desde el spec 046, pero hay cuentas
// con metadata vieja ('cafe'/'public', escrita por esta misma app): se aceptan
// como alias.
export function normalizarRol(valor: unknown): UserRole {
  if (valor === 'local' || valor === 'cafe') return 'local';
  if (valor === 'fan' || valor === 'public') return 'fan';
  if (valor === 'musician') return 'musician';
  return null;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  role: UserRole;
  loading: boolean;
  signUp: (email: string, password: string, role: UserRole, nombre: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInOtp: (email: string) => Promise<string | null>;
  pedirEnlaceRecuperacion: (email: string) => Promise<string | null>;
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
      setRole(normalizarRol(session?.user?.user_metadata?.role));
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setRole(normalizarRol(session?.user?.user_metadata?.role));
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
        data: { role: 'fan', nombre: email.split('@')[0] },
        shouldCreateUser: true,
        emailRedirectTo: redirectTo,
      },
    });
    return error ? error.message : null;
  };

  // Spec 145 — enlace para elegir una contraseña nueva en la web (W-228). Cliente
  // aparte con flujo implícito: los tokens vuelven en el fragmento de la URL, así el
  // enlace abre en cualquier navegador del teléfono, y no toca la sesión ni el storage
  // del cliente de la app. Mismo patrón que libs/enlaceCorreo.js de la web.
  const pedirEnlaceRecuperacion = async (email: string): Promise<string | null> => {
    const cliente = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL || '',
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        auth: {
          flowType: 'implicit',
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    const { error } = await cliente.auth.signInWithOtp({
      email,
      options: {
        // W-205: se crea la cuenta si no existe, para no revelar qué correos tienen cuenta.
        shouldCreateUser: true,
        data: { nombre: email.split('@')[0], pais: 'CL' },
        emailRedirectTo: `${URL_WEB}/auth/enlace?next=${encodeURIComponent('/perfil/contrasena')}`,
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
      value={{ session, user, role, loading, signUp, signIn, signInOtp, pedirEnlaceRecuperacion, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
