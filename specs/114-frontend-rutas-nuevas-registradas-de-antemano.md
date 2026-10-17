# Spec 114 — Las rutas nuevas de la app quedan registradas de antemano

> Estado: propuesto (16-oct-2026)
> Capa: FRONTEND. `src/navigation/index.tsx`, `src/navigation/linking.ts` (nuevo), `src/navigation/PerfilStack.tsx` (nuevo), `src/navigation/CarteleraStack.tsx`, `src/navigation/LocalesStack.tsx`, `src/navigation/MusicoStack.tsx`, `src/navigation/MiLocalStack.tsx`, `src/components/PantallaEnCamino.tsx` (nuevo), `src/screens/MisEntradasScreen.tsx` (nuevo), `src/screens/PanelFanScreen.tsx` (nuevo), `src/screens/DirectorioMusicosScreen.tsx` (nuevo), `src/screens/DetalleLocalScreen.tsx` (nuevo), `src/screens/MapaLocalesScreen.tsx` (nuevo), `src/screens/CambiarContrasenaScreen.tsx` (nuevo), `src/screens/ElegirRolScreen.tsx` (nuevo), `src/screens/SolicitudesScreen.tsx` (nuevo), `src/screens/CobrarEventoScreen.tsx` (nuevo), `src/screens/InvitacionLocalScreen.tsx` (nuevo), `src/screens/ConfirmacionCompraScreen.tsx`, `src/screens/DetalleEventoScreen.tsx`, `src/screens/LocalesScreen.tsx`, `src/screens/PerfilScreen.tsx`, `src/screens/PerfilMusicoScreen.tsx`, `src/screens/DashboardLocalScreen.tsx`.
> Depende de: ninguno.
> Alimenta: spec 118 (`ConfirmacionCompra` con `ref` y el deep link `appall://compra`), spec 122, spec 124, spec 126, spec 127, spec 128, spec 132, spec 140, spec 141 — cada uno reemplaza solo su `src/screens/<Ruta>Screen.tsx`.

> **En una frase:** se registran ahora, con pantallas provisorias, las diez rutas que
> necesitan las fases 1 a 3 del plan de paridad con la web, junto con sus botones de
> entrada y la configuración de deep links, para que cada spec FRONTEND posterior toque
> **un solo archivo propio** y puedan correr en paralelo.

## Contexto

El plan «la app al nivel de la web» (vault, `02-PROJECTS/Sonópolis/Producto/App/Planes/`)
suma diez pantallas. Cada pantalla nueva hoy obliga a tocar tres o cuatro archivos
compartidos: el stack donde se monta (`src/navigation/*Stack.tsx`), su tipo de parámetros
(que vive en ese mismo archivo, p. ej. `CarteleraStack.tsx:11-19`) y la pantalla desde la
que se llega (un botón en `PerfilScreen`, `LocalesScreen`, `DetalleEventoScreen`…). Dos
specs que tocan el mismo archivo no pueden correr a la vez: el orquestador los serializa
por solape de archivos. Con diez pantallas, la cadena entera quedaría en fila.

Este spec paga ese costo una vez. Después, cada spec FRONTEND reemplaza el contenido de su
`<Ruta>Screen.tsx` y nada más.

Tres hechos del código actual que fijan el diseño:

1. **La tercera pestaña cambia por rol** (`src/navigation/index.tsx:19-24`): `musician` →
   `MusicoStack`, `cafe` → `MiLocalStack`, cualquier otro rol (o sin rol) →
   `PerfilScreen` **suelta, sin stack**. Sin stack, el fan no tiene a dónde navegar desde su
   perfil: no hay forma de montarle «Mis entradas».
2. **Las únicas pestañas que existen para todos** (con y sin sesión, cualquier rol) son
   `Cartelera` y `Locales` (`index.tsx:57-66`). Un deep link que llega con la app cerrada
   tiene que caer en una de ellas, porque la tercera pestaña ni siquiera se llama igual
   según quién esté logueado (`Sonópolis`, `Mi Perfil`, `Mi Local`, `Perfil`).
