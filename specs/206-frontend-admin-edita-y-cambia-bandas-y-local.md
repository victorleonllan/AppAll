# Spec 206 — El admin edita músicos, fichas, locales y eventos con los formularios del dueño, y cambia bandas y local del evento

> Estado: aplicado (28-nov-2026) — `tsc` limpio fuera de `supabase/functions`, `expo export --platform web` sin errores y criterios 3 a 8 revisados con `grep`/`git`. Sin probar en navegador, dispositivo ni contra la base (V 206-a a 206-e).
> Capa: FRONTEND. `src/navigation/pantallasAdmin.tsx`, `src/screens/AdminScreen.tsx`, `src/screens/AdminMusicosScreen.tsx` (nuevo), `src/screens/AdminFichaBandaScreen.tsx` (nuevo), `src/components/SelectorBandaAdmin.tsx` (nuevo), `src/components/AvisoEdicionAdmin.tsx` (nuevo), `src/components/BandasYLocalAdmin.tsx` (nuevo), `src/screens/AdminTenantScreen.tsx`, `src/screens/AdminLocalesScreen.tsx`, `src/screens/AdminEventosScreen.tsx`, `src/screens/EditarPerfilBandaScreen.tsx`, `src/screens/EditarLocalScreen.tsx`, `src/screens/EditarEventoScreen.tsx`, `src/screens/DetalleEventoScreen.tsx`.
> Depende de: spec 197 (`src/lib/bandas.ts`, `src/lib/edicionAdmin.ts`, `src/lib/adminEdicion.ts`, `useEventoPermisos` con `esAdmin`/`comoAdmin`), spec 173 (`useEstilos`, `useTema`), spec 152 (`useEsAdmin`). **Va al final de la cadena**: comparte `DetalleEventoScreen.tsx` con el 198, `EditarEventoScreen.tsx` con el 199, `EditarLocalScreen.tsx` con el 200 y el 201, y `EditarPerfilBandaScreen.tsx` con el 201; se aplica después de los cuatro y ubica cada cambio por contenido, no por número de línea.
> Hermano en la web: `app/(private)/admin/crm/ventanas/` (W-343, W-349), `components/AvisoEdicionAdmin.js`, `musico/perfil/editar/page.js`, `local/editar/page.js`, `eventos/[id]/editar/page.js` (W-352), `components/BandasYLocalAdmin.js` (W-355).

> **En una frase:** el back office de la app suma la ventana «Músicos» (cuentas y fichas
> sueltas, sugerencias, conectar y unir), y desde el CRM, «Locales» y «Eventos» el admin
> abre el mismo formulario que usa el músico, el local o el equipo del evento —con un aviso
> de que edita como admin—, y en la edición del evento cambia la banda principal, las
> bandas adicionales y el local.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0
después de esta orquestación.»

En la web (24 y 25-nov-2026): «necesito que en admin pueda editar los músicos, locales y
eventos… ventanas de cada cosa en mi CRM» (W-343); «editar exactamente lo que ellos pueden
editar, no es necesario tener una herramienta distinta» (W-352); «falta poder agregar banda
y local en la edición de admin del evento» (W-355). En la app el admin no puede editar
nada ajeno, y `AdminEventosScreen` dejó «Editar» fuera (spec 158) porque los permisos no lo
reconocían; el spec 197 lo resuelve.

## Decisión

Principio de W-352, sin excepción: **el admin usa la pantalla y el formulario del dueño**,
no una copia. Lo único propio del admin son la ventana «Músicos», la pantalla de una ficha
suelta (una ficha no tiene dueño ni formulario) y el bloque «Bandas y local». Para tocar lo
menos posible las tres pantallas que comparten 199, 200 y 201, todo lo nuevo vive en
componentes nuevos y cada pantalla del dueño suma solo: leer un parámetro, decidir con
`decidirEdicion`, usar el id editado en vez de `user.id`, y montar el aviso.

Colores: solo la paleta con `useEstilos`/`useTema`, ningún hex. Errores en un `Text` y
confirmaciones con `confirmar` (`src/lib/confirm.ts`): `Alert.alert` no hace nada en el
build web. Como la app no tiene toasts, el resultado de cada acción va en una línea de aviso
dentro de la pantalla o del bloque: éxito en `c.success`, error en `c.danger` con el mensaje
de la base tal cual (mismo patrón `Aviso` de `AdminLocalesScreen`).

