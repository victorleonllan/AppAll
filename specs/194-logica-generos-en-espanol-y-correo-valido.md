# Spec 194 — Géneros en español en el listado, y a qué campo va cada error de cuenta

> Estado: aplicado (28-nov-2026) — `tsc --noEmit` limpio fuera de `supabase/functions`; criterios 2, 3 y 4 verificados con `node` (190 géneros, idénticos a la web); 5 por lectura del diff. Sin probar contra Supabase ni en dispositivo
> Capa: LÓGICA. `src/constants/generos.ts`, `src/lib/validacionAuth.ts` (nuevo), `src/context/AuthContext.tsx`.
> Depende de: spec 054 (listado cerrado de géneros), spec 128 (`src/lib/contrasena.ts`: `mensajeDeErrorAuth`, `MENSAJE_CUENTA_EXISTENTE`).
> Alimenta: spec 203 (FRONTEND).
> Hermano en la web: `libs/constants.js` (W-284) y `libs/contrasena.js` (W-323).

> **En una frase:** el listado cerrado de géneros de la app suma los mismos 16 géneros en
> español que sumó la web, y la app gana una regla de formato de correo y un mapa de
> «error de Supabase → campo» para que el spec 203 muestre cada error bajo su campo.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0
después de esta orquestación.»

Dos brechas de la web que la app no tiene:

- **W-284 (18-nov-2026).** Pedido original: «al crear evento no se ve el listado de estilos
  musicales que tengo en el filtro de la cartelera». La web sumó 16 géneros en español a
  `GENEROS_MUSICALES` (de 174 a 190). Su propio spec dejó anotado que AppAll debe seguir en
  sync con un spec propio: es este.
- **W-323 (21-nov-2026).** La web dejó de mostrar los errores de cuenta en un aviso
  flotante y los puso bajo el campo que los causó. En la app es peor: `LoginScreen` y
  `RegisterScreen` usan `Alert.alert`, que en el build web de Expo no hace nada
  (`src/lib/confirm.ts`), así que quien se equivoca de contraseña en la web de la app no ve
  ningún error. Además `signIn` y `signUp` de `AuthContext` devuelven `error.message` de
  Supabase sin traducir (en inglés) y pierden `error.code`, que es lo único que dice a qué
  campo va el error.

## Decisión

### 1. `src/constants/generos.ts` — 16 géneros nuevos (W-284)

**Este spec suma, no reescribe el 054.** La decisión del 054 (constante TS, sin `CHECK` en
la base, aplicada desde la UI hacia adelante) no cambia; solo crece la lista.

Se insertan en `GENEROS_MUSICALES`, en el mismo lugar que tienen en
`sonopolisWeb/libs/constants.js` (el resto del arreglo ya está en el mismo orden que la web):

| Nuevo | Va justo después de |
|---|---|
| `'Baladas'` | `'Baile Funk'` |
| `'Boleros'` | `'Blues'` |
| `'Electro Pop'` | `'Electro'` |
| `'Hard Rock'` | `'Hard Dance'` |
| `'J-Rock'` | `'Industrial'` |
| `'Metal'`, `'Metalcore'` | `'Merengue'` |
| `'Pop Latino'`, `'Pop Punk'`, `'Pop Urbano'`, `'Pop-Rock'`, `'Post Rock'` | `'Pop in Spanish'` |
| `'Rancheras'` | `'Rancheira'` |
| `'Rock Alternativo'` | `'Rock'` |
| `'Romántico'` | `'Rockabilly'` |
| `'Urbano'` | `'Urban Cowboy'` |

El listado pasa de 174 a 190. Lo que la web dejó fuera (no son música, son un formato, solo
cambia la tilde, o combinan dos que ya están) queda fuera igual, por los mismos motivos: ver
la sección «Decisión» de W-284.

El comentario de cabecera del archivo cambia en dos líneas:
- «174 géneros…» pasa a «190 géneros: los 174 de OffStep (spec 054) y 16 en español del
  filtro de la cartelera (spec 194, hermano de W-284), en el mismo orden que la web.»
- «Agregar/quitar un género: addendum con fecha en el spec 054…» pasa a «Agregar/quitar un
  género: un spec nuevo que lo declare (como el 194), nunca edición silenciosa de este
  archivo.» (la regla vigente de specs inmutables pide spec nuevo para un requerimiento
  nuevo, no addendum).

Nada más cambia: `GeneroPicker` y `buscarGeneros` (`src/lib/generos.ts`) leen la constante
y reciben los 16 solos. `buscarGeneros` ya ignora tildes, así que «romantico» encuentra
«Romántico».

### 2. `src/lib/validacionAuth.ts` (nuevo) — puro, sin imports (W-323)

Va en un archivo nuevo y no en `src/lib/contrasena.ts` porque ese importa el cliente de
Supabase (`cambiarContrasena`), que arrastra React Native: así no se podría probar con
`node`. En la web las dos funciones viven en `libs/contrasena.js` porque ahí ese archivo no
tiene imports. Comentario de cabecera de una línea que cite este spec y W-323.

```ts
/** A qué campo del formulario de cuenta pertenece un error. `null` = error de la cuenta, no de un campo. */
export type CampoAuth = 'email' | 'password' | null;

/** `true` si el correo tiene forma válida; si no, el mensaje para mostrar bajo el campo. */
export function validarCorreo(v: string | null | undefined): true | string;

/** El campo al que va un error de Supabase Auth, por `error.code`. */
export function campoDeErrorAuth(error: { code?: string } | null | undefined): CampoAuth;
```

