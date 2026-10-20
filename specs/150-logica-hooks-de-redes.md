# Spec 150 — Lógica de las redes del CRM: cuentas, publicaciones, subida de medios y textos del anuncio

> Estado: propuesto (19-oct-2026)
> Capa: LÓGICA. `src/lib/apiWeb.ts`, `src/lib/redes/catalogo.ts` (nuevo), `src/lib/redes/reglas.ts` (nuevo), `src/lib/redes/textos.ts` (nuevo), `src/lib/redes/horario.ts` (nuevo), `src/lib/redes/api.ts` (nuevo), `src/lib/redes/medios.ts` (nuevo), `src/hooks/useTenantRedes.ts` (nuevo), `src/hooks/useConexionesRedes.ts` (nuevo), `src/hooks/usePublicacionesRedes.ts` (nuevo), `src/hooks/useSubirMediosRedes.ts` (nuevo), `package.json`, `package-lock.json`.
> Depende de: spec 148, spec 113, W-249 de la web
> Hermano en la web: `libs/redes/catalogo.js`, `libs/redes/reglas.js`, `libs/redes/textos.js`, `libs/redes/medios.js`, `components/redes/*` (W-233, W-236, W-237, W-238), y W-249 (las rutas `app/api/redes/*` con Bearer).

> **En una frase:** todo lo que necesitan las pantallas de Redes del spec 157 queda en
> `src/lib/redes/` y en cuatro hooks: saber de qué local o banda se publica y si tiene Pro,
> leer y desconectar cuentas, leer el historial, publicar o programar, cancelar y
> reintentar, y subir fotos y videos al bucket `redes` con progreso y reintento.

## Contexto

La web publica en Instagram, Facebook, Threads, X y TikTok desde el CRM de Sonópolis Pro
(W-233 a W-239). Está construida pero apagada: `redesDisponibles()`
(`sonopolisWeb/libs/redes/disponibilidad.js:30-32`) devuelve `[]` mientras falten las
variables `META_*`, `INSTAGRAM_*`, `THREADS_*`, `ZERNIO_API_KEY` y `REDES_CLAVE_CIFRADO`
en Vercel. La app tiene que llegar a la misma función y, hoy, mostrar el mismo «no
disponible» que la web.

**Por qué la app pasa por las rutas de la web y no por Supabase directo:** las cinco tablas
`redes_*` del spec 113 tienen RLS sin policies, así que con la sesión del usuario devuelven
cero filas. Las rutas de la web las leen con service role, cifran los tokens y revisan el
gate de Pro (`app/api/redes/publicaciones/route.js:30-45`). Esas rutas hoy solo aceptan la
cookie de la web; el W-249 les suma el `Authorization: Bearer` que ya manda
`llamarApiWeb` (`src/lib/apiWeb.ts:30-56`, spec 135).

Lo que exponen las rutas, leído del código de la web:

| Ruta | Método | Cuerpo / query | Respuesta | Exige Pro |
|---|---|---|---|---|
| `/api/redes/conexiones` | GET | `?tenantType=` | `{ disponibles, conexiones }` sin tokens (`conexiones/route.js:33-40`) | No |
| `/api/redes/conexiones` | DELETE | `?tenantType=&red=` | `{ ok: true }`; 404 si no estaba, 502 si Zernio falla (`:42-76`) | No |
| `/api/redes/publicaciones` | GET | `?tenantType=` | las últimas 50, con `destinos` (`publicaciones/route.js:48-53`) | Sí (402) |
| `/api/redes/publicaciones` | POST | `{ tenantType, texto, textosPorRed, medios, redes, opcionesPorRed, programadaPara, eventoId }` | 201 con la publicación; 400 `{ error, generales, porRed }`; 403; 429 (`:55-167`) | Sí |
| `/api/redes/publicaciones/<id>` | PATCH | `{ tenantType, accion: 'cancelar' \| 'reintentar', red? }` | la publicación actualizada; 404, 409 (`[id]/route.js:37-66`) | Solo reintentar |
| `/api/redes/medios` | POST | `{ tenantType, tipo, tamano }` | `{ path, token, url }` (`medios/route.js:40-65`) | Sí |