3. **No hay `linking` en el `NavigationContainer`** (`index.tsx:40`). El scheme `appall`
   ya está declarado (`app.json`, `"scheme": "appall"` y el `intentFilters` de Android),
   pero la app no sabe convertir `appall://algo` en una pantalla. Solo el login con Google
   lo usa, y lo consume `WebBrowser.openAuthSessionAsync` sin pasar por la navegación
   (`AuthContext.tsx:105`).

El precedente para montar la misma pantalla en varios stacks ya existe y está explicado en
el código: `Escaner` y `EquipoEvento` están registrados en tres stacks con el mismo nombre
(`CarteleraStack.tsx:63-70`, `MiLocalStack.tsx:41-45`, `MusicoStack.tsx:74-82`), porque una
pantalla navega por nombre sin saber en qué stack vive.

## Diseño

### Decisión 1 — los nombres de ruta y dónde se monta cada una

Los nombres son fijos (los usan los specs de las fases 1-3 tal cual):

| Ruta | Parámetros | Stacks donde se monta | Por qué ahí |
|---|---|---|---|
| `MisEntradas` | `undefined` | `CarteleraStack`, `PerfilStack`, `MusicoStack`, `MiLocalStack` | Cualquier cuenta compra entradas (en la web `/mis-entradas` es de toda sesión, no del fan). En `CarteleraStack` porque la confirmación de compra (que vive ahí) ofrece «Ver mis entradas» (spec 118) |
| `PanelFan` | `undefined` | `PerfilStack` | Es el panel del rol fan (`/fan` en la web); los otros roles ya tienen el suyo |
| `DirectorioMusicos` | `undefined` | `LocalesStack` | Al lado de `VerMusico`, que ya vive ahí (`LocalesStack.tsx:9`) |
| `DetalleLocal` | `{ venueId: string }` | `LocalesStack`, `CarteleraStack` | Se llega desde la tarjeta del local y desde el «Lugar» del detalle de un evento |
| `MapaLocales` | `undefined` | `LocalesStack` | Es otra vista del mismo listado |
| `CambiarContrasena` | `undefined` | `PerfilStack`, `MusicoStack`, `MiLocalStack` | Toda cuenta con contraseña la puede cambiar (`/perfil/contrasena` en la web) |
| `ElegirRol` | `undefined` | `PerfilStack` | Una sesión sin rol cae en la rama por defecto de `getThirdTab`, que pasa a ser `PerfilStack` (Decisión 3) |
| `Solicitudes` | `undefined` | `MusicoStack`, `MiLocalStack` | Las solicitudes de booking son de músico y de local (`/musico/solicitudes`, `/local/solicitudes`) |
| `CobrarEvento` | `{ eventoId: string }` | `CarteleraStack`, `MusicoStack`, `MiLocalStack` | Los mismos tres stacks donde está `EquipoEvento`: cobrar es gestión del evento, como el equipo |
| `InvitacionLocal` | `{ token: string }` | `CarteleraStack` | Es destino de deep link: tiene que existir con o sin sesión y para cualquier rol (hecho 2). Quien recibe la invitación puede no tener cuenta, o tener otro rol |

`ConfirmacionCompra` (ya existe en `CarteleraStack`) cambia su tipo para poder abrirse
desde un deep link, donde solo llega la referencia del pago:

```ts
ConfirmacionCompra: {
  eventoId?: string;
  ticketId?: string;
  ref?: string;                                   // tickets.preference_id (spec 072)
  status?: 'success' | 'failure' | 'pending';
};
```

**Por qué `ref` y no `ticketId` en el deep link:** el `ticket_id` no existe cuando
`create-preference` arma las `back_urls` de Mercado Pago; la única referencia del ticket
que existe antes que el ticket es `ticketRef`, que se guarda en `tickets.preference_id`
(`create-preference/index.ts:133-140`). Es la misma razón por la que la web confirma por
`ref` (`sonopolisWeb/app/(private)/mis-entradas/PollTrasCompra.js`).

### Decisión 2 — `PerfilStack` nuevo para el fan

`src/navigation/PerfilStack.tsx`, mismo patrón y mismas `screenOptions` que
`MusicoStack.tsx` (header `colors.primary`, tinte `colors.white`, `fontSize.lg`):

