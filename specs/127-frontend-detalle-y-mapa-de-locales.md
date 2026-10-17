# Spec 127 — Ficha del local y mapa de locales con `react-native-maps`

> Estado: propuesto (16-oct-2026)
> Capa: FRONTEND. `src/screens/DetalleLocalScreen.tsx` (reemplaza el placeholder del spec 114), `src/screens/MapaLocalesScreen.tsx` (reemplaza el placeholder del spec 114), `src/components/MapaLocales.tsx` (nuevo), `src/components/MapaLocales.web.tsx` (nuevo), `src/lib/mapa.ts` (nuevo), `src/hooks/useEventosDelLocal.ts` (nuevo), `src/screens/LocalesScreen.tsx`, `app.config.js` (nuevo), `package.json`, `package-lock.json`.
> Depende de: spec 114, spec 115, spec 124
> Alimenta: un spec posterior de pines de locales externos (los de eventos scrapeados) sobre el mismo `MapaLocales`.
> Hermano en la web: W-020, W-027/W-028/W-030 (mapa y ficha), W-137–W-164 (rediseño del mapa); `sonopolisWeb/components/MapaLocales.js`, `components/FichaLocalMapa.js`, `libs/mapa.js`, `app/(marketing)/locales/[id]/page.js`.

> **En una frase:** cada local de la lista abre su ficha (datos, cómo llegar, próximas
> fechas y botón seguir), y un mapa nativo muestra todos los locales con ubicación; en
> Expo web y en Android sin clave de Google Maps, el mapa se reemplaza por la lista.

## Contexto

En la app, `LocalesScreen` lista los locales como tarjetas que no llevan a ningún lado
(`src/screens/LocalesScreen.tsx:87-112`): no hay ficha de local ni mapa. El spec 048
(sección 4) ya lo había detectado («no hay una pantalla de detalle de un local hoy») y dejó
abierta la decisión entre un ícono en la tarjeta o una pantalla propia. El plan de paridad
la resuelve con pantalla propia, como en la web (`/locales/[id]`), y el spec 114 ya
registró las rutas `DetalleLocal` y `MapaLocales`.

En la web, `/locales` **es** el mapa (W-149) y la ficha trae un mini mapa (W-030).

### Datos que ya existen y no se tocan

- `venues.lat`/`venues.lng` son la caché de la dirección activa: el trigger
  `sync_venue_address_activa` las copia desde `venue_addresses`
  (`supabase/migrations/20260901140000_spec_w062_venue_addresses.sql`). El mapa lee
  `venues` y no necesita `venue_addresses`.
- `VenuesContext` ya mapea `lat`, `lng` y todo el perfil del local (`src/context/VenuesContext.tsx:38-39`).
- `events.fecha` es texto libre (`baseline …sql:60`), así que «próximas fechas» se decide
  con `events.comienza_at` (spec 045), no con `fecha`.

### Por qué el spec 115 es requisito

Hoy `VenuesContext` arranca con locales mock (ids `"1"`, `"2"`…) y vuelve a ellos si la
consulta falla. Una ficha de un local mock consulta `events.venue_id = '1'`, que Postgres
rechaza como uuid inválido. El 115 saca ese reemplazo; desde ahí, todo id de local es real.

### Por qué hay un hook de lectura en un spec FRONTEND

`useEventosDelLocal` es una consulta de solo lectura que usa solo esta ficha. Sigue el
precedente del spec 039, que fue FRONTEND de solo lectura y creó `useEntradasEvento`. No
escribe nada ni cambia ningún contexto.

## Diseño

### 1. Dependencia nueva: `react-native-maps`

```bash
npx expo install react-native-maps
```

`expo install` elige la versión compatible con Expo SDK 56 (React Native 0.85, nueva
arquitectura). El cambio queda en `package.json` y `package-lock.json`. No se usa
`npm install` a secas: puede traer una versión que no compila contra este SDK.