`tenantType` es `'venue'` o `'musician'`. El tenant lo resuelve la web con la sesión
(`libs/data/crmCorreo.js:19-32`): el local cuyo `owner_id` es el usuario, o el propio
`profiles.id` si su rol es `musician`.

**Medios.** La web prepara la imagen en un `<canvas>` (`libs/redes/medios.js:30-73`): la
pasa a JPEG de hasta 1440 px de ancho y 8 MB, y si su proporción cae fuera de 4:5–1,91:1
le agrega barras negras, porque Instagram rechaza otra cosa a la hora de publicar. La ruta
`/api/redes/medios` solo firma `image/jpeg`, `video/mp4` y `video/quicktime`
(`medios/route.js:21`), así que **la app también tiene que convertir a JPEG**: un flyer
PNG o el del bucket `media` (WebP, W-061) no pasa. `expo-image-picker` no convierte PNG
ni WebP a JPEG, y sin `<canvas>` en nativo hace falta `expo-image-manipulator`, el módulo
oficial de Expo para redimensionar y recodificar. Su acción `extent` (rellenar con color)
es solo web (`ImageManipulator.types.d.ts`, `@platform web`, versión 56.0.26), así que las
barras negras **no** se portan: en su lugar la app avisa antes de publicar (§3).

El archivo sube directo al bucket con una URL firmada de Storage (válida 2 horas), sin pasar
por Vercel. `uploadToSignedUrl` de supabase-js usa `fetch`, que no informa progreso; un
video de 100 MB por datos móviles sin barra de avance parece colgado. Por eso la subida va
con `XMLHttpRequest`, que sí emite `upload.onprogress` en nativo y en web.

## Diseño

Ningún archivo nuevo tiene `catch {}` vacío ni datos mock (spec 115). Los tipos nuevos
viven en el archivo que los usa, **no** en `src/types/index.ts`: así este spec no choca con
los que editan ese archivo en paralelo.

### 1. `src/lib/apiWeb.ts` — dos métodos más y el cuerpo del error

- `opciones.metodo` pasa a `'GET' | 'POST' | 'PATCH' | 'DELETE'`.
- `ErrorApiWeb` suma `cuerpo: Record<string, unknown>` (tercer parámetro opcional del
  constructor, default `{}`), con el JSON que devolvió la ruta. `llamarApiWeb` lo pasa al
  tirar. Hace falta porque el 400 de publicar trae `generales` y `porRed` además de
  `error`, y el redactor los pinta red por red como la web
  (`RedactorPublicacion.js:194-196`).
- `BASE_WEB` pasa a exportarse (`export const`). El spec 157 abre el panel web de redes
  con esa misma base: si `EXPO_PUBLIC_WEB_URL` apunta a un preview para probar, conectar
  y publicar tienen que ir al mismo deploy, o se conectaría en uno que tiene las redes
  apagadas y se leería en otro. En producción `BASE_WEB` es `URL_WEB`.
- Nada más cambia: quien hoy captura `ErrorApiWeb` sigue leyendo `status` y `codigo`.
- El spec 153 también suma `DELETE` a este archivo. Si ya está aplicado, aquí solo se
  agrega lo que falte; si los dos se ejecutan a la vez, se serializan (mismo archivo).


### 2. `src/lib/redes/catalogo.ts` — copia de `libs/redes/catalogo.js`

```ts
export type Red = 'instagram' | 'facebook' | 'threads' | 'x' | 'tiktok';
export interface ReglasRed {
  id: Red; nombre: string; proveedor: 'meta' | 'zernio';
  maxTexto: number; requiereMedio: boolean; maxImagenes: number; maxVideoSeg: number;
  linkClickeable: boolean; ayuda: string | null;
}
export const ORDEN_REDES: Red[];
export const REDES: Record<Red, ReglasRed>;
export const TOPES_REDES = { maxPublicacionesDia: 10, maxPostsXMes: 30 };
export function esRed(valor: unknown): valor is Red;
```

