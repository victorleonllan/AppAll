# Spec 122 — Directorio de músicos y perfil público con datos reales

> Estado: aplicado (17-oct-2026) — `npx tsc --noEmit` limpio, `rg musicosMock` vacío en las tres pantallas y `npx expo export --platform web` sin errores (criterios 1, 2 y 8). Criterios 3–7 y V-a pendientes de probar en ejecución.
> Capa: FRONTEND. `src/screens/DirectorioMusicosScreen.tsx` (reemplaza el placeholder del spec 114), `src/screens/VerMusicoScreen.tsx`, `src/screens/LocalesScreen.tsx`.
> Depende de: spec 095, spec 096, spec 114, spec 121
> Alimenta: spec 124 (le agrega el botón de seguir a estas dos pantallas).
> Hermano en la web: W-040 (directorio), W-203 (bandera del país), W-207 (músicos del país del entorno). Archivos: `sonopolisWeb/app/(marketing)/musicos/page.js`, `musicos/DirectorioMusicos.js`, `musicos/[id]/page.js`.

> **En una frase:** la app busca músicos sobre una lista inventada y su perfil público lee
> esa misma lista; este spec da la pantalla «Músicos» del país activo, como `/musicos` de la
> web, y hace que el perfil público lea `profiles`.

## Contexto

- `LocalesScreen.tsx:19-31` arma chips de género desde `musicosMock` y lista músicos
  falsos; tocar uno navega a `VerMusico` con un id como `"m1"` que no existe en la base.
- `VerMusicoScreen.tsx:14` busca el músico en `musicosMock`. Un id real (por ejemplo desde
  `DashboardLocalScreen.tsx:223`, que ya lista perfiles reales) termina en «Músico no
  encontrado».
- La web tiene `/musicos` (`musicos/page.js`): músicos del país activo, búsqueda por nombre,
  tarjeta con foto, tipo de proyecto, bandera y ciudad, y bio de dos líneas
  (`DirectorioMusicos.js`). El perfil público (`musicos/[id]/page.js`) muestra además el
  país con nombre (W-203).
- El spec 121 deja `useMusicos({ pais })` y `usePerfilMusico(id)`; el 096 deja `usePais()` y
  `PAISES`; el 095 deja `banderaPais` y `etiquetaPais` en `src/constants/paises.ts`; el 114
  deja registrada la ruta `DirectorioMusicos` con su placeholder.

## Diseño

### 1. Navegación

No se toca `src/navigation/`. El spec 114 registra `DirectorioMusicos` (`undefined`) en
`LocalesStack`, al lado de `VerMusico` (`{ musicoId: string }`), así que el directorio
navega a `VerMusico` dentro del mismo stack, tipado con `LocalesStackParamList`. Si no
está así, es un defecto del 114: se reporta y no se arregla acá.

### 2. `src/screens/DirectorioMusicosScreen.tsx`

Reemplaza el placeholder entero.

- Datos: `const { pais } = usePais(); const { musicos, loading, error, refrescar } = useMusicos({ pais });`
- Encabezado: «Músicos» y la línea «Quién está tocando en la ciudad. Sigue a los que te
  gusten para no perderles la pista.» (texto de la web).
- Búsqueda: `TextInput` «Buscar por nombre», filtro en memoria
  `m.nombre.toLowerCase().includes(q.toLowerCase())`. Contador debajo:
  `{n} músico` / `{n} músicos`.
- Lista: `FlatList` de tarjetas (`colors.cardBackground`, `borderRadius.md`):
  - imagen `m.foto ?? m.avatar` a lo ancho, proporción 4:3; sin ninguna, un bloque
    `colors.accentLight` con 👤 y «Sin foto»;
  - `nombre` en negrita;
  - contexto: `TIPO_PROYECTO_LABEL[m.tipoProyecto]` (si hay) · `{banderaPais(m.pais)} {m.ciudad}`
    (sin ciudad, solo la bandera). Sin tipo ni ciudad: «Perfil sin completar» en
    `colors.muted`;
  - `bio` con `numberOfLines={2}` si existe;
  - pie: «🎵 Escuchar» si tiene `spotify` o `youtube`, si no «Sin música aún» en
    `colors.muted`. El pie queda como `View` con espacio a la derecha: ahí pone el botón de
    seguir el spec 124.
  - tocar la tarjeta → `navigation.navigate('VerMusico', { musicoId: m.id })`.