### 1. Navegación — `src/navigation/pantallasAdmin.tsx`

`AdminParamList` suma:

```ts
AdminMusicos: undefined;
AdminFichaBanda: { fichaId: string; nombre: string };
AdminEditarPerfilBanda: { cuentaId: string; nombre: string };
AdminEditarLocal: { localId: string; nombre: string };
AdminEditarEvento: { eventoId: string };
```

y el grupo registra:

| Ruta | Componente | Título |
|---|---|---|
| `AdminMusicos` | `AdminMusicosScreen` | «Músicos» |
| `AdminFichaBanda` | `AdminFichaBandaScreen` | `route.params.nombre` |
| `AdminEditarPerfilBanda` | `EditarPerfilBandaScreen` (el del músico) | «Editar perfil» |
| `AdminEditarLocal` | `EditarLocalScreen` (el del local) | «Editar local» |
| `AdminEditarEvento` | `EditarEventoScreen` (el del equipo) | «Editar evento» |

Nombres de ruta propios (no `EditarPerfilBanda`/`EditarLocal`/`EditarEvento`) porque el
grupo se monta en `MusicoStack` y `MiLocalStack`, que ya tienen esos nombres, y en
`PerfilStack`, que no los tiene: así el admin los abre desde la tercera pestaña de
cualquier rol sin tocar los tres stacks (mismo motivo que el spec 158).

### 2. Inicio del admin — `src/screens/AdminScreen.tsx`

`DESTINOS` suma, después de «CRM»:
`{ ruta: 'AdminMusicos', titulo: 'Músicos', bajada: 'Cuentas de músico y fichas de banda sueltas: edítalas, conéctalas con su cuenta o únelas.' }`
(el tipo de `ruta` suma `'AdminMusicos'`). Las ventanas «Locales» y «Eventos» de la web ya
existen en la app como `AdminLocales` y `AdminEventos`: suman su botón de editar (puntos 6 y 7).

### 3. `src/screens/AdminMusicosScreen.tsx` (nuevo) — la ventana Músicos (W-343, W-349)

- Buscador (`TextInput`, `placeholder="Buscar banda o cuenta"`, 300 ms después de la
  última tecla) y chips **Todas**, **Cuentas**, **Fichas sueltas**.
- Lee `listarCuentasMusico(q)` y `listarFichasSueltas(q)` (spec 197). Se vuelve a leer al
  enfocar la pantalla (`useFocusEffect`): al volver de una ficha conectada o unida, la lista
  ya no la trae. Tirar hacia abajo recarga.
- Cargando: `ActivityIndicator`. Error: «No se pudo cargar: {mensaje}» en `c.danger`.
- **Sugerencias** (solo con filtro distinto de «Cuentas» y buscador vacío):
  `sugerirCoincidencias(fichas, cuentas)` sobre las listas completas. Bloque con fondo
  `c.warningBg`:
  - Título: «{N} fichas parecen ser de una cuenta» (con 1: «1 ficha parece ser de una cuenta»).
  - Texto: «Se llaman igual o parecido que una cuenta de músico. Revísalas y conéctalas para
    que sus eventos aparezcan en el perfil y el CRM de la banda.»
  - Cada una: «Ficha» {nombre} → «Cuenta» {nombre}, con **«No es»** (la oculta hasta
    recargar, estado local) y **«Conectar»**: `confirmar({ title: 'Conectar con una cuenta',
    message: 'Los {N eventos} de «{ficha}» pasan a la cuenta de {cuenta} y la ficha desaparece. No se puede deshacer.',
    confirmText: 'Conectar', destructive: true })` → `adminVincularBanda` → aviso
    «Conectada con {cuenta}» y recarga.
- **«Cuentas de músico · N»**: fila con nombre, etiqueta «Cuenta» y detalle
  `[ciudad, «N eventos»]` unidos con « · ». Tocarla abre el CRM de esa cuenta
  (`AdminTenant` con `{ tipo: 'musician', id, nombre }`), donde está «Editar perfil»
  (punto 5). Vacío: «No hay cuentas con ese nombre.»