Los valores, idénticos a `catalogo.js:9-27` y a `config.redes` (`sonopolisWeb/config.js:36-40`).
Un comentario arriba dice que es copia y que un cambio de límite en la web obliga a cambiarlo
acá: si divergen, la app deja pasar algo que la API rechaza con 400.

### 3. `src/lib/redes/reglas.ts` — copia de `libs/redes/reglas.js` más una regla de la app

Tipos:

```ts
export type TipoMedio = 'imagen' | 'video';
export interface MedioRed { path: string; url: string; tipo: TipoMedio; ancho: number | null; alto: number | null; duracion: number | null; }
export interface ValidacionPublicacion { ok: boolean; generales: string[]; porRed: Partial<Record<Red, string[]>>; }
```

Exporta `largoParaRed`, `textoPara` y `validarPublicacion`, línea por línea iguales a
`reglas.js:23-111`: mismas constantes (23 caracteres por link en X, 2 minutos a 90 días de
adelanto, 10 imágenes, 3 segundos de video mínimo) y **los mismos mensajes en español**,
porque la API vuelve a correr la misma función y su 400 debe decir lo mismo que el
redactor.

Suma una función propia de la app, aparte, para que la copia siga siendo comparable con la
web:

- `validarEnApp(datos, ahora?)`: corre `validarPublicacion` y, si `instagram` está entre las
  redes, agrega a `porRed.instagram` el error «Instagram acepta fotos de 4:5 a 1,91:1:
  recórtala o quita Instagram» por cada imagen con `ancho / alto` fuera de `[0.8, 1.91]`
  (recalcula `ok`). En la web eso nunca pasa porque `prepararImagen` rellena con barras; en
  la app, sin esa regla la foto llegaría a Instagram y fallaría a la hora programada, sin
  nadie mirando.

### 4. `src/lib/redes/textos.ts` — copia de `libs/redes/textos.js`

- `urlDelEvento(eventoId, red)`: `${URL_WEB}/cartelera/<id>?utm_source=<red>&utm_medium=social&utm_campaign=crm`,
  con `URL_WEB` de `src/constants/web.ts` (la web usa `config.domainName`, el mismo dominio).
- `textoDelEvento(evento, red)`: recibe un `Evento` de la app (`artista`, `venueName`,
  `fecha`, `hora`, `comienzaAt`, `pais`) y arma las mismas líneas que `textos.js:22-35`:
  `🎶 artista`, `📅 fecha · hora h`, `📍 local`, y `🎟️ Entradas: <link>` o, en las redes sin
  link clickeable, `🎟️ Entradas en sonopolis.org (link en la bio)`. Si no entra en
  `maxTexto` medido con `largoParaRed`, recorta `artista` con «…» hasta que entre
  (`textos.js:46-56`).
- `formatearFechaLarga(comienzaAt, fechaCorta, pais)` **privada** de este archivo, copia de
  `sonopolisWeb/libs/fecha.js:99-110` con la zona de `PAISES[pais]` (`src/constants/paises.ts`,
  `America/Santiago` si el país no está). No va a `src/lib/fecha.ts` porque ese archivo lo
  tocan otros specs, y aquí solo la usa el anuncio.

### 5. `src/lib/redes/horario.ts` — programar en la hora del local o banda

Copia de las funciones puras de `RedactorPublicacion.js:28-82`, con la zona como parámetro:

- `aISOEnZona(fecha: 'AAAA-MM-DD', hora: 'HH:MM', zona): string | null` → ISO con el offset
  de esa zona en ese instante (`2026-10-24T21:00:00-03:00`), con las dos pasadas para
  acertar en los días de cambio de horario. Recibe fecha y hora separadas porque el
  selector de la app (`CampoFecha`/`CampoHora`, spec 144) las entrega así.
- `minimoProgramable(zona): { fecha, hora }` → ahora + 5 minutos, redondeado a los 5
  siguientes, en la zona.
- `formatearProgramada(iso, zona)` → «sábado 24 de octubre, 21:00» (`es-CL`).
- `formatearFechaHoraCorta(iso, zona)` → para el historial.

