# Spec 129 — La app sube imágenes al bucket `media` desde la galería del teléfono

> Estado: aplicado (17-oct-2026) — `npx tsc --noEmit` sin errores en los archivos del spec, `npx expo export --platform web` OK, criterios 2-6 verificados con `rg`/diff. V-candidatas 1-5 pendientes (necesitan build nativo nuevo y dispositivo real).
> Capa: LÓGICA. `package.json`, `package-lock.json`, `app.json`, `src/lib/imagenes.ts` (nuevo), `src/hooks/useSubirImagen.ts` (nuevo).
> Depende de: ninguno pendiente. El bucket `media` y sus policies ya están en producción (migraciones `20260822053622_spec_053_bucket_imagenes.sql`, `20260828000000_spec_062_storage_flyer_pendiente.sql`, `20260917170000_spec_092_media_no_listable.sql`).
> Alimenta: spec 130 (avatar y foto del músico), spec 134 (avatar y foto del local), spec 136 (flyer del evento).
> Hermano en la web: `sonopolisWeb/libs/storage.js` (W-010, W-011, W-061) y `sonopolisWeb/components/ImageUpload.js` (W-012, w046).

> **En una frase:** una función `subirImagen` y un hook `useSubirImagen` que abren la
> galería con `expo-image-picker`, validan formato y peso igual que la web, y suben a
> `media/<carpeta>/<id>/<uuid>.<ext>` devolviendo la URL pública; funciona en iOS, Android
> y Expo web.

## Contexto

Hoy la app no sube ninguna imagen. Las tres pantallas que tienen imagen piden **una URL
escrita a mano**: `EditarPerfilBandaScreen.tsx:226` («Foto (URL)»), `EditarLocalScreen.tsx:220`
(«Imagen (URL)») y el flyer de `CrearEventoScreen`. `grep -rn "\.storage\." src` devuelve cero
(lo confirma el comentario de la migración del spec 092). En el teléfono nadie tiene una URL
de su foto a mano, así que en la práctica la app crea perfiles, locales y eventos sin imagen.

La web ya resolvió esto en `sonopolisWeb/libs/storage.js`:

- Bucket público `media`, un prefijo por dominio: `perfiles/<user_id>/`, `locales/<venue_id>/`,
  `eventos/<evento_id>/`, `pendientes/<user_id>/` (`storage.js:1-8`).
- Tipos permitidos `image/jpeg`, `image/png`, `image/webp`, `image/avif`; máximo 5 MB
  (`storage.js:10-11`).
- Nombre de archivo `crypto.randomUUID()` y **sin `upsert`** (`storage.js:72-80`): con `upsert`,
  Storage exige además `SELECT` sobre `storage.objects`, que el spec 092 quitó a propósito, y
  toda subida daba 403.
- El rechazo de una policy se traduce a «No tienes permiso…», distinto de un fallo de red
  (`storage.js:82-90`).

Las policies que mandan (no se reimplementan en el cliente):

| Carpeta | Quién puede subir | Migración |
|---|---|---|
| `perfiles/<id>/` | `auth.uid()::text = <id>` | spec 053, líneas 32-44 |
| `locales/<id>/` | dueño del venue (`venues.owner_id = auth.uid()`) | spec 053, líneas 47-67 |
| `eventos/<id>/` | `can_edit_event(<id>)` | spec 053, líneas 17-29 |
| `pendientes/<id>/` | `auth.uid()::text = <id>` (flyer o foto antes de que exista el evento o el local) | spec 062 |

**El nombre aleatorio es parte de la seguridad, no un detalle.** El spec 092 borró la policy
de lectura: el bucket es público, así que cualquiera que tenga la URL descarga el archivo, y
lo único que protege `pendientes/` (el arte de un show sin anunciar) es que la URL no se
pueda adivinar. Por eso el nombre tiene que salir de un generador criptográfico, no de
`Math.random()`.

## Diseño

### 1. Dependencias nuevas

```bash
npx expo install expo-image-picker expo-crypto
```

