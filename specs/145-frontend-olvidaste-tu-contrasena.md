# Spec 145 — «¿Olvidaste tu contraseña?» en la pantalla de login

> Estado: aplicado (17-oct-2026) — `npx tsc --noEmit` sin errores fuera de `supabase/functions`, `npx expo export --platform web` limpio (criterios 1-2). Criterio 5 cubierto por código (sin `@` no se llama a `pedirEnlaceRecuperacion`). Criterios 3, 4, 6 y V-candidata 145-a pendientes de prueba con un correo real en dispositivo.
> Capa: FRONTEND. `src/screens/LoginScreen.tsx`, `src/context/AuthContext.tsx`.
> Depende de: spec 128 (aplicado). Usa sin cambios `/auth/enlace` y `/perfil/contrasena`
> de la web (W-209, W-210, W-228).
> Hermano en la web: `app/(auth)/signin/AuthForm.js` → `FormEnlace` con `recuperar` (W-228).

> **En una frase:** el login de la app ofrece «¿Olvidaste tu contraseña?», que manda el
> mismo enlace por correo que usa la web; al abrirlo, la persona elige una contraseña nueva
> en sonopolis.org y vuelve a entrar en la app con ella.

## Contexto

`LoginScreen.tsx` solo tiene correo + contraseña, Google y «¿No tienes cuenta? Regístrate»
(`:39-80`). Quien olvidó la contraseña hoy no tiene salida en la app. El rodeo que existe
(entrar por el enlace de compra de un evento y poner la contraseña en el perfil, spec 128)
nadie lo va a encontrar.

La web lo resolvió en W-228 con un solo mecanismo: `pedirEnlaceCorreo` (W-209) pide un
enlace mágico con **flujo implícito**, con vuelta a
`https://sonopolis.org/auth/enlace?next=/perfil/contrasena`. Flujo implícito quiere decir que
Supabase devuelve los tokens en el fragmento de la URL (`#access_token=…`) y no un `code` que
solo puede canjear el navegador que lo pidió. Por eso el enlace funciona en cualquier
navegador del teléfono, también si el pedido salió de la app. `/perfil/contrasena` ya
permite elegir la contraseña nueva.

**Decisión: el cambio de contraseña se hace en la web y no en la app.** La app nativa no
recibe sesiones por deep link (`linking.ts` solo mapea `compra` e `invitacion/:token`). Traer
el enlace de vuelta a la app necesitaría manejar los tokens del fragmento en `appall://` y
agregar esa URL a la `uri_allow_list` de Supabase. Es más superficie para el mismo
resultado: con la contraseña nueva, la persona entra en la app por el login normal.

## Diseño

### `AuthContext.tsx` — `pedirEnlaceRecuperacion(email)`

Función nueva en el contexto (y en su interfaz, `:20-30`) con el mismo contrato que
`signInOtp`: devuelve `Promise<string | null>`, donde `null` es éxito.

- Usa un **cliente de Supabase aparte**, creado dentro de la función, con
  `auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }`.
  Así no toca la sesión ni el storage del cliente de la app y queda fijado el flujo
  implícito aunque el cliente principal cambie de flujo algún día. Es el mismo patrón que
  `libs/enlaceCorreo.js` de la web.
- Llama a `signInWithOtp` con:
  - `emailRedirectTo: \`${URL_WEB}/auth/enlace?next=${encodeURIComponent('/perfil/contrasena')}\``
    (`URL_WEB` de `src/constants/web.ts`). Va siempre a la web, también desde el build web
    de Expo.
  - `shouldCreateUser: true` y `data: { nombre: email.split('@')[0], pais: 'CL' }`, igual
    que la web (W-205), para que el mensaje no revele si el correo tiene cuenta.

### `LoginScreen.tsx`

- Debajo del botón «Entrar», un enlace «¿Olvidaste tu contraseña?» (estilo `styles.link`).
- Al tocarlo, la pantalla cambia a una vista de recuperación (estado
  `modo: 'login' | 'recuperar' | 'enviado'`):
  - Texto: «Te mandamos un enlace a tu correo. Al abrirlo eliges una contraseña nueva en
    sonopolis.org, y después entras aquí con ella.»
  - El campo de correo viene con lo que ya se había escrito en el login.
  - Botón «Enviar enlace». Si el correo no tiene `@`, muestra el error en línea «Ingresa un
    correo válido» y no envía. Mientras envía, el botón dice «Un momento…» y queda
    deshabilitado.
  - Si sale bien, pasa a `enviado`: «Listo. Revisa tu correo (también la carpeta de spam) y
    abre el enlace.»
  - Si falla, muestra el mensaje de error en un `Text` rojo, no en `Alert`, para que también
    se lea en web.
  - Un enlace «Volver» regresa a `login` sin perder el correo.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. Con un correo de prueba, «Enviar enlace» manda un correo cuyo enlace apunta a
   `…/auth/v1/verify?…&redirect_to=https://sonopolis.org/auth/enlace?next=%2Fperfil%2Fcontrasena`.
4. Al abrir ese enlace en el navegador del teléfono se llega a `/perfil/contrasena` con
   sesión. Después de guardar la contraseña nueva, el login de la app entra con ella.
5. Correo vacío o sin `@`: no se llama a Supabase y aparece el error en línea.
6. Después de pedir el enlace, la sesión de la app no cambia: `supabase.auth.getSession()`
   del cliente principal sigue en `null`.

## Fuera de alcance

- Entrar a la app sin contraseña con el enlace (deep link con tokens).
- «¿Sin contraseña? Te mandamos un enlace» de la web. Hoy en la app ese caso lo cubre el
  enlace de compra.
- Cambiar la plantilla de correo de Supabase.

## Verificación manual

- **V-candidata 145-a:** en un teléfono, con una cuenta de prueba, pedir el enlace desde la
  app, abrirlo desde la app de correo, poner una contraseña nueva y entrar en la app con ella.