**Por qué la zona del tenant y no la del teléfono:** la API compara con `Date.now()`, pero
quien programa «el sábado a las 21» piensa en la hora de su local. Un teléfono con la zona
mal puesta (o el build web en otro país) programaría a otra hora real. La zona sale de
`PAISES[tenant.pais].zonaHoraria` (`src/constants/paises.ts:36-37`), que hoy nadie consumía.

### 6. `src/lib/redes/api.ts` — las llamadas, sin estado

Tipos (copia de los mappers de `sonopolisWeb/libs/data/redes.js:17-96`, solo los campos
que la app lee):

```ts
export type TenantType = 'venue' | 'musician';
export interface ConexionRed { id: string; red: Red; cuentaNombre: string | null; cuentaAvatar: string | null; estado: 'activa' | 'reconectar'; error: string | null; }
export type EstadoDestino = 'pendiente' | 'publicando' | 'esperando' | 'publicada' | 'fallida' | 'cancelada';
export interface DestinoRed { id: string; red: Red; estado: EstadoDestino; urlExterna: string | null; error: string | null; publicadoAt: string | null; }
export type EstadoPublicacion = 'programada' | 'publicando' | 'publicada' | 'parcial' | 'fallida' | 'cancelada';
export interface PublicacionRed { id: string; eventoId: string | null; texto: string; medios: MedioRed[]; programadaPara: string | null; estado: EstadoPublicacion; createdAt: string; destinos: DestinoRed[]; }
export interface NuevaPublicacion { texto: string; textosPorRed: Partial<Record<Red, string>>; medios: MedioRed[]; redes: Red[]; opcionesPorRed: { tiktok?: { privacidad: PrivacidadTikTok; comentarios: boolean } }; programadaPara: string | null; eventoId: string | null; }
export type PrivacidadTikTok = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
```

Funciones, todas con `llamarApiWeb` y `tenantType` en la query o el cuerpo:

- `getConexionesRedes(t)` → `{ disponibles: Red[]; conexiones: ConexionRed[] }`. Filtra
  `disponibles` con `esRed` (una red nueva en la web no rompe la app: se ignora).
- `desconectarRed(t, red)` → `DELETE /api/redes/conexiones?tenantType=&red=`.
- `getPublicacionesRedes(t)` → `PublicacionRed[]`.
- `crearPublicacionRed(t, nueva)` → `PublicacionRed`.
- `cancelarPublicacionRed(t, id)` y `reintentarDestinoRed(t, id, red)` → `PATCH` con
  `accion`; devuelven la publicación actualizada.
- `firmarSubidaRed(t, tipo, tamano)` → `{ path, token, url }`.
- `mensajeRedes(e: unknown): string` — el texto para el `Text` rojo de la pantalla:
  `ErrorApiWeb` 401 → «Tu sesión se cerró. Entra de nuevo.»; un `TypeError` de red →
  «No pudimos conectar con Sonópolis. Revisa tu conexión.»; cualquier otro `ErrorApiWeb` →
  su `codigo`, que en estas rutas ya es una frase en español («Conecta X antes de
  publicar», «Llegaste al tope de 10 publicaciones por día»).
- `esSinPro(e)`: `ErrorApiWeb` con `status === 402`. Los hooks lo usan para pasar al
  estado «parte de Sonópolis Pro» si el Pro venció con la pantalla abierta.

### 7. `src/lib/redes/medios.ts` — elegir, preparar y subir

Dependencia nueva: `npx expo install expo-image-manipulator` (fija la versión del SDK 56;
toca `package.json` y `package-lock.json`). Es un módulo nativo incluido en Expo Go; si
el proyecto usa un build propio, hay que regenerarlo (ver Riesgos).

Tipos: `ArchivoElegido { uri: string; tipo: TipoMedio; mime: string | null; ancho: number; alto: number; duracionSeg: number | null; tamano: number | null }`.