- **iOS**: usa Apple Maps (el proveedor por defecto). No necesita clave.
- **Android**: usa Google Maps y **exige una clave de API**. Sin clave, el `MapView`
  nativo falla al montarse (según la versión, pantalla gris o cierre de la app).
- **Expo Go** trae `react-native-maps` y su propia clave, así que en desarrollo funciona
  sin configurar nada.

### 2. La clave de Android, fuera del repo: `app.config.js` (nuevo)

`app.json` no puede leer variables de entorno. Se agrega `app.config.js`, que Expo evalúa
**después** de `app.json` y recibe su contenido como `config`. Así `app.json` no se toca:

```js
// Spec 127 — la clave de Google Maps para Android sale del entorno, nunca del repo.
module.exports = ({ config }) => {
  const claveMapsAndroid = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ...(claveMapsAndroid
        ? [['react-native-maps', { androidGoogleMapsApiKey: claveMapsAndroid }]]
        : []),
    ],
  };
};
```

- La variable lleva el prefijo `EXPO_PUBLIC_` a propósito: Expo la inyecta también en el
  bundle de JS, y así la app sabe en tiempo de ejecución si hay clave (ver
  `mapaDisponible()` abajo) sin agregar `expo-constants`. No es un secreto: la clave de
  Maps para Android termina igual dentro del `AndroidManifest.xml` del APK. Su protección
  es la restricción por paquete y huella SHA-1 en Google Cloud Console.
- Va en `.env` local (ya ignorado por git, como `EXPO_PUBLIC_SUPABASE_URL`) y, cuando
  haya builds en la nube, como variable de entorno del build.
- Verificación: con la variable puesta, `npx expo config --type prebuild` debe mostrar la
  clave en la configuración de Android (`com.google.android.geo.API_KEY`). Si la versión
  instalada de `react-native-maps` no trae plugin de Expo (el comando falla con
  «plugin not found»), se usa el campo nativo de Expo en su lugar:
  `android: { ...config.android, config: { ...config.android?.config, googleMaps: { apiKey: claveMapsAndroid } } }`,
  y se anota en la addenda del spec cuál quedó.

### 3. `src/lib/mapa.ts` (nuevo) — funciones puras

Copia de `sonopolisWeb/libs/mapa.js` adaptada a la región de `react-native-maps`
(centro + deltas en vez de esquinas):

```ts
export interface PuntoMapa { id: string; nombre: string; tipo: VenueType; lat: number; lng: number }

export interface PropsMapaLocales {
  puntos: PuntoMapa[];
  seleccionadoId?: string | null;
  onSeleccionar?: (id: string) => void;
  onVerDetalle?: (id: string) => void;
  interactivo?: boolean;               // false en la ficha: sin arrastre ni zoom
  deltaMinimo?: number;                // zoom máximo del encuadre inicial
  style?: StyleProp<ViewStyle>;
}

export function puntosDeVenues(venues: Venue[]): PuntoMapa[];
export function clusterPrincipal(puntos: PuntoMapa[], radioKm = 25): PuntoMapa[];
export function regionDe(puntos: PuntoMapa[], deltaMinimo = 0.02): Region | null;
export function mapaDisponible(): boolean;
export function urlComoLlegar(venue: Venue): string | null;
export const COLOR_TIPO_LOCAL: Record<VenueType, string>;
```

- `puntosDeVenues`: solo los locales con `lat` **y** `lng` no nulos, convertidos con
  `Number()` (la columna es `numeric`). Un local sin coordenadas no se dibuja: no se
  inventa una posición (W-027).
- `clusterPrincipal`: el grupo más numeroso de puntos dentro de 25 km, copiado tal cual de
  la web con su distancia equirectangular. Existe porque encuadrar **todos** los puntos
  puede abrir el mapa sobre el vacío entre dos ciudades (W-163: Cd. Juárez y Chihuahua
  están a 350 km).