`validarCorreo`, copia literal de la web:
- Recorta espacios antes de mirar.
- Vacío → «Falta el correo».
- Válido si calza con `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`.
- Si no → «Ingresa un correo válido, por ejemplo nombre@gmail.com».

Es una ayuda para escribir, no una garantía: el que decide sigue siendo Supabase
(`email_address_invalid` sigue traducido en `mensajeDeErrorAuth`).

`campoDeErrorAuth`, misma tabla que la web:

| `error.code` | Campo |
|---|---|
| `email_address_invalid` | `'email'` |
| `weak_password`, `invalid_credentials`, `same_password` | `'password'` |
| cualquier otro, o `error` nulo | `null` |

`invalid_credentials` va a la contraseña porque Supabase no dice cuál de los dos falló; el
texto («Correo o contraseña incorrectos») ya lo aclara.

### 3. `src/context/AuthContext.tsx` — entrar y crear cuenta devuelven mensaje y campo

Dos métodos nuevos en `AuthState` y en el `value` del provider:

```ts
export interface ErrorAuth { mensaje: string; campo: CampoAuth }

entrar: (email: string, password: string) => Promise<ErrorAuth | null>;
crearCuenta: (
  email: string, password: string, role: UserRole, nombre: string
) => Promise<{ error: ErrorAuth | null; sesion: boolean }>;
```

- `entrar` hace lo mismo que `signIn` (`signInWithPassword`) y, con error, devuelve
  `{ mensaje: mensajeDeErrorAuth(error, password), campo: campoDeErrorAuth(error) }`.
- `crearCuenta` hace lo mismo que `signUp` (mismas `options.data: { role, nombre }`). Con
  error, igual que `entrar`. Sin error:
  - Si `data.user?.identities` es un arreglo vacío, el correo ya tenía cuenta (Supabase con
    confirmación de correo activa responde así, sin error y sin mandar nada; W-227 en la
    web): devuelve `{ error: { mensaje: MENSAJE_CUENTA_EXISTENTE, campo: null }, sesion: false }`.
    Sin esto la pantalla diría «revisa tu correo» por un correo que nunca llega.
    `MENSAJE_CUENTA_EXISTENTE` ya existe en `src/lib/contrasena.ts` y hoy nadie lo usa.
  - Si no: `{ error: null, sesion: Boolean(data.session) }`.
- `ErrorAuth` se exporta desde `AuthContext.tsx`; `CampoAuth` se importa de
  `src/lib/validacionAuth.ts`.

`signIn` y `signUp` **no cambian de firma ni de comportamiento**: sus únicos llamadores
(`LoginScreen`, `RegisterScreen`) pasan a los métodos nuevos en el spec 203, y cambiarles el
tipo de retorno aquí rompería `npx tsc` entre los dos commits. Quedan con un comentario
`/** @deprecated Spec 194 — usar entrar / crearCuenta; sin llamadores desde el spec 203. */`.
Quitarlos cuando no tengan llamadores es deuda: anotarla en `PENDIENTES.md` al cerrar.

`signInWithGoogle`, `pedirEnlaceRecuperacion` y `signOut` no cambian.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. Géneros, con `node` (Node 26 quita los tipos sin flags), leyendo el arreglo de
   `src/constants/generos.ts` y el de `sonopolisWeb/libs/constants.js`:
   - tiene 190 valores, sin duplicados, y contiene los 16 nuevos;
   - es idéntico, en orden, al `GENEROS_MUSICALES` de la web;
   - filtrar por `'metal'` sin distinguir mayúsculas devuelve `Heavy metal`, `Metal` y `Metalcore`.
3. `validacionAuth.ts` con `node` (`import('./src/lib/validacionAuth.ts')`):
   - `validarCorreo('ana.rojas@gmail.com') === true` y `validarCorreo('  ana@x.cl  ') === true`;
   - `'ana.rojas@gmail'`, `'ana@'`, `'@gmail.com'`, `'ana rojas@gmail.com'`, `'a@b@c.cl'` →
     «Ingresa un correo válido, por ejemplo nombre@gmail.com»;
   - `''` → «Falta el correo»;
   - `campoDeErrorAuth` con cada código de la tabla, con un código desconocido y con `null`.
4. `grep -n "^import" src/lib/validacionAuth.ts` no devuelve nada.
5. Lectura del código: `signIn` y `signUp` siguen idénticos; `entrar` y `crearCuenta`
   están en `AuthState` y en el `value` del provider.
6. `git diff --stat` del commit toca solo los tres archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Crear o editar un evento y un perfil de banda: en el selector de géneros aparecen
  «Metal», «Pop Latino», «Urbano», y la búsqueda «romantico» encuentra «Romántico».
- (Se prueba con las pantallas del 203) Crear cuenta con un correo que ya existe: aparece
  el mensaje de cuenta existente y no «revisa tu correo».

## Fuera de alcance

- Usar `validarCorreo` y `campoDeErrorAuth` en pantalla: spec 203.
- Normalizar los géneros de eventos o perfiles ya guardados, o que la cartelera filtre con
  el listado cerrado (igual que W-284).
- Cualquier cambio en cómo se autentica (Google, enlace de recuperación, reglas de contraseña).