```ts
export type PerfilStackParamList = {
  Perfil: undefined;
  MisEntradas: undefined;
  PanelFan: undefined;
  CambiarContrasena: undefined;
  ElegirRol: undefined;
};
```

`Perfil` monta el `PerfilScreen` de hoy (título «Perfil»).

### Decisión 3 — la sesión sin rol entra por `ElegirRol`

En `index.tsx`, la rama por defecto de `getThirdTab` devuelve
`{ name: 'Perfil', component: PerfilStack, icon: 'person' }` en vez de `PerfilScreen`, y
esa pestaña pasa a `headerShown: false` (el header lo pone el stack, como en las otras
dos).

Dentro de `PerfilStack`, `initialRouteName` es `'ElegirRol'` cuando `useAuth().role` es
`null` y `'Perfil'` en cualquier otro caso. Es la regla de la web: `/quien-eres` aparece
cuando `user_metadata.role` falta (`sonopolisWeb/app/(auth)/quien-eres/QuienEresForm.js:91`),
y en esta app el rol de navegación sale del mismo lugar (`AuthContext.tsx:34`).

Esta decisión vive aquí y no en el spec 128 porque es configuración de navegación: si la
dejara para el 128, ese spec tendría que tocar `PerfilStack.tsx` y volvería a chocar con
cualquier otro que lo toque.

**No se tocan los literales de rol** (`'cafe'`, `'public'` en `index.tsx:14,21`). Ese
cambio es del spec 048, que toca el mismo archivo; el orquestador los serializa.

### Decisión 4 — deep links: `src/navigation/linking.ts`

```ts
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
      Cartelera: {
        initialRouteName: 'CarteleraList',
        screens: {
          ConfirmacionCompra: 'compra',
          InvitacionLocal: 'invitacion/:token',
        },
      },
    },
  },
};
```

- `appall://compra?status=success&ref=<uuid>` → `ConfirmacionCompra` con
  `{ status, ref }`. React Navigation pasa los query params como params de la ruta.
- `appall://invitacion/<token>` → `InvitacionLocal` con `{ token }`.
- `initialRouteName: 'CarteleraList'`: con la app cerrada, el deep link arma el stack
  desde cero; sin esto quedaría solo la pantalla de destino, sin «atrás».
- `index.tsx` pasa `linking={linking}` al `NavigationContainer`.
- **No se agrega `expo-linking`.** El prefijo literal `appall://` alcanza para el build
  nativo; `Linking.createURL` solo hace falta para Expo Go, que esta app no usa para
  probar deep links.

El Tab navigator de `index.tsx` **no** se tipa con `RootTabParamList`: el nombre dinámico de
la tercera pestaña obligaría a casteos en cada `Tab.Screen`. El tipo existe para el
`linking` y para quien navegue entre pestañas (`navigation.getParent()`).

### Decisión 5 — `ConfirmacionCompra` no se duplica

En `CarteleraStack`, la ruta `ConfirmacionCompra` suma
`getId={({ params }) => params?.ref ?? params?.ticketId}`.

**Por qué:** en Android, cuando el navegador de pago vuelve a `appall://compra?…`, el
evento de URL lo reciben **dos** oyentes: `WebBrowser.openAuthSessionAsync` (que resuelve
la promesa del spec 118) y el `linking` de React Navigation (que navega). Si los dos
empujan `ConfirmacionCompra`, el usuario ve la pantalla dos veces y «atrás» lo lleva a la
copia. Con `getId`, una navegación a una ruta con el mismo id vuelve a la existente en vez
de apilar otra. El spec 118 navega con el mismo `ref`, así que las dos llegadas
coinciden.

Para que el tipo nuevo compile, `ConfirmacionCompraScreen.tsx` cambia lo mínimo:
`const { eventoId, ticketId, status = 'pending' } = route.params ?? {};`. Su lógica de
polling no cambia acá — la reescribe el spec 118.

### Decisión 6 — la pantalla provisoria lleva a la web, no a un callejón

`src/components/PantallaEnCamino.tsx` (export default), props:

```ts
interface Props {
  titulo: string;          // "Mis entradas"
  rutaWeb: string;         // "/mis-entradas" — se abre en https://sonopolis.org + rutaWeb
  accionSecundaria?: { texto: string; onPress: () => void };
}
```

Muestra el título, el texto «Esta sección está llegando a la app. Mientras tanto, la
tienes en sonopolis.org.», un botón «Abrir en sonopolis.org» (`Linking.openURL` de
`react-native`, sin dependencia nueva) y, si viene, el botón secundario. Estilos con
tokens de `src/theme` (`StyleSheet.create`, nada inline — `AGENTS.md`, convención 3).
La URL base `https://sonopolis.org` es una constante del componente, igual que
`OAuthErrorScreen.tsx:11`.

**Por qué no un «Próximamente» a secas:** los botones de entrada (Decisión 7) son visibles
desde que este spec se aplica, y el build web de Expo se despliega aparte. Entre este
spec y el FRONTEND de cada pantalla puede pasar un tiempo real; durante ese tiempo cada
botón resuelve la tarea en la web en vez de terminar en una pantalla muerta.

Cada `src/screens/<Ruta>Screen.tsx` nuevo es una línea de `PantallaEnCamino`:

| Pantalla | `rutaWeb` | Nota |
|---|---|---|
| `MisEntradasScreen` | `/mis-entradas` | |
| `PanelFanScreen` | `/fan` | |
| `DirectorioMusicosScreen` | `/musicos` | |
| `DetalleLocalScreen` | `/locales/${venueId}` | lee `venueId` de `route.params` |
| `MapaLocalesScreen` | `/locales` | |
| `CambiarContrasenaScreen` | `/perfil/contrasena` | |
| `ElegirRolScreen` | `/quien-eres` | `accionSecundaria`: «Ahora no» → `navigation.replace('Perfil')`. Sin esto, una sesión sin rol quedaría encerrada en la provisoria (Decisión 3 la pone como pantalla inicial) |
| `SolicitudesScreen` | `/musico/solicitudes` si `role === 'musician'`, si no `/local/solicitudes` | |
| `CobrarEventoScreen` | `/cartelera/${eventoId}` | |
| `InvitacionLocalScreen` | `/invitacion/${token}` | La página de la web ya hace el reclamo completo (W-232) |

### Decisión 7 — los botones de entrada se agregan acá

Cada uno es solo `navigation.navigate(...)` hacia la ruta registrada; ninguno decide nada
que sea del spec de su pantalla. Van acá para que esos specs no tengan que tocar pantallas
compartidas.

- **`PerfilScreen.tsx`** — encima del botón «Cerrar sesión» (`:37`): «🎟️ Mis entradas» →
  `MisEntradas`, «⭐ Mi panel» → `PanelFan`, «🔑 Cambiar contraseña» →
  `CambiarContrasena`. El bloque decorativo de roles (`:22-33`) no se toca: su texto lo
  cambia el spec 048.
- **`PerfilMusicoScreen.tsx`** — en el return principal, encima de «Cerrar sesión»
  (`:249`): «🎟️ Mis entradas», «📨 Solicitudes», «🔑 Cambiar contraseña». Mismo estilo de
  botón secundario que ya usa la pantalla.
- **`DashboardLocalScreen.tsx`** — en el return principal, encima de «Cerrar sesión»
  (`:236`): los mismos tres. Los returns tempranos (sin local, `:121`) no cambian.
- **`LocalesScreen.tsx`** — la tarjeta del local (`:88`, hoy un `View`) pasa a
  `TouchableOpacity` → `DetalleLocal` con `{ venueId: venue.id }`; junto al título
  «📍 Locales» (`:86`) un botón «🗺️ Ver mapa» → `MapaLocales`; al pie de la sección de
  músicos (`:84`) «Ver todos los músicos →» → `DirectorioMusicos`. La sección de músicos
  por género (que lee `musicosMock`, `:7`) **no** se toca: sacarla es del spec 122.