- Estados:
  - `loading` sin datos → `ActivityIndicator`;
  - `error` → «No se pudieron cargar los músicos.» y botón «Reintentar» (`refrescar`);
  - `musicos.length === 0` → «Todavía no hay músicos en {PAISES[pais].nombre}.» con la
    línea «Sé el primero del directorio: crea tu perfil y la gente de tu ciudad podrá
    seguirte.»;
  - búsqueda sin coincidencias → «Ningún músico coincide» y botón «Limpiar» que vacía la
    búsqueda.
- `RefreshControl` → `refrescar`.

Sin filtro de género: la web lo apagó a pedido de Victor (24-ago-2026) porque no es lo
principal de esta pantalla.

### 3. `src/screens/VerMusicoScreen.tsx`

- Fuera `import { musicosMock }`. Datos: `const { musico, loading, error } = usePerfilMusico(musicoId);`
- `loading` → `ActivityIndicator`; `error` → «No se pudo cargar el perfil.»; `musico === null`
  → «Músico no encontrado» (cubre también el perfil que la RLS no deja ver, spec 020).
- Arriba de la tarjeta, la imagen `musico.foto ?? musico.avatar` a lo ancho (4:3) si existe.
- Debajo del nombre, junto a tipo · ciudad, el país con `etiquetaPais(musico.pais)` si hay
  `pais` (W-203).
- El resto de la tarjeta (bio, datos de contratación, rider, contacto, enlaces) queda como
  está: ya lee los mismos campos de `PerfilMusico`.
- Junto al nombre se deja la fila preparada (`flexDirection: 'row'`, nombre con `flex: 1`)
  donde el spec 124 pone el botón de seguir.

### 4. `src/screens/LocalesScreen.tsx`

- Fuera `musicosMock`, la constante `generos` (`:19`), `generoSeleccionado`,
  `musicosFiltrados` y toda la sección «Buscar músicos por género» (`:35-84`) con sus
  estilos sin uso (`chip*`, `resultados`, `tarjetaMusico`, `nombreMusico`, `generoMusico`,
  `aviso`, `tituloBuscar`).
- En su lugar, una tarjeta tocable arriba de «📍 Locales»: «🎸 Músicos» con la línea «Descubre
  quién toca en {PAISES[pais].nombre}» → `navigation.navigate('DirectorioMusicos')` (tipada
  con `LocalesStackParamList`, donde el 114 registró la ruta).
- El enlace «Ver todos los músicos →» que el spec 114 deja al pie de la sección vieja se va
  con ella: la tarjeta nueva lo reemplaza. El botón «🗺️ Ver mapa» y la tarjeta de local
  tocable que agrega el 114 **no** se tocan.
- Si el 096 ya cambió de dónde sale `locales` en esta pantalla, se respeta; este spec solo
  toca la sección de músicos.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin errores.
2. `rg -n "musicosMock" src/screens/LocalesScreen.tsx src/screens/VerMusicoScreen.tsx src/screens/DirectorioMusicosScreen.tsx`
   no devuelve nada.
3. Desde Locales, «Músicos» abre el directorio con los mismos músicos (y el mismo número) que
   `/musicos` de la web con el mismo país elegido.
4. Buscar un nombre filtra la lista; una búsqueda sin coincidencias muestra «Ningún músico
   coincide» y «Limpiar» la restablece.
5. Tocar un músico del directorio abre su perfil real, con foto o avatar si tiene, y el país
   con nombre.
6. Abrir `VerMusico` desde «Músicos disponibles» de `DashboardLocalScreen` muestra el perfil
   real (antes daba «Músico no encontrado»).
7. Con la red cortada, el directorio muestra el error y «Reintentar», no músicos inventados.
8. `npx expo export --platform web` termina sin errores.

## Fuera de alcance

- Botón de seguir en el directorio y en el perfil: spec 124.
- Opt-in de WhatsApp en el perfil público (W-053): es del CRM, fuera del plan.
- Contactar o pedir booking al músico desde su perfil: spec 132 (solicitudes).
- Borrar `src/data/mock/musicos.ts`: todavía lo usa `PerfilMusicoScreen`, que reescribe el
  spec 130.
- Filtro por género en el directorio (apagado también en la web).

## Verificación manual (candidatas a `V#`)

- V-a: en un teléfono, un músico con `foto` y `avatar` muestra la foto en el directorio y en
  el perfil; uno con solo `avatar` muestra el avatar.
