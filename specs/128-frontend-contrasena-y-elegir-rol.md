# Spec 128 — Perfil: cambiar la contraseña, y elegir rol al entrar sin uno

> Estado: propuesto (16-oct-2026)
> Capa: FRONTEND. `src/screens/CambiarContrasenaScreen.tsx` (reemplaza el placeholder del spec 114), `src/screens/ElegirRolScreen.tsx` (reemplaza el placeholder del spec 114), `src/components/FormElegirRol.tsx` (nuevo), `src/components/GuardaRol.tsx` (nuevo), `src/lib/contrasena.ts` (nuevo), `src/lib/rol.ts` (nuevo), `App.tsx`, `src/screens/PerfilScreen.tsx`, `src/screens/PerfilMusicoScreen.tsx`, `src/screens/DashboardLocalScreen.tsx`.
> Depende de: spec 114, spec 142
> Alimenta: —
> Hermano en la web: W-227/W-228 (`sonopolisWeb/libs/contrasena.js`, `app/(private)/perfil/contrasena/FormContrasena.js`), W-013/W-014/W-205 (`app/(auth)/quien-eres/QuienEresForm.js`, `app/auth/callback/route.js:34`).

> **En una frase:** cualquier cuenta puede poner o cambiar su contraseña desde su perfil
> (`auth.updateUser`, con la regla y los errores en español de la web), y una sesión sin
> rol —la que deja entrar con Google— no puede usar la app hasta elegir fan, músico o
> local (`set_my_role`).

## Contexto

### Cómo se lee el rol hoy

La app decide el rol con `session.user.user_metadata.role`
(`src/context/AuthContext.tsx:33` y `:40`), **no** con `profiles.role`. La web hace lo
mismo (`roleOf` en `sonopolisWeb/libs/auth.js:31`). Las dos fuentes pueden divergir:
`handle_new_user()` (spec 106) escribe `profiles.role = 'fan'` cuando los metadatos no
traen rol, pero `user_metadata.role` queda vacío.

Eso pasa en dos casos reales:

- **Google** (`AuthContext.signInWithGoogle`, spec 042): OAuth no manda `data`, así que la
  cuenta nueva nace con `user_metadata.role` vacío.
- **Enlace por correo pedido en `/signin` de la web** (W-228, «sin `role` en `data`, a
  propósito»): la persona elige su rol en `/quien-eres`; si nunca lo hizo y entra a la app,
  llega sin rol.

En la web, `auth/callback/route.js:34` manda toda sesión sin rol a `/quien-eres` antes de
dejarla pasar. En la app no hay nada: `getThirdTab` (`src/navigation/index.tsx:18-23`)
trata `null` como «Perfil», y esa cuenta queda como fan sin que nadie se lo haya
preguntado. Un local que entró con Google nunca ve su panel.

### `set_my_role` ya hace todo en la base

`public.set_my_role(p_role)` (`supabase/migrations/20260815232514_spec_046_…sql:73`):
exige sesión, acepta solo `fan`, `musician` o `local`, y actualiza **las dos** fuentes,
`profiles.role` y `auth.users.raw_user_meta_data.role`. Solo `authenticated` puede
ejecutarla. Lo que no hace es cambiar el JWT que ya tiene el cliente: hasta el próximo
refresh, la sesión sigue diciendo «sin rol». Por eso la web llama
`supabase.auth.refreshSession()` justo después (`QuienEresForm.js`). En la app, ese
refresh dispara `onAuthStateChange` (`TOKEN_REFRESHED`), y `AuthContext` ya actualiza
`role` desde los metadatos nuevos (`AuthContext.tsx:38-41`). **No hace falta tocar
`AuthContext`.**

### Relación con el spec 048

El 048 (propuesto, sin implementar) cambia los literales de rol de la app de
`'cafe'`/`'public'` a `'local'`/`'fan'` en `AuthContext`, `navigation/index.tsx`,
`AuthScreen` y `RegisterScreen` (su sección 1). Este spec lo **requiere**: `set_my_role`
rechaza `'cafe'` y escribe `'local'`, y con el código de hoy un usuario con
`role === 'local'` no cae en `MiLocalStack` (`index.tsx:21` compara contra `'cafe'`), sino en
`PerfilScreen`. Elegir «local» sin el 048 dejaría a la persona en la pestaña equivocada.