- `elegirArchivos(): Promise<ArchivoElegido[]>` — `ImagePicker.launchImageLibraryAsync`
  con `mediaTypes: ['images', 'videos']`, `allowsMultipleSelection: true`,
  `selectionLimit: 10`, `quality: 1` (se recomprime después, una sola vez) y
  `preferredAssetRepresentationMode: Compatible` (iOS entrega HEIC y HEVC convertidos, como
  en `src/lib/imagenes.ts:52`). Cancelar → `[]`. `asset.duration` viene en
  **milisegundos**: se divide por 1000, porque `validarPublicacion` compara segundos.
- `prepararImagen(uri, ancho): Promise<{ uri; ancho; alto; tamano }>` —
  `ImageManipulator.manipulate(uri)`, `resize({ width: 1440 })` solo si `ancho > 1440`,
  `renderAsync()` y `saveAsync({ format: SaveFormat.JPEG, compress })` probando 0.9, 0.8 y
  0.7 hasta pesar ≤ 8 MB (el tamaño se lee con `fetch(uri).then(r => r.blob())`). Si ni
  con 0.7 entra: «La imagen pesa demasiado para Instagram (máx. 8 MB)». Si el manipulador
  falla: «No pudimos preparar la imagen». Mismos textos que `libs/redes/medios.js:19,72`.
- `revisarVideo(archivo)`: `mime` (o la extensión `.mp4`/`.mov` si falta) debe ser
  `video/mp4` o `video/quicktime`, si no «El video tiene que ser MP4 o MOV»; tamano
  (`asset.fileSize`, o el del blob si falta) ≤ 100 MB, si no «El video pesa más de 100 MB».
- `traerFlyer(url): Promise<string>` — el flyer del evento (bucket `media`, WebP) como data
  URI: `fetch(url)` → `blob()` → `FileReader.readAsDataURL`. El manipulador solo acepta
  archivos locales o data URI (`ImageManipulator.d.ts`), no una URL remota. Después pasa
  por `prepararImagen` como cualquier foto.
- `subirArchivoFirmado({ uri, mime, path, token, onProgreso, señal })`:
  `XMLHttpRequest` `PUT` a
  `${EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/redes/${path}?token=${token}`
  con los headers `apikey: EXPO_PUBLIC_SUPABASE_ANON_KEY` y `x-upsert: false`, y un
  `FormData` con `cacheControl: '3600'` y el archivo bajo el nombre `''` — lo mismo que
  arma `uploadToSignedUrl` (`@supabase/storage-js/dist/index.cjs:756-760`). En nativo el
  archivo va como `{ uri, type: mime, name }`, que React Native lee del disco sin cargar
  100 MB en memoria; en web va el `Blob` de `fetch(uri)`. `xhr.upload.onprogress` llama
  `onProgreso(loaded / total)`. `señal.abort()` llama `xhr.abort()`. Resuelve con 2xx;
  rechaza con un `ErrorSubida { status, reintentable }`: `reintentable` si fue error de
  red, timeout o 5xx.
- `subirMedioRed(t, archivo, { onProgreso, señal })`: prepara (imagen) o revisa (video),
  pide la firma con `firmarSubidaRed(t, mime, tamano)` y sube. **Reintento automático:**
  hasta 3 intentos con la misma firma, esperando 2 s y 5 s, solo si `reintentable`. Si un
  reintento recibe el error de archivo duplicado de Storage (`statusCode: '409'`), cuenta
  como éxito: el path es un UUID nuevo de esta subida, así que el duplicado solo puede ser
  el intento anterior, que llegó aunque se perdió la respuesta. Devuelve el `MedioRed`
  (`{ path, url, tipo, ancho, alto, duracion }`), que es lo que `POST /api/redes/publicaciones`
  exige que coincida con la URL pública del path (`publicaciones/route.js:77-91`).

Las URLs de Supabase se leen de `process.env` igual que `src/lib/supabase.ts:25-26`; no se
toca ese archivo. El token de firma nunca va a un `console.*`.

### 8. `src/hooks/useTenantRedes.ts` — de quién se publica

`useTenantRedes()` → `{ estado: 'cargando' | 'sin_tenant' | 'listo'; tenantType: TenantType | null; esPro: boolean; zonaHoraria: string; panelWeb: 'local' | 'musico' | null }`.