- **«Fichas sueltas · N»**: nombre, etiqueta «Ficha suelta» y detalle
  «Creada en un evento de {primerLocal} · N eventos» (sin eventos: «Sin eventos · 0 eventos»).
  Tocarla abre `AdminFichaBanda`. Vacío: «No hay fichas sueltas con ese nombre.»
- Lista con `FlatList`/`SectionList` (puede haber 100 filas); plural con el helper local
  `plural(n, 'evento', 'eventos')` como en `AdminCrmScreen`.

### 4. `src/screens/AdminFichaBandaScreen.tsx` (nuevo) — una ficha suelta (W-343, W-349)

- Lee `fichaSueltaPorId(fichaId)` y `eventosDeFichas([fichaId])`. Si es `null`: «Esta ficha
  ya no existe: la conectaron con una cuenta o la unieron con otra.» y botón «Volver».
- Bajada: «Sin cuenta: sus eventos no salen en ningún perfil de músico.»
- **«Datos de la ficha»**: campos Nombre, Género, Comuna, Instagram, Contacto (`TextInput`,
  claves `name`, `genero`, `comuna`, `instagram`, `contacto`). «Guardar cambios» activo solo
  si `soloCambios(inicial, actual)` no está vacío → `adminEditarBanda(fichaId, cambios)` →
  aviso «Cambios guardados» y los valores guardados pasan a ser el nuevo `inicial`.
- **«Conectar con una cuenta»**: `<SelectorBandaAdmin tipos={['cuenta']}
  placeholder="Buscar cuentas de músico" textoAccion="Conectar"
  textoVacio="No hay cuentas de músico con ese nombre." />`. Al elegir: `confirmar({ title:
  'Conectar con una cuenta', message: 'Los {N eventos} de esta ficha pasan a la cuenta de
  {cuenta} y la ficha desaparece. No se puede deshacer.', confirmText: 'Conectar',
  destructive: true })` → `adminVincularBanda(fichaId, cuenta.id)` → `navigation.goBack()`
  (la ficha ya no existe). Debajo, texto chico: «Conectar le da a la cuenta los eventos de
  esta ficha, y la ficha desaparece.»
- **«Unir con otra ficha suelta»**: `<SelectorBandaAdmin tipos={['ficha']}
  excluir={[fichaId]} placeholder="Buscar otras fichas sueltas" textoAccion="Unir"
  textoVacio="No hay otras fichas sueltas con ese nombre." />`. Al elegir: `confirmar({
  title: 'Unir fichas', message: 'Los {N eventos} de esta ficha pasan a la ficha «{destino}»
  y esta ficha desaparece. Los datos vacíos de la otra ficha se completan con los de esta.',
  confirmText: 'Unir fichas' })` → `adminUnirBandas(fichaId, destino.id)` → `goBack()`.
- **«Eventos de esta ficha»**: una línea por evento, «{nombre} · {fecha ?? 'sin fecha'} ·
  {local} ({principal ? 'principal' : 'invitada'})». Vacío: «Todavía no está en ningún evento.»
- Botones deshabilitados mientras corre una acción.

### 5. `src/components/SelectorBandaAdmin.tsx` (nuevo)

```ts
interface Props {
  tipos: TipoBanda[];
  excluir?: string[];
  placeholder: string;
  textoAccion: string;
  textoVacio: string;
  deshabilitado?: boolean;
  onElegir: (banda: BandaEncontrada) => void;
}
```

`TextInput` + `buscarBandasAdmin(texto, tipos)` 300 ms después de la última tecla y con 2
caracteres o más; filtra `excluir`. Cada resultado: nombre, etiqueta de banda (abajo) y un
botón con `textoAccion`. Con 2+ caracteres y sin resultados, `textoVacio`. Error de lectura
en `c.danger`. Al elegir, limpia el texto. No crea fichas: el admin elige entre las que
existen (crear una ficha nueva desde aquí queda fuera).

**Etiqueta de banda** (exportada como `EtiquetaBanda`, la usa también el punto 9):
`cuenta` → «En Sonópolis» (fondo `c.successBg`, texto `c.success`); `ficha` → «Sin cuenta»
(fondo `c.warningBg`, texto `c.warningText`). Mismo criterio que W-349.

### 6. `src/components/AvisoEdicionAdmin.tsx` (nuevo) (W-352)

