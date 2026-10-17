# Spec 130 — Editar perfil de músico al nivel de la web: país, avatar, foto y disponibilidad

> Estado: propuesto (16-oct-2026)
> Capa: FRONTEND. `src/screens/EditarPerfilBandaScreen.tsx`, `src/screens/PerfilMusicoScreen.tsx`, `src/components/CampoImagen.tsx` (nuevo), `src/lib/profiles.ts`.
> Depende de: spec 129 (`useSubirImagen`), spec 095 (`src/constants/paises.ts` con `etiquetaPais`), spec 121 (agrega `pais`, `avatar` y `available` a `PerfilMusico` y a `mapProfileFromDB`).
> Alimenta: spec 134 y spec 136 (reusan `CampoImagen`).
> Hermano en la web: `app/(private)/musico/perfil/editar/FormPerfilMusico.js` (W-037, W-202, W-203), `app/(private)/musico/DisponibilidadToggle.js` (W-031, W-034), `libs/data/profiles.js:54-62`.

> **En una frase:** el formulario de perfil del músico suma país (de `paises_cobro`),
> avatar y foto subidos desde la galería, y el panel del músico suma el interruptor
> «Disponible este fin de semana» que escribe `profiles.available`.

## Contexto

Lo que la web tiene y la app no:

| Campo | Web | App hoy |
|---|---|---|
| País | `<select>` con los países de `paises_cobro` (`FormPerfilMusico.js:139-156`, `perfil/editar/page.js:20-27`) | No existe. `mapProfileFromDB` (`src/lib/profiles.ts:19`) no lee `pais` |
| Avatar (logo cuadrado) | `ImageUpload` a `perfiles/<id>` (`FormPerfilMusico.js:73-89`) | No existe. `profiles.avatar` existe desde el spec 085 y la app nunca lo lee |
| Foto | `ImageUpload` (`FormPerfilMusico.js:91-108`) | `TextInput` «Foto (URL)» (`EditarPerfilBandaScreen.tsx:226-227`) |
| Disponibilidad | Interruptor en el panel `/musico` (`DisponibilidadToggle.js`), escribe `available` aparte (`profiles.js:54-62`) | No existe |

Datos que ya están en la base y mandan:

- **La columna es `profiles.available`** (`boolean NOT NULL DEFAULT false`, migración
  `20260820183953_spec_051_disponibilidad_y_solicitudes.sql:4-5`). No existe
  `profiles.disponible`.
- `profiles.pais` es `NOT NULL DEFAULT 'CL'` con FK a `paises_cobro(pais)` (migración
  `20261005210000_spec_106_pais_del_perfil.sql:13-28`). Un país fuera del catálogo lo rechaza
  la base. El `DEFAULT` existe justamente para que un `upsert` sin `pais` no falle.
- `paises_cobro` es de lectura pública (policy `paises_cobro_select_publico`, spec 100). Hoy
  tiene `CL` y `MX`.

## Diseño

### 1. Escritura del perfil (`src/lib/profiles.ts`)

El spec 121 ya deja `pais?`, `avatar?` y `available?` en `PerfilMusico` y los lee en
`mapProfileFromDB`, y a propósito no toca `mapProfileToDB` (le deja la escritura a este
spec). Este spec **no** toca `src/types/index.ts` ni `mapProfileFromDB`.

`mapProfileToDB` suma:
- `avatar: perfil.avatar || null`.
- `pais` **solo si viene**: `...(perfil.pais ? { pais: perfil.pais } : {})`. Así
  `handleCrearPerfil` (`PerfilMusicoScreen.tsx:117`), que no conoce el país, no manda
  `pais: null` (rompería el `NOT NULL`) y deja actuar al `DEFAULT 'CL'`.
- `available` **no** entra al mapper. Igual que en la web (`profiles.js:51-53`), se escribe
  aparte desde el interruptor. Si entrara, guardar el formulario pisaría la disponibilidad
  con el valor que tenía el formulario al cargarse.

Nueva función, mismo molde que `setDisponibilidad` de la web:

```ts
export async function setDisponibilidad(userId: string, available: boolean): Promise<void>
// supabase.from('profiles').update({ available }).eq('id', userId).select('id')
// error → throw; 0 filas → throw new Error('No se pudo actualizar tu disponibilidad.')
```

El chequeo de 0 filas importa: un `update` que RLS filtra no devuelve error, devuelve cero
filas, y sin el chequeo el interruptor mostraría un cambio que no se guardó.

### 2. `src/components/CampoImagen.tsx` (nuevo) — el campo de imagen reutilizable

Equivalente móvil de `ImageUpload.js`. Lo reusan 134 (local) y 136 (flyer).

```ts
interface CampoImagenProps {
  carpeta: CarpetaMedia;          // de src/lib/imagenes.ts (spec 129)
  id: string | undefined;
  valor: string;                  // URL actual ('' si no hay)
  onCambiar: (url: string) => void;
  aspecto?: [number, number];     // [1, 1] para avatar; sin recorte si se omite
  ayuda?: string;                 // texto bajo la etiqueta
}
```

- Muestra la imagen actual (96×96, `borderRadius.sm`) si `valor` no está vacío.
- Botón «Subir imagen» (o «Cambiar imagen» si hay `valor`). Mientras `subiendo`, muestra
  `ActivityIndicator` y queda deshabilitado.
