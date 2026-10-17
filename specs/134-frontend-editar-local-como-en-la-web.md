# Spec 134 — Editar local al nivel de la web: direcciones, avatar, foto y estilos

> Estado: propuesto (16-oct-2026)
> Capa: FRONTEND. `src/screens/EditarLocalScreen.tsx`, `src/components/GestionDirecciones.tsx` (nuevo), `src/context/VenuesContext.tsx`, `src/types/index.ts`.
> Depende de: spec 095 (selector de país en `EditarLocalScreen` y `pais` en el mapper), spec 115 (reescribe `VenuesContext` sin mock ni `catch {}`), spec 129 (subida de imágenes), spec 130 (`CampoImagen`), spec 133 (`useDireccionesVenue`, `crearDireccion`).
> Alimenta: —
> Hermano en la web: `app/(private)/local/editar/FormLocal.js` (W-062–W-065, W-114), `components/GestionDirecciones.js` (W-064), `components/ImageUpload.js`.

> **En una frase:** la pantalla de editar local deja de escribir la dirección directo en
> `venues` y pasa a administrar hasta 3 direcciones con una activa, suma avatar y foto
> subidos desde la galería, y el estilo musical pasa a selección múltiple como en la web.

## Contexto

Comparación con `FormLocal.js`:

| Campo | Web | App hoy |
|---|---|---|
| Tipo | `<select>` de `VENUE_TYPES` | Ya existe (chips, `EditarLocalScreen.tsx:128-140`). Sin cambios |
| País | Selector en «Identidad» (W-114) | Lo agrega el spec 095 |
| Avatar | `ImageUpload` (`FormLocal.js:214-231`) | No existe; `Venue` ni siquiera mapea `avatar` (`VenuesContext.tsx:16-43`), aunque la columna existe desde el spec 085 |
| Foto del local | `ImageUpload` (`FormLocal.js:233-250`) | `TextInput` «Imagen (URL)» (`EditarLocalScreen.tsx:220-221`) |
| Dirección al crear | 3 campos; después del `insert` del venue, `crearDireccion` (`FormLocal.js:127-136`) | 3 campos que van directo a `venues` |
| Dirección al editar | `GestionDirecciones` (hasta 3, una activa); **nunca** manda `address/comuna/ciudad` en el `update` (`FormLocal.js:118-124`) | Los mismos 3 campos, escritos directo en `venues` en cada guardado (`EditarLocalScreen.tsx:84-86`) |
| Estilo musical | `GeneroSelect` múltiple, guardado como `"A, B"` en `venues.estilo` (`FormLocal.js:91-94`, `:106-109`) | `GeneroPicker` de un solo valor (`EditarLocalScreen.tsx:173-184`) |

**Por qué la dirección no puede seguir escribiéndose directo.** Desde W-062, `venues.address`
es una copia que mantiene el trigger `venue_addresses_sync_activa` a partir de la fila activa
de `venue_addresses`. Si la app escribe `venues.address` directo, la próxima activación (desde
la web o desde la app) pisa ese valor sin aviso, y lo tecleado nunca existió en
`venue_addresses`. Es el pendiente #21 de la web, que hoy la app reproduce en cada guardado.

**Carpeta de las imágenes.** Al editar, el venue existe: se sube a `locales/<venue.id>/`
(policy `media_insert_locales`, solo el dueño). Al crear, el venue todavía no tiene id: se sube
a `pendientes/<user.id>/` (policy del spec 062), igual que la web (`FormLocal.js:224-226`).

## Diseño

### 1. `avatar` en el tipo y el mapper del local

- `src/types/index.ts`, `Venue`: `avatar?: string | null; // spec 085`.
- `src/context/VenuesContext.tsx`: en `mapVenueFromDB`, `avatar: db.avatar ?? null`; en
  `mapVenueToDB`, `if ('avatar' in venue) out.avatar = venue.avatar ?? null;`. Solo esas dos
  líneas: el resto del contexto queda como lo dejen 095 y 115.

### 2. `src/components/GestionDirecciones.tsx` (nuevo)

Equivalente de `GestionDirecciones.js`. Props `{ venueId: string; onCambio?: () => void }`.

- Usa `useDireccionesVenue(venueId)` (spec 133).
- Cargando → `ActivityIndicator`. `error` → texto y «Reintentar».
- Lista: por cada dirección, `[address, comuna, ciudad]` unidos con `", "`.
  - Activa: fondo `colors.accentLight`, borde `colors.accent`, etiqueta «Activa» y bajo el
    texto «Es la que se ve en tu ficha, en el mapa y en la cartelera».
  - No activa: botones «Usar esta» (`activar`) y «Borrar» (`eliminar`, previo `confirmar()` de
    `src/lib/confirm.ts` con `destructive: true`).
- Si `puedeAgregar`: botón «+ Agregar otra dirección» que despliega tres campos (Dirección,
  Comuna, Ciudad) con «Guardar»/«Cancelar». Si la lista está vacía, encima el texto «Esta
  primera dirección queda activa sola. De la segunda en adelante, activar es un paso aparte.»
- Si no: «Llegaste al máximo de 3 direcciones. Borra una para agregar otra.»
- Después de `crear` o `activar` con éxito → `onCambio?.()`.
- Errores → `Alert.alert('No se pudo …', err.message)` (agregar / activar / borrar).
- Mientras corre una acción, todos los botones quedan deshabilitados.
- Se guarda al momento, sin pasar por «Guardar cambios». Encima de la sección, el texto chico
  «Se guarda al momento» (mismo aviso que `FormLocal.js:42-55`), para que nadie crea que
  «Guardar cambios» deshace una dirección.

