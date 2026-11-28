// Spec 158 — las pantallas del admin de Sonópolis, registradas en PerfilStack,
// MiLocalStack y MusicoStack. Ser admin no es un rol (es una fila en
// `platform_admins`), así que el back office tiene que poder abrirse desde la
// tercera pestaña de cualquier rol. El spec 159 suma sus pantallas acá, sin tocar
// los tres stacks.

import AdminScreen from '../screens/AdminScreen';
import AdminPagosScreen from '../screens/AdminPagosScreen';
import AdminEventosScreen from '../screens/AdminEventosScreen';
import AdminCrmScreen from '../screens/AdminCrmScreen';
import AdminTenantScreen from '../screens/AdminTenantScreen';
import AdminLocalesScreen from '../screens/AdminLocalesScreen';
import AdminVisitasScreen from '../screens/AdminVisitasScreen';
import AdminMusicosScreen from '../screens/AdminMusicosScreen';
import AdminFichaBandaScreen from '../screens/AdminFichaBandaScreen';
import EditarPerfilBandaScreen from '../screens/EditarPerfilBandaScreen';
import EditarLocalScreen from '../screens/EditarLocalScreen';
import EditarEventoScreen from '../screens/EditarEventoScreen';
import type { TipoTenant } from '../lib/adminPro';

export type AdminParamList = {
  Admin: undefined;
  AdminPagos: undefined;
  AdminEventos: undefined;
  // Spec 159 — `nombre` viaja solo para el título: la pantalla lo vuelve a leer de la base.
  AdminCrm: undefined;
  AdminTenant: { tipo: TipoTenant; id: string; nombre: string };
  AdminLocales: undefined;
  // Spec 172 — visitantes de la web por cartelera de país.
  AdminVisitas: undefined;
  // Spec 206 — las tres últimas son los formularios del dueño con nombre de ruta propio:
  // `MusicoStack` y `MiLocalStack` ya tienen los suyos y `PerfilStack` no tiene ninguno.
  AdminMusicos: undefined;
  AdminFichaBanda: { fichaId: string; nombre: string };
  AdminEditarPerfilBanda: { cuentaId: string; nombre: string };
  AdminEditarLocal: { localId: string; nombre: string };
  AdminEditarEvento: { eventoId: string };
};

/**
 * Una función que devuelve elementos y no un componente: los navegadores de React
 * Navigation solo aceptan `Screen`/`Group` como hijos directos, y un componente
 * propio en medio rompe el registro. El grupo hereda el `screenOptions` del stack
 * que lo incluye.
 *
 * `Stack` va tipado laxo a propósito: cada stack tiene su propio ParamList y el de
 * uno no le sirve a los otros. Los nombres de ruta se chequean en cada pantalla con
 * `AdminParamList`, no acá.
 */
export function pantallasAdmin(Stack: { Group: any; Screen: any }) {
  return (
    <Stack.Group>
      <Stack.Screen name="Admin" component={AdminScreen} options={{ title: 'Administración' }} />
      <Stack.Screen name="AdminPagos" component={AdminPagosScreen} options={{ title: 'Pagos' }} />
      <Stack.Screen name="AdminEventos" component={AdminEventosScreen} options={{ title: 'Eventos' }} />
      <Stack.Screen name="AdminCrm" component={AdminCrmScreen} options={{ title: 'CRM' }} />
      <Stack.Screen name="AdminVisitas" component={AdminVisitasScreen} options={{ title: 'Visitas' }} />
      <Stack.Screen
        name="AdminTenant"
        component={AdminTenantScreen}
        options={({ route }: { route: { params: AdminParamList['AdminTenant'] } }) => ({ title: route.params.nombre })}
      />
      <Stack.Screen name="AdminLocales" component={AdminLocalesScreen} options={{ title: 'Locales' }} />
      <Stack.Screen name="AdminMusicos" component={AdminMusicosScreen} options={{ title: 'Músicos' }} />
      <Stack.Screen
        name="AdminFichaBanda"
        component={AdminFichaBandaScreen}
        options={({ route }: { route: { params: AdminParamList['AdminFichaBanda'] } }) => ({ title: route.params.nombre })}
      />
      <Stack.Screen name="AdminEditarPerfilBanda" component={EditarPerfilBandaScreen} options={{ title: 'Editar perfil' }} />
      <Stack.Screen name="AdminEditarLocal" component={EditarLocalScreen} options={{ title: 'Editar local' }} />
      <Stack.Screen name="AdminEditarEvento" component={EditarEventoScreen} options={{ title: 'Editar evento' }} />
    </Stack.Group>
  );
}