`<AvisoEdicionAdmin nombre={string} tipo={'musico' | 'local' | 'evento'} onVerFicha={() => void} />`

Franja arriba del formulario, fondo `c.warningBg`, borde `c.warning`, ícono Ionicons
`shield-checkmark-outline` en `c.warningText`:
«Estás editando como admin el perfil de **{nombre}**. Lo que guardes lo verá como suyo.»
(con `tipo='evento'`: «…como admin el evento **{nombre}**…»). Dos enlaces: «Ver ficha
pública» (`onVerFicha`) y «Volver al admin» (`navigation.goBack()`). En la web el segundo es
«Volver al CRM»; en la app el admin puede llegar desde el CRM, «Locales» o «Eventos», y
volver es siempre a la pantalla anterior.

`onVerFicha` navega a la pestaña que tiene la ficha, como ya hace `AdminTenantScreen` con
`DetalleEvento`: músico → `navigate('Locales', { screen: 'VerMusico', params: { musicoId } })`;
local → `navigate('Locales', { screen: 'DetalleLocal', params: { venueId } })`; evento →
`navigate('Cartelera', { screen: 'DetalleEvento', params: { eventoId } })`.

### 7. Entradas a los formularios desde el admin

- **`src/screens/AdminTenantScreen.tsx`** (CRM de un local o una cuenta de músico, el
  `PanelCuenta`/`PanelLocal` de la web): al principio del contenido, antes de la primera
  `Seccion`, una fila con **«Editar perfil»** (`venue` → `AdminEditarLocal { localId: id,
  nombre }`; `musician` → `AdminEditarPerfilBanda { cuentaId: id, nombre }`) y **«Ver ficha
  pública»** (mismas navegaciones del punto 6). Nada más cambia en la pantalla.
- **`src/screens/AdminLocalesScreen.tsx`**: cada `TarjetaLocal` suma «Editar perfil» →
  `AdminEditarLocal { localId: local.venueId, nombre: local.nombre }` y «Ver ficha pública».
  Invitar y cancelar al dueño no cambian.
- **`src/screens/AdminEventosScreen.tsx`**: cada `Fila` suma «Editar» →
  `AdminEditarEvento { eventoId }`, en todas las secciones. El comentario de cabecera que
  dice que «Editar» queda fuera pasa a decir que lo suma el spec 206; «Entradas» sigue fuera.

### 8. Los formularios del dueño aceptan al admin

Regla común a las tres pantallas: **cada `user.id` que hoy identifica la fila editada**
(carga, guardado, carpeta de `CampoImagen`, y lo que hayan sumado 200/201 —portada, pin—)
pasa a ser el id editado. Y cada gate de dueño que hayan dejado 200/201 para la portada o el
pin dentro de estas pantallas pasa a `puedeEditarComoDueno({ userId, duenoId, esAdmin })`.

**`src/screens/EditarPerfilBandaScreen.tsx`**
- `cuentaId = route.params?.cuentaId`; `useEsAdmin()`; `decidirEdicion({ userId: user?.id,
  rol: role, esAdmin, rolDueno: 'musician', objetivoId: cuentaId, duenoId: cuentaId })`;
  `objetivoId = cuentaId ?? user.id`.
- Con `cuentaId`, mientras `useEsAdmin` carga: el `ActivityIndicator` de hoy. No
  permitido: «No puedes editar este perfil.» y botón «Volver» (la web da 404).
- `cargarPerfil` lee `objetivoId`. Como admin, si no hay fila o `data.role !== 'musician'`:
  «Esa cuenta no es de músico.» sin formulario (el admin no crea perfiles ajenos; el
  formulario en blanco del dueño sin perfil sigue igual).
- Guardar: la fila de `mapProfileToDB({ userId: objetivoId, … })`; como admin va por
  `guardarPerfilMusicoComoAdmin(objetivoId, fila)`, el dueño sigue con su `upsert`. Después,
  `navigation.goBack()` como hoy.
- Con `comoAdmin`, `<AvisoEdicionAdmin tipo="musico" nombre={nombre || route.params.nombre} …/>`
  arriba del `ScrollView`.

**`src/screens/EditarLocalScreen.tsx`**
- `localId = route.params?.localId`. El local editado es
  `localId ? allVenues.find((v) => v.id === localId) : miVenue` (`miVenue` sigue igual para
  el dueño). `decidirEdicion({ …, rolDueno: 'local', objetivoId: localId, duenoId: venue?.ownerId ?? null })`.