- `regionDe`: centro en el punto medio del rectángulo que contiene los puntos;
  `latitudeDelta = max((maxLat - minLat) * 1.4, deltaMinimo)`, igual para la longitud. El
  1.4 deja margen para que los pines del borde no queden cortados. `null` si no hay puntos.
  `Region` es el tipo de `react-native-maps`; se importa con `import type` para que este
  archivo no arrastre el módulo nativo al bundle web.
- `mapaDisponible()`: `false` en web; `false` en Android si
  `process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` está vacía; `true` en el resto. En
  Expo Go para Android, sin la variable, devuelve `false` aunque Expo Go tenga su clave:
  se acepta, porque el caso que importa es el build propio, donde sin clave la app cae.
- `urlComoLlegar`: `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` si hay
  coordenadas; si no, la misma URL con `query=` de `address` + `comuna` +
  `ciudad` codificados; `null` si no hay ni coordenadas ni dirección. Es una URL universal:
  abre la app de mapas en Android, el navegador en iOS y web.
- `COLOR_TIPO_LOCAL`: `cafe → colors.accent`, `bar → colors.warning`,
  `sala → colors.primary`, `centro_cultural → colors.success`. El color dice el tipo de
  local, igual que en la web (W-138); los valores salen del tema, no se escriben a mano.

### 4. `src/components/MapaLocales.tsx` (nuevo, nativo) y `MapaLocales.web.tsx` (nuevo)

Dos archivos con la misma firma (`PropsMapaLocales`, default export). Metro elige el
`.web.tsx` al compilar para web y el `.tsx` para iOS y Android; mismo patrón que
`src/components/Splash.tsx` / `Splash.web.tsx`.

**Por qué dos archivos y no un `if (Platform.OS === 'web')`:** `react-native-maps` no tiene
implementación web. Basta con importarlo para que el bundle web falle, aunque el
componente nunca se monte. Con el archivo `.web.tsx` el módulo no entra al bundle web.

- **`MapaLocales.web.tsx`**: devuelve `null`. Las pantallas deciden qué mostrar en su
  lugar con `mapaDisponible()`.
- **`MapaLocales.tsx`**:
  - Si `!mapaDisponible()` → `null` (en Android sin clave, montar el `MapView` cierra la
    app).
  - `MapView` con `initialRegion={regionDe(clusterPrincipal(puntos), deltaMinimo)}`,
    `scrollEnabled`, `zoomEnabled`, `rotateEnabled` y `pitchEnabled` iguales a
    `interactivo` (por defecto `true`).
  - Un `Marker` por punto, con `pinColor={COLOR_TIPO_LOCAL[tipo]}`, `onPress` →
    `onSeleccionar?.(id)`. Con `onVerDetalle`, el marcador lleva un `Callout` con el
    nombre y «Ver local ›», y tocar el callout llama `onVerDetalle(id)`.
  - Cuando `seleccionadoId` cambia a un id con punto, el mapa se mueve a él con
    `mapRef.current?.animateToRegion({ latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400)`.

### 5. `src/hooks/useEventosDelLocal.ts` (nuevo, solo lectura)

```ts
export interface EventoDelLocal {
  id: string; artista: string; fecha: string; hora: string;
  comienzaAt: string; status: EventoStatus; imagen: string | null;
}
export function useEventosDelLocal(venueId: string | undefined):
  { cargando: boolean; error: string | null; eventos: EventoDelLocal[]; refrescar: () => Promise<void> };
```

```ts
supabase.from('events')
  .select('id, artist_name, fecha, hora, comienza_at, status, imagen')
  .eq('venue_id', venueId)
  .in('status', ['published', 'cancelled'])
  .gte('comienza_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
  .order('comienza_at', { ascending: true })
  .limit(20)
```

- Las 12 h hacia atrás dejan visible el show de esta noche mientras ocurre (mismo margen
  que el spec 125).
- Los eventos sin `comienza_at` quedan fuera (el filtro `gte` descarta los `NULL`): sin
  fecha confiable no se puede afirmar que sean próximos.