- Rol `local` (de `useAuth`): el local de `useVenues().allVenues` con `ownerId === user.id`,
  el mismo criterio que `DashboardLocalScreen.tsx:57`. Sin local → `sin_tenant`.
- Rol `musician`: `profiles` con `id = user.id` (`maybeSingle`) mapeado con
  `mapProfileFromDB` (`src/lib/profiles.ts:21`). Sin fila → `sin_tenant`.
- Otro rol o sin sesión → `sin_tenant`, `tenantType: null`.
- `esPro` = `esPro(tenant)` de `src/lib/pro.ts` (spec 148), con la firma que deje ese spec.
  Se calcula en el cliente para decidir qué pantalla mostrar sin pedir nada a la web; el
  servidor lo vuelve a exigir (402).
- `zonaHoraria` = `PAISES[tenant.pais]?.zonaHoraria ?? 'America/Santiago'`.

**Por qué no reusa `useTenantPropio` del spec 149:** ese hook recibe el tipo ya decidido y
su `TenantCrm` no trae `pais`, que aquí hace falta para la zona horaria; además el 149 se
escribe en paralelo y depender de él encadenaría dos specs LÓGICA sin necesidad. Si más
adelante se unifican, es un spec aparte.

### 9. `src/hooks/useConexionesRedes.ts`

`useConexionesRedes(tenantType: TenantType | null, habilitado: boolean)` →
`{ cargando; error: string | null; disponibles: Red[]; conexiones: ConexionRed[]; activas: ConexionRed[]; recargar(); desconectar(red): Promise<void> }`.

- Con `habilitado = false` o sin `tenantType` no llama a nada (la pantalla no lo habilita
  sin Pro).
- `activas`: las conexiones con `estado === 'activa'` y red en `disponibles`, en
  `ORDEN_REDES` — es la lista que el redactor ofrece (`publicar/page.js:55-59`).
- `desconectar(red)` llama a la API y recarga; el error se tira para que la pantalla lo
  muestre.
- Nombre distinto de `useConexiones.ts`, que son las conexiones entre músicos (spec 131).

### 10. `src/hooks/usePublicacionesRedes.ts`

`usePublicacionesRedes(tenantType, habilitado, enFoco)` →
`{ publicaciones: PublicacionRed[] | null; error; sinPro: boolean; ocupado: boolean; recargar(); cancelar(id); reintentar(id, red) }`.

- **Recarga sola mientras haya algo en curso**, como `ListaPublicaciones.js:26-55`: cada
  10 s si alguna está `publicando`, o `programada` con `programadaPara` ya pasada (el cron
  la toma en el minuto). Con `enFoco = false` (la pantalla no está a la vista) no programa
  el siguiente intento; al volver a `true`, recarga una vez.
- `cancelar` y `reintentar` reemplazan en la lista la publicación que devuelve la API.
- Un 402 pone `sinPro = true` en vez de `error`.

`publicar` no está aquí sino en el redactor (spec 157) con `crearPublicacionRed`: el
redactor no necesita el historial cargado.

### 11. `src/hooks/useSubirMediosRedes.ts`

`useSubirMediosRedes(tenantType)` →
`{ items: ItemMedio[]; medios: MedioRed[]; subiendo: boolean; tieneVideo: boolean; aviso: string | null; agregarDeGaleria(); agregarFlyer(url); quitar(id); reintentar(id) }`.

`ItemMedio { id; tipo: TipoMedio; estado: 'preparando' | 'subiendo' | 'listo' | 'error'; progreso: number; preview: string; medio?: MedioRed; error?: string }`.

- Cada archivo empieza a subir apenas se agrega (`SubirMedios.js:60-86`): al publicar ya
  está todo arriba. Las actualizaciones de estado usan el updater de `setItems`, porque
  varias subidas terminan a la vez.
- Mezclar imágenes y video: se descarta lo que no calza y `aviso` = «Usa imágenes o un
  video, no los dos» (mismo texto que la web).
- `agregarFlyer(url)` corre una sola vez por URL (un `ref`, como `SubirMedios.js:44-57`);
  si falla, quita el item y `aviso` = «No pudimos traer el flyer del evento; súbelo a mano».