El 048 dejó fuera de alcance esta pantalla («`set_my_role` / pantalla "¿quién eres?" …
AppAll no lo necesita hoy porque su único login sin rol previo (Google, spec 042) sigue
bloqueado por credenciales»). Esa premisa ya no vale: el proveedor Google de Supabase está
activo porque la web lo usa todos los días, y la app comparte el mismo proyecto. Este spec
cubre ese hueco **sin editar el 048**. Lo único que toma del 048 es la sección 1; sus
secciones 2 y 4 (guest checkout y seguir) no son requisito.

### Contraseña

La app no tiene forma de poner ni cambiar la contraseña. Una cuenta que nació comprando
(enlace por correo, W-209) o con Google no tiene contraseña y no puede entrar con
correo + contraseña en `LoginScreen`. En la web, W-228 lo resolvió con
`/perfil/contrasena` y `updateUser({ password })`, con la regla y los errores en español
de W-227 (Javiera recibió cinco veces el error de contraseña en inglés y abandonó).

### Por qué este spec FRONTEND llama a Supabase

`src/lib/rol.ts` y `src/lib/contrasena.ts` envuelven una sola llamada cada uno
(`rpc('set_my_role')` + `refreshSession()`, y `auth.updateUser`). No tienen regla de negocio
propia: la regla vive en Postgres y en Supabase Auth. Es el mismo criterio con el que W-228
fue FRONTEND en la web.

## Diseño

### 1. `src/lib/contrasena.ts` (nuevo)

Copia de `sonopolisWeb/libs/contrasena.js` (W-227/W-228), en TypeScript, mismos textos:

- `REGLA_CONTRASENA`: 6 caracteres, una minúscula `[a-z]`, una mayúscula `[A-Z]`, un número,
  un símbolo (misma expresión regular). Comentario obligatorio: es copia de la regla del
  panel de Supabase (Auth → Policies) al 6-oct-2026; **si se cambia allá, hay que cambiarla
  aquí y en la web**. Solo cuentan letras sin acento (Supabase no acepta ñ ni á como
  minúscula).
- `faltaEnContrasena(p: string): string[]`.
- `mensajeDeErrorAuth(error: { code?: string; message?: string } | null, password = ''): string`,
  con los mismos casos que la web: `weak_password`, `invalid_credentials`,
  `email_not_confirmed`, `user_already_exists`, `over_email_send_rate_limit` /
  `over_request_rate_limit`, `email_address_invalid`, `same_password`. Para
  `reauthentication_needed` el texto cambia, porque la app no tiene la página de vuelta del
  enlace: «Por seguridad, cierra sesión y vuelve a entrar antes de cambiarla.». Lo que no
  tiene traducción viaja tal cual (`error.message`).
- `cambiarContrasena(password: string)`: `supabase.auth.updateUser({ password })` y
  devuelve `{ error }`.

### 2. `src/screens/CambiarContrasenaScreen.tsx` (reemplaza el placeholder)

- Título «Contraseña de tu cuenta» y debajo el correo de la sesión (`user.email`).
- Campo «Contraseña nueva» (`secureTextEntry`, `autoComplete="new-password"`,
  `textContentType="newPassword"`, `autoCapitalize="none"`) con un botón «Mostrar» /
  «Ocultar». Hay un solo campo, como en la web; el botón «Mostrar» reemplaza al campo de
  confirmación, porque en un teclado de teléfono el error de tipeo es más probable.
- Debajo, la lista de requisitos de `REGLA_CONTRASENA`, cada uno marcado con ✓
  (`colors.success`) o ○ (`colors.muted`) mientras se escribe.
- Botón «Guardar contraseña», deshabilitado mientras `faltaEnContrasena(p).length > 0` o
  mientras envía («Un momento…»).
- Error: texto de `mensajeDeErrorAuth(error, password)` en `colors.danger` bajo el botón.
  Si el código es `reauthentication_needed`, aparece además un botón «Cerrar sesión» que
  llama `signOut` de `useAuth()`.
- Éxito: la pantalla se reemplaza por «Listo. Desde ahora puedes entrar con tu correo y esta
  contraseña.» y un botón «Volver» (`navigation.goBack()`).
- Sin sesión: «Inicia sesión para cambiar tu contraseña.».

**Accesos** (botón de texto «🔑 Contraseña de tu cuenta», justo arriba de cada
«Cerrar sesión» que exista hoy, navegando a `CambiarContrasena` con el tipo que exporta el
spec 114):

- `src/screens/PerfilScreen.tsx` (fan y sesión sin rol).
- `src/screens/PerfilMusicoScreen.tsx`, en los dos lugares donde está «Cerrar sesión»
  (`:152` y `:249`).