- `draft` se excluye explícito aunque RLS ya lo esconda a quien no es del equipo: un
  dueño que mira su propio local no debe ver sus borradores listados como fechas
  públicas.
- Sin `catch {}` silencioso: error → `error` con texto.

### 6. `src/screens/DetalleLocalScreen.tsx` (reemplaza el placeholder)

Parámetro: `{ venueId: string }` (el que registró el 114; si el 114 usó otro nombre,
manda el del 114). El local sale de `useVenues().allVenues`; no hay consulta nueva para
el local.

- Mientras `useVenues().loading`: `ActivityIndicator`. Si no aparece el local: «No
  encontramos este local.».
- **Cabecera**: `{venueEmoji(type)} {name}` y `venueLabel(type)` (de `src/lib/venues.ts`,
  sin editarlo). A la derecha, `BotonSeguir` del spec 124 para este local, con las props
  que fija el 124 (tipo local + id del venue). Se muestra solo con sesión y si
  `user.id !== venue.ownerId`: seguir tu propio local no tiene sentido (misma regla que la
  web).
- **Dónde**: `📍 address`, y `comuna, ciudad` si existen. Si `mapaDisponible()` y el local
  tiene coordenadas: `MapaLocales` con ese único punto, `interactivo={false}`,
  `deltaMinimo={0.008}` (zoom de calle) y 180 px de alto. Si no tiene coordenadas: «Este
  local todavía no tiene ubicación cargada.». Botón «Cómo llegar» si `urlComoLlegar`
  devuelve algo (`Linking.openURL`).
- **Sobre el local**: `description`; y como filas etiqueta–valor, solo las que existen:
  estilo musical, aforo, horarios. Equipamiento como chips: escenario, sonido, backline.
- **Contacto** (cada uno tocable con `Linking.openURL`, solo si existe): teléfono
  (`tel:`), correo (`mailto:`), Instagram (si no empieza con `http`, se arma
  `https://instagram.com/<usuario sin @>`), sitio web (se antepone `https://` si falta el
  esquema).
- **Próximas fechas**: `useEventosDelLocal(venue.id)`. Cada fila: `fecha · hora`, artista
  y una etiqueta «Cancelado» (`colors.danger`) si corresponde. Tocar una fila abre
  `DetalleEvento` con `{ eventoId }`, con la forma de navegación que permita la estructura
  del 114 (si `DetalleLocal` vive en el stack raíz, es
  `navigate('Cartelera', { screen: 'DetalleEvento', params: { eventoId } })`). Vacío:
  «Este local no tiene fechas próximas publicadas.».
- `rating` **no** se muestra (spec 031: los valores se cargaron a mano, no salen de
  reseñas).
- Sin opt-in de WhatsApp: la ficha de la web lo trae (W-053), pero es del CRM, que queda
  fuera del plan.

### 7. `src/screens/MapaLocalesScreen.tsx` (reemplaza el placeholder)

- Locales: `useVenues().allVenues` (si el spec 096 está aplicado, ya vienen filtrados por
  país desde el contexto; esta pantalla no filtra país).
- **Filtro por tipo**: chips «Todos», «Cafés», «Bares», «Salas», «Centros culturales»,
  con el conteo de **todos** los locales de ese tipo (no del filtro activo: si no, al
  elegir uno los demás dirían 0, W-139). Cada chip lleva un punto del color de
  `COLOR_TIPO_LOCAL`, para que el chip enseñe el código de color del mapa.
- **Mapa** (si `mapaDisponible()` y hay puntos en el filtro): `MapaLocales` en la mitad
  superior de la pantalla (`flex: 3` contra `flex: 2` de la lista), con `onSeleccionar` →
  marca el local seleccionado y `onVerDetalle` → `DetalleLocal`.
- **Avisos en lugar del mapa**:
  - `mapaDisponible()` falso en web: «El mapa se ve en la app para iOS y Android. Aquí
    tienes la lista.».
  - `mapaDisponible()` falso en Android: «El mapa no está disponible en esta versión de
    la app. Aquí tienes la lista.».
  - Disponible pero sin puntos en el filtro: «Ningún local de este filtro tiene ubicación
    cargada todavía.».