### 3. `EditarLocalScreen.tsx`

Partir del archivo como lo deja el spec 095 (con su selector de país).

**Imágenes**, en una tarjeta «Foto» después de los datos de identidad:
- «Avatar (logo)», `CampoImagen` con `carpeta = miVenue ? 'locales' : 'pendientes'`,
  `id = miVenue ? miVenue.id : user.id`, `aspecto={[1, 1]}`, ayuda «Aparece en el feed de tus
  seguidores — sube tu logo o algo cuadrado.»
- «Foto del local», `CampoImagen` con la misma carpeta e id, sin aspecto, ayuda «Es lo primero
  que ve un músico en tu ficha.»
- Estado nuevo `avatar`, precargado con `miVenue.avatar ?? ''`. Se borra el `TextInput`
  «Imagen (URL)»; `image` sigue en el estado y lo llena el `CampoImagen`.
- Las dos van en `campos` como `avatar: avatar.trim() || undefined` e `image: image.trim() || undefined`,
  igual que el resto de los campos de la pantalla. La clave siempre está presente, así que
  `mapVenueToDB` (que mira `'campo' in venue` y aplica `?? null`) manda `null` y borrar la URL
  borra la imagen.

**Dirección:**
- **Editando (`miVenue` existe):** se quitan los `TextInput` de Dirección, Ciudad y Comuna y
  en su lugar va `<GestionDirecciones venueId={miVenue.id} onCambio={refresh} />`, con
  `refresh` de `useVenues()`. `campos` **no** lleva `address`, `ciudad` ni `comuna`.
- **Creando:** se mantienen los tres campos con el texto «Esta primera dirección queda activa
  sola. De la segunda en adelante, activar es un paso aparte.» Al guardar:
  1. `createVenue({ ...campos sin address/ciudad/comuna, ownerId: user.id })`.
  2. Si `address.trim()` no está vacío: `await crearDireccion(nuevo.id, { address, comuna, ciudad })`.
     La primera nace activa y el trigger escribe `venues.address`.
  3. `await refresh()` para que `allVenues` traiga la dirección que escribió el trigger.
  4. Si el paso 2 falla, el local **ya quedó creado**: `Alert.alert('Local creado sin dirección', 'Tu local se guardó, pero la dirección no: agrégala desde Editar local. (' + err.message + ')')`
     y se vuelve atrás igual. No se intenta borrar el venue.

**Estilo musical múltiple:**
- El estado pasa de `estilo: string` a `estilos: string[]`, precargado con
  `miVenue.estilo ? miVenue.estilo.split(', ').filter(Boolean) : []`.
- `GeneroPicker` con `multiple`, `seleccionados={estilos}`, `onCambiar={setEstilos}`,
  `titulo="Estilo musical"`. El campo muestra `estilos.join(', ')` o «Seleccionar géneros».
- Se guarda `estilo: estilos.length ? estilos.join(', ') : undefined` (el mapper lo convierte en `null`). El separador `", "` es el
  mismo de la web: `venues.estilo` es texto y las dos apps tienen que leer lo que escribe la
  otra.

Todo lo demás (tipo, nombre, aforo, descripción, horarios, equipamiento, contacto, país del
095) queda igual.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio.
2. Crear un local nuevo con dirección → existe una fila en `venue_addresses` con `activa = true` y `venues.address` tiene el mismo texto.
3. Editar un local y guardar otro campo (p. ej. horarios) → el `update` a `venues` no incluye `address`, `comuna` ni `ciudad` (se ve en el código: `campos` no los tiene en modo edición).
4. Agregar una segunda dirección y tocar «Usar esta» → pasa a activa, la anterior deja de serlo, y al volver al panel el local muestra la dirección nueva.
5. Con 3 direcciones, el botón de agregar no aparece y se ve el aviso del máximo.
6. La dirección activa no tiene botón «Borrar».
7. Subir avatar y foto en un local existente → URLs en `media/locales/<venue_id>/…` guardadas en `venues.avatar` y `venues.image` al tocar «Guardar cambios».
8. Elegir dos estilos y guardar → `venues.estilo = 'A, B'`; al reabrir la pantalla vienen los dos marcados.
9. `rg -n "Imagen \(URL\)" src/screens/EditarLocalScreen.tsx` devuelve cero.
10. `npx expo export --platform web` termina sin error.

## Fuera de alcance

- El aviso de «Te faltan N de 5 datos» de la web (`FormLocal.js:30-39`).
- Geocodificar la dirección (lat/lng): ver spec 133.
- Etiqueta de la división administrativa según el país («Comuna» queda fijo).
- Pasar `venues.estilo` a `text[]` (pendiente de la web; sería DATOS).
- Mostrar el avatar en la cartelera o en el panel del local.

## Verificación manual

- **V-candidata 1:** crear un local desde la app en un teléfono real, con foto y dirección → la ficha en la web (`/locales/<id>`) muestra la foto y la dirección.
- **V-candidata 2:** activar una dirección desde la app y abrir `/local/editar` en la web → la web muestra la misma como activa.
- **V-candidata 3:** un local con un solo estilo guardado antes de este spec abre con ese estilo marcado y lo conserva al guardar.