- `src/screens/DashboardLocalScreen.tsx`, en los dos lugares donde está «Cerrar sesión»
  (`:131` y `:236`).

Cambios aditivos: no se mueve ni se reescribe nada más de esas pantallas, porque otros specs
de esta fase también las editan.

### 3. `src/lib/rol.ts` (nuevo)

```ts
export type RolElegible = 'fan' | 'musician' | 'local';
export async function elegirMiRol(rol: RolElegible): Promise<string | null>;
```

1. `supabase.rpc('set_my_role', { p_role: rol })`. Si falla, devuelve el mensaje
   (`no_autenticado` → «Tu sesión se cerró. Entra de nuevo.»; lo demás, `error.message`).
2. `supabase.auth.refreshSession()`. Si falla, devuelve «Tu rol quedó guardado, pero no
   pudimos actualizar la sesión. Cierra sesión y vuelve a entrar.». El rol ya está en la
   base, así que entrar de nuevo lo trae.
3. `null` si todo salió bien.

**Sin país.** La web, en la primera elección, corrige `profiles.pais` con el país del
entorno (W-205), porque Google no deja mandarlo al crear la cuenta. La app no tiene un país
activo (lo traería el spec 096, que no es requisito) y `profiles.pais` ya nace `CL` por
defecto (spec 106). Queda como está.

### 4. `src/components/FormElegirRol.tsx` (nuevo)

Props: `{ onListo?: () => void }`. No usa `useNavigation`, para poder montarse fuera de un
navegador (lo necesita `GuardaRol`).

- **Fila de cuenta**, primero de todo: el correo de la sesión (y `full_name` de los
  metadatos si existe, `nombre · correo`) y a la derecha «¿No eres tú?», que llama
  `signOut()`. Va primero porque quien tiene varias cuentas de Google abiertas no sabe con
  cuál entró hasta verla escrita (rediseño de `/quien-eres`, 24-ago-2026).
- Título «¿Quién eres?». Texto: «Falta un dato para terminar de entrar. Elige cómo vas a
  usar Sonópolis: define lo que puedes hacer en la app. Por ahora no se puede cambiar
  después desde la app.». La última frase se dice por escrito porque no hay forma de
  deshacerlo desde la interfaz (W-014, opción C fuera de alcance).
- Tres tarjetas tocables, con los textos de `DETALLE_ROL` de la web:

  | Rol | Título | Descripción | Habilita |
  |---|---|---|---|
  | `fan` | 🎟 Fan | «Sigo bandas, compro entradas y voy a shows.» | Seguir músicos y locales · Comprar entradas · Guardar tus entradas con QR |
  | `musician` | 🎸 Músico | «Tengo un proyecto musical: banda, solista, DJ o colectivo.» | Perfil público con tu música · Publicar fechas y vender entradas · Recibir propuestas de locales |
  | `local` | 📍 Local | «Tengo un bar, café, sala o centro cultural.» | Ficha del local en el directorio · Programar y publicar fechas · Recibir solicitudes de músicos |

- Tocar una tarjeta llama `elegirMiRol(rol)`. Mientras envía, esa tarjeta muestra
  `ActivityIndicator` y las otras quedan deshabilitadas.
- Error: un recuadro con el mensaje (`colors.danger`) y «Reintentar», que vuelve a habilitar
  las tarjetas.
- Éxito: `onListo?.()`. No navega por su cuenta: al refrescarse la sesión, `role` cambia en
  `AuthContext` y `getThirdTab` cambia sola la tercera pestaña (músico → `MusicoStack`,
  local → `MiLocalStack`, fan → `PerfilScreen`).

### 5. `src/components/GuardaRol.tsx` (nuevo) y `App.tsx`

```tsx
export default function GuardaRol() {
  const { session, role, loading } = useAuth();
  const visible = !loading && !!session && role === null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => {}}>
      <SafeAreaView …><ScrollView …><FormElegirRol /></ScrollView></SafeAreaView>
    </Modal>
  );
}
```

En `App.tsx` se monta `<GuardaRol />` dentro de `<EventosProvider>`, después de
`<AppNavigator />`. Es el único cambio en `App.tsx`.

**Por qué un `Modal` global y no una pantalla dentro de la navegación:**

- La app no puede tocar `src/navigation/index.tsx` en esta fase (lo tiene el spec 114), y
  ahí es donde la web pone la guarda (el callback).