- **Lista** (siempre visible): dos grupos, «En el mapa (N)» y «Sin ubicación (N)». Fila:
  emoji, nombre, tipo y comuna, más un «Ver ›» a la derecha. Tocar la fila de un local con
  ubicación, con el mapa visible, lo selecciona en el mapa; en cualquier otro caso, y
  siempre con «Ver ›», abre `DetalleLocal`. Sin la lista, un mapa sin puntos no dejaría
  llegar a ningún local (W-030).

### 8. Entradas desde `LocalesScreen.tsx`

Cambio mínimo, sin tocar la sección de músicos (la cambia otro spec de esta fase):

- Cada tarjeta de local pasa de `View` a `TouchableOpacity` con `onPress` →
  `DetalleLocal` con `{ venueId: venue.id }`.
- Arriba de la lista de locales, un botón «🗺 Ver mapa de locales» → `MapaLocales`.
- La navegación a esas rutas usa el tipo de parámetros que exporta el 114.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio.
2. `npm run build:web` termina sin errores, y en el bundle web no hay referencias a
   `react-native-maps` (`grep -rl "react-native-maps" dist/` sin resultados).
3. `git diff --stat` toca solo los archivos de la línea Capa; `app.json` y
   `src/navigation/` sin cambios.
4. `package.json` tiene `react-native-maps` con la versión que eligió `npx expo install`.
5. Con `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` puesta, `npx expo config --type prebuild`
   muestra la clave en la configuración de Android; sin la variable, no aparece y el
   comando no falla.
6. En iOS (simulador o Expo Go), `MapaLocales` muestra un pin por cada local con
   coordenadas, con el color de su tipo, y abre encuadrando el grupo más numeroso.
7. Tocar el callout de un pin, o «Ver ›» en la lista, abre la ficha de ese local.
8. En Expo web, «Locales» → «Ver mapa de locales» muestra el aviso y la lista, sin error
   en consola.
9. La ficha muestra datos, «Cómo llegar» (abre la app de mapas), y las próximas fechas
   ordenadas por `comienza_at`; tocar una fecha abre su `DetalleEvento`.
10. Con sesión de fan, `BotonSeguir` aparece en la ficha y sigue/deja de seguir; con la
    sesión del dueño del local, no aparece; sin sesión, no aparece.
11. Un local sin coordenadas aparece en «Sin ubicación» y su ficha dice que no tiene
    ubicación cargada.

## Fuera de alcance

- **Pines de locales externos** (los que solo se conocen por eventos scrapeados,
  `external_events`, W-144). Necesitan leer `external_events` y agruparlos por nombre de
  local (`venuesDeEventosExternos` en la web); el spec 119 trae los eventos externos a la
  cartelera, y lo natural es que un spec posterior reuse su lectura para pintarlos en este
  mismo `MapaLocales` como pines huecos. Escribir aquí una segunda lectura de
  `external_events` duplicaría la del 119.
- Las direcciones múltiples del local (`venue_addresses`): el mapa usa la activa, que ya
  está en `venues`. Editarlas es el spec 133/134.
- Abrir la ficha del local desde el nombre del local en `DetalleEventoScreen` (lo editan
  los specs 120 y 048).
- La clave de Google Maps para iOS: no hace falta mientras el proveedor sea Apple Maps.
- Agrupar pines cercanos (clustering visual): con decenas de locales no hace falta.

## Verificación manual (V# candidatas)

- **V-127a** — Build propio de Android **con** la clave: el mapa carga con tiles de Google.
  Build **sin** la clave: la pantalla muestra el aviso y la lista, sin cerrarse.
- **V-127b** — Crear la clave en Google Cloud Console restringida al paquete Android y su
  SHA-1, y anotar dónde quedó guardada (paso de Victor).
