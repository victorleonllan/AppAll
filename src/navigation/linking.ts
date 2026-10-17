import { Platform } from 'react-native';
import { LinkingOptions, NavigatorScreenParams } from '@react-navigation/native';
import { CarteleraStackParamList } from './CarteleraStack';
import { LocalesStackParamList } from './LocalesStack';
import { MusicoStackParamList } from './MusicoStack';
import { MiLocalStackParamList } from './MiLocalStack';
import { PerfilStackParamList } from './PerfilStack';

// Spec 114 — el Tab navigator de index.tsx no se tipa con esto (el nombre de la
// tercera pestaña cambia por rol y obligaría a castear cada Tab.Screen). Existe
// para el linking y para quien navegue entre pestañas con navigation.getParent().
export type RootTabParamList = {
  Cartelera: NavigatorScreenParams<CarteleraStackParamList>;
  Locales: NavigatorScreenParams<LocalesStackParamList>;
  'Sonópolis': undefined;
  'Mi Perfil': NavigatorScreenParams<MusicoStackParamList>;
  'Mi Local': NavigatorScreenParams<MiLocalStackParamList>;
  Perfil: NavigatorScreenParams<PerfilStackParamList>;
};

export const linking: LinkingOptions<RootTabParamList> = {
  prefixes: ['appall://'],
  // En el build web de Expo la URL del navegador es la de Vercel, no un deep link:
  // activar linking ahí reescribiría la barra de direcciones en cada navegación y
  // competiría con `detectSessionInUrl` de Supabase (src/lib/supabase.ts) al volver
  // del login. Los deep links son solo de la app nativa.
  enabled: Platform.OS !== 'web',
  config: {
    screens: {
      // Cartelera porque existe con y sin sesión y para cualquier rol: la tercera
      // pestaña ni siquiera se llama igual según quién esté logueado.
      Cartelera: {
        // Con la app cerrada el deep link arma el stack desde cero; sin esto
        // quedaría solo la pantalla de destino, sin «atrás».
        initialRouteName: 'CarteleraList',
        screens: {
          // appall://compra?status=success&ref=<uuid> → params { status, ref }
          ConfirmacionCompra: 'compra',
          InvitacionLocal: 'invitacion/:token',
        },
      },
    },
  },
};