- Una guarda dentro de `PerfilScreen` no alcanza. Al entrar desde la pestaña «Sonópolis»
  (`AuthScreen`), esa pestaña desaparece y aparece «Perfil»; el tab navigator, al perder la
  ruta enfocada, vuelve a la primera pestaña (Cartelera). La persona nunca abriría
  `PerfilScreen` y la guarda nunca se dispararía.
- El `Modal` tapa toda la app mientras `role === null`, venga de donde venga la sesión
  (Google, enlace de la web, contraseña), que es lo que hace la web.
- `onRequestClose` vacío: el botón atrás de Android no cierra la guarda. Las únicas
  salidas son elegir un rol o «¿No eres tú?» (cerrar sesión), igual que en
  `/quien-eres`.
- `react-native-web` implementa `Modal`, así que la guarda funciona también en Expo web.

Cuentas con rol viejo (`'public'`, `'cafe'`) no son `null` y no ven la guarda.

### 6. `src/screens/ElegirRolScreen.tsx` (reemplaza el placeholder)

La ruta `ElegirRol` del 114 queda para llegar a mano (deep link o navegación explícita):

- Sin sesión: «Inicia sesión para elegir cómo usas Sonópolis.».
- Con `role === null`: `<FormElegirRol onListo={() => navigation.goBack()} />`. En la
  práctica la guarda global ya lo tapa; la ruta no se rompe si alguien llega igual.
- Con rol ya elegido: «Tu cuenta ya está configurada como {fan|músico|local}. Cambiar de rol
  todavía no se puede desde la app.» y un botón «Volver». No se ofrece el formulario:
  `set_my_role` dejaría cambiar el rol, pero eso reacomoda la tercera pestaña y no tiene
  vuelta atrás desde la interfaz, y la web tampoco lo ofrece.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio.
2. `npm run build:web` termina sin errores.
3. `git diff --stat` toca solo los archivos de la línea Capa; `src/navigation/` y
   `src/context/AuthContext.tsx` sin cambios.
4. Con una cuenta de Google nueva en la app (Expo Go o build): al volver del login aparece
   «¿Quién eres?» a pantalla completa, en cualquier pestaña, y el botón atrás de Android no
   la cierra.
5. Elegir «Local» deja `profiles.role = 'local'` y `raw_user_meta_data.role = 'local'`
   (consulta SQL de solo lectura), cierra la guarda y la tercera pestaña pasa a ser
   «Mi Local» sin reiniciar la app.
6. «¿No eres tú?» cierra la sesión y la guarda desaparece.
7. Una cuenta con rol ya guardado no ve la guarda; la ruta `ElegirRol` le muestra el
   aviso de rol ya configurado.
8. En «Contraseña de tu cuenta», `abcdef` deja el botón deshabilitado y marca lo que falta;
   `Prueba128!` se guarda; después, `LoginScreen` entra con correo + esa contraseña.
9. Guardar la misma contraseña otra vez muestra «Esa ya es tu contraseña. Elige una
   distinta».
10. El acceso «Contraseña de tu cuenta» aparece en `PerfilScreen`, en `PerfilMusicoScreen`
    (las dos variantes) y en `DashboardLocalScreen` (las dos variantes).

## Fuera de alcance

- Las secciones 2 a 4 del spec 048 (guest checkout, seguir, panel del fan).
- Cambiar de rol una cuenta que ya tiene uno (W-014, opción C).
- Corregir `profiles.pais` al elegir rol (ver §3).
- Recuperar la contraseña sin sesión («¿Olvidaste tu contraseña?» en `LoginScreen`): en la
  web usa el enlace por correo de W-209 con vuelta a una página web; en la app pide decidir
  el deep link de vuelta. Spec aparte.
- Usar `mensajeDeErrorAuth` en `LoginScreen`/`RegisterScreen` (hoy muestran el error de
  Supabase en inglés). El helper queda listo para un spec aparte.

## Verificación manual (V# candidatas)

- **V-128a** — `reauthentication_needed`: con «Secure password change» activo en Supabase y
  una sesión de más de 24 h, cambiar la contraseña debe mostrar el aviso y el botón «Cerrar
  sesión». Solo se prueba esperando, como en W-228.
- **V-128b** — Login con Google en un Android real (build propio, no Expo Go): la vuelta a
  `appall://` crea la sesión y aparece la guarda. Requiere que `appall://` esté en la lista
  de URLs de redirección de Supabase Auth.