- `quitar(id)` aborta la subida en curso. Lo que ya subió queda en el bucket y lo borra la
  limpieza de 30 días de la web (`config.redes.diasConservarMedios`).
- `reintentar(id)` (item en `error`) vuelve a empezar desde la firma: si pasaron más de 2
  horas la firma vieja ya no sirve.
- `medios`: los `listo`, en el orden de la lista (el del carrusel).
- Al desmontar, aborta todas las subidas en curso.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. `grep -rn "catch {}\|catch (_) {}" src/lib/redes src/hooks/use*Redes.ts` sin resultados.
4. `textoDelEvento` y `validarPublicacion` dan lo mismo que la web. Con `npx tsx` y un
   script no commiteado: para un evento con artista de 300 caracteres, `textoDelEvento(e, 'x')`
   mide ≤ 280 con `largoParaRed` y termina en el link; `textoDelEvento(e, 'instagram')` no
   lleva `https://`; `validarPublicacion` con `programadaPara` a 1 minuto da «Programa al
   menos 2 minutos hacia adelante». Los mismos casos contra `sonopolisWeb/libs/redes/*.js`
   dan el mismo resultado.
5. `aISOEnZona('2026-10-24', '21:00', 'America/Santiago')` → `'2026-10-24T21:00:00-03:00'`
   y con `'America/Mexico_City'` → `'2026-10-24T21:00:00-06:00'`, también en un
   teléfono Android (Hermes) y no solo en Node.
6. `validarEnApp` con Instagram y una imagen de 1080×1920 agrega el error de proporción en
   `porRed.instagram` y `ok = false`; sin Instagram no lo agrega.
7. Con W-249 aplicado y un tenant Pro de prueba: `getConexionesRedes` devuelve `disponibles`
   (hoy `[]` en producción); `crearPublicacionRed` con una red no conectada tira
   `ErrorApiWeb` 400 con `codigo` «Conecta … antes de publicar».
8. Un video de 50 MB sube con `progreso` que avanza de 0 a 1; cortando la red a mitad, el
   item termina en `error` después de 3 intentos y `reintentar` lo sube completo.
9. Un PNG de 3000 px sube como JPEG de 1440 px de ancho (la ruta no firmaría un PNG).

## Fuera de alcance

- Conectar una red: depende de la cookie firmada `redes_oauth`, de la sesión por cookie de
  la web, de los callbacks registrados para `sonopolis.org` y del paso de elegir página de
  Facebook. Se hace en el panel web (spec 157 abre ese panel).
- Las barras negras de `prepararImagen` en nativo: `extent` de `expo-image-manipulator` es
  solo web. Se reemplaza por el aviso de §3.
- Reordenar los medios (la web arrastra miniaturas): el orden es el de elección.
- Editar una publicación programada: la API no lo permite (`PATCH` solo acepta `cancelar` y
  `reintentar`, `[id]/route.js:40-42`). Se cancela y se crea otra.
- Hacer Bearer-compatibles las rutas y abrir `PATCH`/`DELETE` en CORS: W-249.

## Riesgos

- `expo-image-manipulator` es un módulo nativo: en Expo Go ya viene; en un build de
  desarrollo o de tienda hay que regenerar el binario antes de probar.
- `Intl.DateTimeFormat` con `timeZone` y `formatToParts` depende del Intl de Hermes; el
  criterio 5 lo comprueba en un teléfono antes de cerrar.
- Si el W-249 no resuelve el cliente de Supabase con el Bearer también para
  `rpc('event_role_of')` (`publicaciones/route.js:106-111`), anunciar un evento desde la app
  da 403 aunque el usuario sea del equipo.

## Verificación manual

- **V-candidata 150-a:** con las variables de redes cargadas en un preview de la web y un
  local Pro de prueba con Facebook conectado, subir desde un teléfono un video MOV de
  iPhone y una foto PNG, y confirmar en el bucket `redes` que quedaron un `.mov` y un `.jpg`
  bajo `venue/<id>/`.