- Con `localId`: mientras `VenuesContext` o `useEsAdmin` cargan, `ActivityIndicator`; si
  terminó y no está, «Ese local no existe.»; no permitido, «No puedes editar este local.».
  **Nunca entra al modo crear**: guardar con `localId` siempre es `updateVenue(localId, campos)`.
- La precarga del formulario, `CampoImagen` y `GestionDirecciones` usan el local editado.
- Con `comoAdmin`, `<AvisoEdicionAdmin tipo="local" nombre={venue.name} …/>` arriba.
- `updateVenue` no manda `owner_id` (los `campos` no lo traen): el dueño no cambia.

**`src/screens/EditarEventoScreen.tsx`**
- Con `permisos.comoAdmin`: `<AvisoEdicionAdmin tipo="evento" nombre={venueName ?
  `${artista} en ${venueName}` : artista} …/>` arriba (el evento no tiene título propio; el
  mismo criterio que la addenda de W-352).
- Con `permisos.esAdmin` (también si es del equipo), antes de la tarjeta del formulario:
  `<BandasYLocalAdmin eventoId={evento.id} local={evento.venueId ? { id: evento.venueId,
  nombre: evento.venueName } : null} onCambio={refresh} onCambioPrincipal={setArtista} />`
  (`refresh` de `useEventos()`).
- `onCambioPrincipal` pone en el campo «Artista» el `artist_name` que devuelve la base: sin
  eso, guardar el formulario después pisaría el nombre nuevo con el viejo (el mismo
  problema que W-355 resolvió con `key`).
- Datos para el pago: sin cambios (solo `esOwner`): el admin no los ve ni los guarda (W-350).

### 9. `src/components/BandasYLocalAdmin.tsx` (nuevo) (W-355)

Props: `{ eventoId: string; local: { id: string; nombre: string } | null; onCambio: () => Promise<void>; onCambioPrincipal: (artistName: string) => void }`.
Lee `bandasDelEventoAdmin(eventoId)` al montar y después de cada acción; locales de
`useVenues().allVenues` (solo lectura).

- Título «Bandas y local». Bajada: «Solo el admin ve este bloque. Cambiar la banda principal
  o el local también cambia quién puede editar el evento.» Mismo marco de tarjeta que el
  formulario (`c.cardBackground`, `borderRadius.md`).
- **Banda principal**: nombre («Sin nombre» si viene vacío) y `EtiquetaBanda`; botón
  «Cambiar» abre `<SelectorBandaAdmin tipos={['cuenta','ficha']} textoAccion="Elegir" …/>`
  con «Cancelar». Sin principal: «Sin banda principal.» y el selector a la vista. Al elegir:
  `adminCambiarPrincipalEvento(eventoId, banda)` → aviso «{nombre} es la banda principal»,
  `onCambioPrincipal(fila.artist_name)`, recarga y `onCambio()`.
- **Otras bandas**: lista con «Quitar» en cada una → `quitarBandaAdicional` → «{nombre} se
  quitó del evento». Vacío: «No hay otras bandas.» Selector para agregar (`textoAccion="Agregar"`):
  si `estaEnElEvento(bandas, banda)`, aviso de error «Esa banda ya está en el evento» sin
  llamar a la base; si no, `agregarBandaAdicional(eventoId, banda, siguienteOrden(adicionales))`
  → «{nombre} se agregó al evento».
- **Local**: el nombre actual o «Sin local». Un `TextInput` «Buscar local» filtra
  `allVenues` por nombre (sin tildes ni mayúsculas, 8 resultados como máximo, «{nombre} ·
  {comuna}»); tocar uno lo marca. Botón «Cambiar local» (sin local: «Poner local»),
  deshabilitado sin elección o si es el mismo → `adminCambiarLocalEvento(eventoId, id)` →
  «El evento ahora es en {nombre}» y `onCambio()`. No hay «crear local».
- Cada acción deshabilita los botones mientras corre; el resultado va en la línea de aviso
  del bloque (error: el mensaje de la base tal cual).

### 10. `src/screens/DetalleEventoScreen.tsx` — una línea