- `expo-image-picker` abre la galería del sistema. Desde iOS 14 y Android 13 usa el selector
  del sistema, que **no pide permiso** para elegir una foto; el texto de permiso igual se
  declara porque iOS lo exige en el `Info.plist` si el módulo está enlazado.
- `expo-crypto` da `randomUUID()` criptográfico en iOS, Android y web. **Por qué otra
  dependencia:** Hermes (el motor de JavaScript de React Native) no trae `crypto.randomUUID`
  global, y el nombre del archivo tiene que ser imposible de adivinar (spec 092). Como
  `expo-image-picker` ya obliga a un build nativo nuevo, sumar `expo-crypto` en el mismo build
  no agrega costo de distribución.

En `app.json`, dentro de `expo.plugins`, agregar **antes** de `"expo-camera"`:

```json
[
  "expo-image-picker",
  {
    "photosPermission": "Sonópolis usa tus fotos para que subas la imagen de tu perfil, de tu local o el flyer de tu evento.",
    "cameraPermission": "Sonópolis usa la cámara para leer el código QR de las entradas en la puerta del show.",
    "microphonePermission": false
  }
]
```

`cameraPermission` repite **a propósito** el texto exacto de `expo-camera`: iOS tiene un solo
`NSCameraUsageDescription` por app, y si el plugin de `expo-image-picker` pusiera su texto por
defecto (en inglés), el escáner de entradas mostraría ese texto. Este spec no usa la cámara
para fotos (solo galería).

### 2. `src/lib/imagenes.ts` (nuevo) — funciones puras de subida

Exporta:

```ts
export type CarpetaMedia = 'perfiles' | 'locales' | 'eventos' | 'pendientes';

export interface ImagenElegida {
  uri: string;
  mimeType: string | null;
  nombreArchivo: string | null;
}

export const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const TAMANO_MAXIMO = 5 * 1024 * 1024;

export async function elegirImagen(opciones?: { aspecto?: [number, number] }): Promise<ImagenElegida | null>;
export async function subirImagen(args: { imagen: ImagenElegida; carpeta: CarpetaMedia; id: string }): Promise<{ url: string }>;
```

Los tipos viven en este archivo y no en `src/types/index.ts` por el mismo criterio que
`useEntradasEvento.ts:5` y `useCanjeEntrada.ts:13`: son la firma de una función, no una entidad
del dominio.

**`elegirImagen`:**

- Llama a `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: Boolean(opciones?.aspecto), aspect: opciones?.aspecto, quality: 0.8, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible })`.
- `quality: 0.8` recomprime JPEG en el teléfono: es el equivalente nativo de la
  recompresión a WebP que hace la web (`storage.js:25-50`, W-061), para que una foto de
  cámara no choque con el límite de 5 MB.
- `preferredAssetRepresentationMode: Compatible` hace que iOS entregue las fotos HEIC (el
  formato por defecto del iPhone) convertidas a JPEG. Sin esto, la mayoría de las fotos de
  un iPhone caerían en «Formato no soportado».
- Si `result.canceled` → devuelve `null` (cancelar no es error).
- Si no: devuelve `{ uri: asset.uri, mimeType: asset.mimeType ?? null, nombreArchivo: asset.fileName ?? null }`.

**`subirImagen`:**

1. Resuelve el tipo: `imagen.mimeType`; si es `null`, lo deduce de la extensión de
   `nombreArchivo` o de `uri` (`jpg`/`jpeg` → `image/jpeg`, `png`, `webp`, `avif`). Si no está
   en `TIPOS_PERMITIDOS` → `throw new Error('Formato no soportado. Usa JPEG, PNG, WebP o AVIF.')`
   (mismo texto que `storage.js:61`). Se valida **antes** de leer el archivo.
2. Lee los bytes: `const bytes = await fetch(imagen.uri).then((r) => r.arrayBuffer())`. Es el
   camino que documenta Supabase para Expo y sirve igual para `file://` (nativo) y `blob:`
   (Expo web).
3. Si `bytes.byteLength > TAMANO_MAXIMO` → `throw new Error('La imagen pesa demasiado (máximo 5MB).')`.
4. Ruta: `` `${carpeta}/${id}/${Crypto.randomUUID()}.${extension}` ``, con `extension` derivada
   del tipo (`image/jpeg` → `jpg`, `image/png` → `png`, `image/webp` → `webp`, `image/avif` → `avif`).