- **`DetalleEventoScreen.tsx`** — la fila «Lugar» (`:306-309`) pasa a tocable →
  `DetalleLocal` con `{ venueId: evento.venueId }`; en la card de gestión
  (`:342-392`), un botón «💰 Cobrar» → `CobrarEvento` con `{ eventoId: evento.id }`,
  visible si `permisos.rol === 'owner' && !cancelado`. La web además exige que el show ya
  haya terminado (`sonopolisWeb/app/(marketing)/cartelera/[id]/page.js:215`); esa regla
  la aplica la pantalla `CobrarEvento` (spec 140), no el botón, para que el 140 no tenga
  que volver a este archivo.

Las navegaciones nuevas dentro de pantallas tipadas por un stack (p. ej.
`LocalesScreen`, tipada con `LocalesStackParamList`) usan el tipo del stack; las pantallas
que hoy ya navegan con `(navigation as any)` (`PerfilMusicoScreen`) siguen ese patrón.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin errores.
2. `npm run build:web` (`expo export --platform web`) termina sin errores.
3. Las diez rutas existen con el nombre exacto de la tabla de la Decisión 1, en los stacks
   indicados: `grep -n "name=\"MisEntradas\"" src/navigation/*.tsx` devuelve cuatro
   líneas; `CobrarEvento`, tres; `CambiarContrasena`, tres; `DetalleLocal` y
   `Solicitudes`, dos; el resto, una.
4. `src/navigation/linking.ts` exporta `linking` y `RootTabParamList`;
   `index.tsx` lo pasa al `NavigationContainer`.
5. `ConfirmacionCompra` acepta `{ ref, status }` sin `ticketId` y tiene `getId`.
6. Cada pantalla nueva renderiza `PantallaEnCamino` con su `rutaWeb` de la tabla.
7. Una sesión con `user_metadata.role` vacío abre la tercera pestaña en `ElegirRol`, y
   «Ahora no» la lleva a `Perfil`. Una sesión `public`/`fan`, `musician` o `cafe` abre su
   pestaña de siempre.
8. `git diff` no toca los literales de rol `'cafe'`/`'public'` ni la lógica de compra de
   `DetalleEventoScreen` (`handleComprarLogueado`, `handleEnviarLink`).

## Fuera de alcance

- El contenido real de cada pantalla: specs 122, 124, 126, 127, 128, 132, 140, 141.
- El pago nativo y la confirmación por `confirm-payment`: spec 118.
- Renombrar `'cafe'`→`'local'` y `'public'`→`'fan'`: spec 048. **Ojo:** desde la
  migración del 046, `raw_user_meta_data.role` de los locales existentes dice `'local'`,
  así que hoy `getThirdTab` (`index.tsx:21`) los manda a la pestaña de fan. Con este
  spec caen en `PerfilStack` en vez de `PerfilScreen`; el arreglo de fondo sigue siendo
  el 048.
- Deep links de universal links / App Links (`https://sonopolis.org/...` abriendo la
  app). Requieren archivos de asociación en el dominio; el scheme `appall://` alcanza
  para el retorno de pago y la invitación.
- Botones de entrada para pantallas que no tienen un lugar obvio hoy (p. ej.
  `DirectorioMusicos` desde el panel del local): si un spec de pantalla los necesita, los
  declara.

## Verificación manual (candidatas a `V#` en `specs/PENDIENTES.md`)

- **V (114-a):** en Android, con la app cerrada, `adb shell am start -a
  android.intent.action.VIEW -d "appall://invitacion/00000000-0000-0000-0000-000000000000"`
  abre `InvitacionLocal` con la Cartelera debajo (atrás vuelve a la Cartelera).
- **V (114-b):** en iOS, `xcrun simctl openurl booted "appall://compra?status=pending&ref=abc"`
  abre `ConfirmacionCompra`; repetirlo con la pantalla ya abierta no apila una segunda.
- **V (114-c):** el login con Google en nativo (spec 042) sigue funcionando con el
  `linking` activo: el retorno `appall://#access_token=…` no navega a ninguna pantalla
  (no hay ruta para el path vacío) y la sesión se arma igual.
- **V (114-d):** en el build web de Expo, la barra de direcciones no cambia al navegar
  (linking desactivado en web).