- Al tocarlo: `const url = await elegirYSubir({ aspecto })`; si `url` → `onCambiar(url)`.
  Error → `Alert.alert('No se pudo subir la imagen', err.message)`. Nunca un fallo silencioso.
- Debajo, un `TextInput` chico «O pega una URL» con `valor`/`onCambiar`: el mismo respaldo
  que la web (`ImageUpload.js:94-101`) para cuando Storage falle.
- Estilos con `StyleSheet.create` y tokens de `src/theme`.

La imagen se **sube** al elegirla, pero queda **ligada al perfil** recién al tocar «Guardar
cambios», igual que en la web. Si el usuario sale sin guardar, el archivo queda huérfano en
el bucket (mismo comportamiento que la web; fuera de alcance limpiarlo).

### 3. `EditarPerfilBandaScreen.tsx`

- Estado nuevo: `pais`, `avatar`, `paises: string[]`. Al cargar el perfil:
  `setPais(p.pais ?? '')`, `setAvatar(p.avatar ?? '')`.
- Cargar los países en el mismo `cargarPerfil`:
  `supabase.from('paises_cobro').select('pais')`. Ordenar por `nombrePais` en español. Si la
  consulta falla, `paises = p.pais ? [p.pais] : []`: el músico puede guardar el resto sin
  perder su país (mismo respaldo que `perfil/editar/page.js:20-27`). El fallo de esta lectura
  **no** activa `cargaFallida`.
- En la tarjeta «Identidad», en este orden: Nombre, **Avatar (logo)** con `CampoImagen`
  (`carpeta="perfiles"`, `id={user.id}`, `aspecto={[1, 1]}`, ayuda «Aparece en el feed y donde
  se te vea en miniatura — sube tu logo o algo cuadrado.»), Tipo de proyecto, Géneros
  (sin cambios, ya usa `GeneroPicker`), Bio, **Foto** con `CampoImagen` (`carpeta="perfiles"`,
  `id={user.id}`, sin aspecto, ayuda «La foto grande de tu ficha pública — banda, escenario,
  lo que quieras mostrar en tamaño completo.»). Se borra el `TextInput` «Foto (URL)».
- En la tarjeta «Con qué decide un local», antes de Ciudad: **País** como chips (mismo estilo
  `chip`/`chipActivo` de Tipo de proyecto), uno por código de `paises`, con
  `etiquetaPais(codigo)`. Sin opción vacía.
- `handleGuardar` manda `pais` y `avatar` a `mapProfileToDB`. Si `pais` está vacío → no se
  manda (cae al mapper condicional).

### 4. `PerfilMusicoScreen.tsx` — el interruptor de disponibilidad

Tarjeta nueva entre la tarjeta de identidad y «Resumen», **solo si `!esMock`**:

- `Switch` de React Native con valor `perfil.available ?? false`.
- Título «Disponible este fin de semana». Subtítulo según el valor:
  `true` → «Los locales pueden proponerte fechas»; `false` → «No apareces en la búsqueda de
  locales» (textos de `DisponibilidadToggle.js:52-56`).
- Fondo de la tarjeta `colors.accentLight` cuando está activo, `colors.cardBackground` si no.
- Optimista: al cambiar, actualiza `perfil` en el estado, llama `setDisponibilidad(user.id, valor)`;
  si lanza, revierte y `Alert.alert('No se pudo actualizar', err.message)`.

La miniatura de la tarjeta de identidad usa `perfil.avatar ?? perfil.foto` (hoy solo `foto`,
línea ~165).

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio.
2. Cambiar el país del perfil a México y guardar → `select pais from profiles where id = <yo>` da `MX`.
3. Subir avatar y foto desde la galería y guardar → `profiles.avatar` y `profiles.foto` quedan con URLs `…/storage/v1/object/public/media/perfiles/<mi id>/…`.
4. Prender el interruptor → `profiles.available = true` sin tocar «Guardar»; apagarlo → `false`.
5. Con el interruptor prendido, editar la bio y guardar → `available` sigue en `true` (el formulario no lo pisa).
6. Si la escritura del interruptor falla (p. ej. sin red), el interruptor vuelve a su valor anterior y aparece la alerta.
7. «Crear mi perfil» (`handleCrearPerfil`) sobre una cuenta sin fila sigue funcionando y la fila nace con `pais = 'CL'`.
8. `rg -n "Foto \(URL\)" src/screens/EditarPerfilBandaScreen.tsx` devuelve cero.
9. `npx expo export --platform web` termina sin error.

## Fuera de alcance

- Filtrar «Músicos disponibles» del panel del local por `available`: hoy la lista de
  `DashboardLocalScreen.tsx:69-86` muestra a todos. Es otro spec.
- `ciudad` sigue siendo texto libre (igual que en la web).
- Que el resto de la app lea `pais`/`avatar` (directorio y ficha pública): specs 121 y 122.
- Limpiar del bucket las imágenes reemplazadas o no guardadas.

## Verificación manual

- **V-candidata 1:** en un teléfono real, subir avatar recortado 1:1 y foto; guardar; volver al panel → la miniatura muestra el avatar.
- **V-candidata 2:** prender la disponibilidad en la app y abrir `/musico` en la web → el interruptor de la web también aparece prendido.
- **V-candidata 3:** con `paises_cobro` inaccesible (modo avión al abrir la pantalla tras cargar el perfil), el selector muestra solo el país actual y guardar no lo borra.