5. `supabase.storage.from('media').upload(ruta, bytes, { contentType: tipo })` — **sin
   `upsert`**, por la razón del contexto.
6. Error: si `error.message` calza `/row-level security|policy|permission|unauthorized/i` →
   `throw new Error('No tienes permiso para subir una imagen acá.')`; si no →
   `throw new Error('No se pudo subir la imagen. Intenta de nuevo.')`. Nunca un `catch {}`.
7. Devuelve `{ url: supabase.storage.from('media').getPublicUrl(ruta).data.publicUrl }`.
   `getPublicUrl` no hace red: arma la URL con la convención fija de Storage, igual que
   `urlPublica()` de la web.

### 3. `src/hooks/useSubirImagen.ts` (nuevo) — el API que usan las pantallas

```ts
export function useSubirImagen(destino: { carpeta: CarpetaMedia; id: string | undefined }): {
  subiendo: boolean;
  elegirYSubir: (opciones?: { aspecto?: [number, number] }) => Promise<string | null>;
};
```

- `elegirYSubir` abre la galería; si se canceló devuelve `null` sin tocar `subiendo`.
- Si se eligió: `subiendo = true`, llama a `subirImagen`, devuelve la URL pública y deja
  `subiendo = false` en `finally`.
- Si `destino.id` es `undefined` → `throw new Error('Todavía no hay dónde guardar la imagen.')`
  antes de abrir la galería.
- **Lanza** los errores de `subirImagen` tal cual: el hook no muestra alertas. Quien lo usa
  decide cómo avisar (el spec 130 crea el componente visual reutilizable).

Uso típico (lo que harán 130, 134 y 136):

```ts
const { subiendo, elegirYSubir } = useSubirImagen({ carpeta: 'perfiles', id: user?.id });
const url = await elegirYSubir({ aspecto: [1, 1] }); // null si canceló
```

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio.
2. `package.json` lista `expo-image-picker` y `expo-crypto` con la versión que fijó
   `npx expo install` (rango `~56.x`); `package-lock.json` actualizado en el mismo commit.
3. `app.json` tiene el plugin de `expo-image-picker` con los tres campos de arriba, antes de
   `expo-camera`.
4. `rg -n "upsert\s*:" src/lib/imagenes.ts` devuelve cero (la llamada a `.upload` no pasa la opción).
5. El nombre del archivo sale de `randomUUID()` importado de `expo-crypto` (`rg -n "from 'expo-crypto'" src/lib/imagenes.ts` da una línea).
6. `rg -n "catch\s*\{\s*\}" src/lib/imagenes.ts src/hooks/useSubirImagen.ts` devuelve cero.
7. `npx expo export --platform web` termina sin error.

## Fuera de alcance

- Las pantallas que usan la subida: specs 130, 134 y 136.
- Redimensionar a 1920 px como la web: necesitaría `expo-image-manipulator`. `quality: 0.8`
  cubre el caso común (foto de cámara); un PNG enorme se rechaza con el mensaje de peso.
- Tomar la foto con la cámara en el momento: solo galería.
- Borrar del bucket la imagen anterior al reemplazarla: la web tampoco lo hace, y el bucket
  sin `SELECT` (spec 092) no deja listar lo huérfano desde el cliente.

## Verificación manual

- **V-candidata 1:** en un iPhone real, elegir una foto HEIC de la cámara → sube como `.jpg` y se ve en la URL devuelta.
- **V-candidata 2:** en Android real, elegir una foto → sube y la URL abre en el navegador.
- **V-candidata 3:** en Expo web, elegir un PNG → sube; un `.gif` → «Formato no soportado».
- **V-candidata 4:** subir a `perfiles/<id de otra persona>` → «No tienes permiso para subir una imagen acá.» (prueba la traducción del rechazo de policy).
- **V-candidata 5:** primera vez en iOS: el selector abre sin pedir permiso; el escáner de entradas sigue mostrando el texto en español de `expo-camera`.