En «Gestión del evento», `Tu rol: {permisos.rol}` pasa a mostrar «Editas como admin de
Sonópolis» cuando `permisos.rol` es `null` (desde el 197 la tarjeta también se ve para el
admin sin rol, y sin esto diría «Tu rol: » vacío). Nada más cambia en la pantalla.

### Lo que NO cambia

- Los dueños y el equipo: sin parámetro, las tres pantallas del dueño se comportan igual
  (mismo modo crear del local, mismo `upsert` del músico, mismo destino al guardar), y no
  ven el bloque «Bandas y local» ni el aviso.
- `AdminCrmScreen`, `useAdminCrm` (spec 188) y la invitación de dueño de local.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `npx expo export --platform web` termina sin errores.
3. Ningún hex nuevo en los archivos tocados (`git diff` sin `#[0-9a-fA-F]{3,6}` agregado).
4. `grep -n "Alert.alert" src/screens/AdminMusicosScreen.tsx src/screens/AdminFichaBandaScreen.tsx src/components/BandasYLocalAdmin.tsx src/components/SelectorBandaAdmin.tsx`
   no devuelve nada.
5. `grep -n "AdminMusicos\|AdminFichaBanda\|AdminEditarPerfilBanda\|AdminEditarLocal\|AdminEditarEvento" src/navigation/pantallasAdmin.tsx`
   devuelve las cinco rutas en el tipo y en el grupo.
6. `grep -n "upsert" src/screens/EditarPerfilBandaScreen.tsx` sigue devolviendo la línea del
   dueño, y `grep -n "guardarPerfilMusicoComoAdmin" src/screens/EditarPerfilBandaScreen.tsx`
   devuelve una línea.
7. `grep -n "id={user.id}\|id={user?.id}" src/screens/EditarPerfilBandaScreen.tsx` no devuelve
   nada (las fotos van a la carpeta de la cuenta editada).
8. `git diff --stat` del commit toca solo los archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

Recorrido con la sesión del admin, sobre cuentas, fichas y eventos de prueba, logout con
`scope: 'local'` al terminar, sin cuentas de terceros:
1. Admin → CRM → una cuenta de músico → «Editar perfil»: se ve el aviso, se cambia la bio y
   el avatar, se guarda, vuelve, y la ficha pública muestra lo nuevo.
2. Admin → Locales → un local → «Editar perfil»: se cambia el horario, se agrega y activa
   una dirección; la ficha pública muestra la dirección nueva.
3. Admin → Músicos: una sugerencia «Conectar» y una ficha conectada desde su pantalla; sus
   eventos salen en el perfil del músico. Unir dos fichas de prueba.
4. Admin → Eventos → «Editar» en un evento ajeno: aviso de admin; cambiar la banda
   principal (el campo «Artista» muestra el nombre nuevo y guardar no lo pisa), agregar y
   quitar una banda adicional, poner y cambiar el local; el dueño del local nuevo ve el
   evento en su panel.
5. Con una cuenta de músico normal: su «Editar perfil» y su «Editar local» siguen iguales, y
   no aparece el bloque «Bandas y local» en sus eventos.

## Fuera de alcance

- «Ajustar portada» y el pin en las fichas públicas (`VerMusicoScreen`, `DetalleLocalScreen`)
  para el admin (W-352 «Fichas públicas»): son pantallas de los specs 201 y 202; queda como
  spec aparte (`puedeEditarComoDueno` del 197 ya está para eso).
- «Entradas» desde `AdminEventosScreen`.
- Crear fichas o locales desde el admin, reordenar bandas adicionales, pagos del evento
  ajeno, editar cuentas de fan.

## Bugs encontrados al aplicar (28-nov-2026)

No se corrigieron: el diseño no los pide.

1. `EditarEventoScreen` sigue diciendo «El local (…) y el artista vinculado no se pueden cambiar
   desde acá.» también al admin, que los cambia en el bloque «Bandas y local» de la misma pantalla.
2. `EditarEventoScreen` busca el evento en `EventosContext`, que carga una sola vez al montar la app.
   Si el admin inició sesión después, un borrador ajeno que sí sale en «Eventos» puede abrir como
   «Evento no encontrado» hasta recargar la cartelera.
3. `useAdminEventos` no relee al volver del formulario: la fila muestra los datos anteriores hasta
   tirar hacia abajo.
