# Spec 203 — Errores de cuenta bajo su campo, y la sección «Contactos» se llama «Correo»

> Estado: aplicado (28-nov-2026) — `85ba2ba`; `tsc --noEmit` limpio, `expo export --platform web` sin errores y criterios 3-8 por `grep` y `git diff`; sin probar en navegador ni en dispositivo (ver `PENDIENTES.md`).
> Capa: FRONTEND. `src/screens/LoginScreen.tsx`, `src/screens/RegisterScreen.tsx`, `src/navigation/MusicoStack.tsx`, `src/navigation/MiLocalStack.tsx`, `src/screens/DashboardLocalScreen.tsx`, `src/screens/PerfilMusicoScreen.tsx`.
> Depende de: spec 194 (`validarCorreo`, `campoDeErrorAuth`, `entrar`, `crearCuenta`), spec 173 (`useEstilos`, `useTema`). Comparte `DashboardLocalScreen.tsx` con los specs 199 y 204 y `PerfilMusicoScreen.tsx` con el 204: **serializar** con ellos (el cambio aquí es una línea en cada uno; ubicarla por contenido, no por número de línea).
> Hermano en la web: `app/(auth)/signin/AuthForm.js` (W-324, que usa W-323) y `app/(private)/local/layout.js`, `app/(private)/musico/layout.js`, `…/contactos/page.js` (W-287).

> **En una frase:** iniciar sesión, recuperar contraseña y crear cuenta muestran cada error
> en rojo bajo el campo que lo causó (o sobre el botón si es de la cuenta) en vez de un
> `Alert.alert` que en la web de la app no se ve; y la pantalla donde se escribe al público
> se titula «Correo».

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0
después de esta orquestación.»

- **W-323/W-324.** En la web los errores de cuenta van bajo su campo. En la app,
  `LoginScreen` (`handleLogin`, `handleLoginGoogle`) y `RegisterScreen` (`handleRegister`)
  usan `Alert.alert`, que en el build web de Expo no hace nada (`src/lib/confirm.ts`): quien
  escribe mal la contraseña no ve nada. Además el texto es el de Supabase en inglés.
- **W-287 (18-nov-2026).** Pedido original: «en el crm donde se manda correos debe decir
  correo, no contacto». La web cambió la pestaña del menú y el título de la página a
  «Correo». En la app el equivalente de la pestaña es el botón «👥 Contactos» del panel del
  local y del músico (su comentario, spec 155, dice «como la pestaña de la web»), y el
  título es el del header del stack.

## Decisión

### 1. `src/screens/LoginScreen.tsx`

Estado nuevo: `errores: { email?: string; password?: string }`, `errorGeneral: string | null`
y `entrando: boolean`. Se quita el import de `Alert`.

**Modo «login»:**
- `handleLogin`:
  1. Limpia `errores` y `errorGeneral`.
  2. `validarCorreo(email)`; si no es `true`, va a `errores.email`. Contraseña vacía →
     `errores.password = 'Falta la contraseña'` (texto de la web). Con algún error, no llama
     a la base.
  3. `entrando = true`; `const err = await entrar(email.trim(), password)`; `entrando = false`.
  4. Con `err`: si `err.campo` no es `null`, va a `errores[err.campo]`; si es `null`, a
     `errorGeneral`. Sin error no hace nada más: `AuthContext` ya navega al cambiar la sesión,
     igual que hoy.
- `handleLoginGoogle`: un error va a `errorGeneral` (no tiene campo).
- Escribir en un campo borra **solo** el error de ese campo (y `errorGeneral`).
- Botón «Entrar» deshabilitado mientras `entrando`, con texto «Un momento…» (el mismo que
  ya usa «Enviar enlace»).

**Modo «recuperar»:** `handleEnviarEnlace` cambia `!correo.includes("@")` por
`validarCorreo(correo)`; su mensaje va a `errorRecuperar` (el texto pasa a ser «Ingresa un
correo válido, por ejemplo nombre@gmail.com»). El resto del modo no cambia.

### 2. `src/screens/RegisterScreen.tsx`

Estado nuevo: `errores: { nombre?: string; email?: string; password?: string }`,
`errorGeneral: string | null`, `creando: boolean` y `correoEnviado: boolean`. Se quita el
import de `Alert`.

- `handleRegister`:
  1. Limpia errores.
  2. Nombre vacío → `errores.nombre = 'Falta el nombre'` (texto de la web; reemplaza a
     «Ingresa tu nombre o el nombre de tu proyecto», que iba en un `Alert`).
     `validarCorreo(email)` → `errores.email`. Contraseña vacía → `errores.password = 'Falta la contraseña'`.
     Con algún error, no llama a la base.
  3. `const { error, sesion } = await crearCuenta(email.trim(), password, role, nombre)`.
  4. Con `error`: a su campo o a `errorGeneral` (ahí llega también el mensaje de cuenta
     existente, `campo: null`).
  5. Sin error y sin `sesion`: `correoEnviado = true`. Con `sesion` no hace nada más (la
     sesión ya navega).
- Con `correoEnviado`, la pantalla deja de mostrar el formulario y muestra el ícono, el
  título «Crear cuenta», el texto «Revisa tu correo para confirmar la cuenta.» (el mismo que
  antes iba en el `Alert`) y el enlace «¿Ya tienes cuenta? Inicia sesión».
- Escribir en un campo borra solo su error; botón «Crear cuenta» deshabilitado mientras
  `creando`, con texto «Un momento…».

### 3. Cómo se dibuja un error (las dos pantallas)

- **Bajo el campo:** un `Text` con el mensaje, con el estilo `textoError` que ya tiene
  `LoginScreen` (`color: c.danger`, `fontSize.sm`, alineado a la izquierda); `RegisterScreen`
  suma el mismo estilo. El `TextInput` con error suma un estilo `inputConError`
  (`borderColor: c.danger`, `borderWidth: 1.5`). `accessibilityLabel` del `Text`: el mismo
  mensaje.
- **Error de la cuenta** (`errorGeneral`): un bloque justo encima del botón principal, con
  fondo `c.dangerBg`, texto `c.dangerText`, `borderRadius.sm` y `padding` `spacing.sm`.
- Colores solo de la paleta (`useEstilos` / `useTema`): ningún hex nuevo.

### 4. «Contactos» → «Correo» (W-287)

- `src/navigation/MusicoStack.tsx` y `src/navigation/MiLocalStack.tsx`: la pantalla
  `Contactos` pasa a `options={{ title: 'Correo' }}`. **El nombre de la ruta (`Contactos`) no
  cambia**: lo usan los `navigate('Contactos', …)` del panel y de `TarjetaPro`, igual que la
  web no cambió la URL.
- `src/screens/DashboardLocalScreen.tsx` y `src/screens/PerfilMusicoScreen.tsx`: el botón
  «👥 Contactos» pasa a «✉️ Correo».
- **No cambian**, igual que en la web: la tarjeta «Contactos» del resumen dentro de
  `ContactosScreen` (cuenta personas, no nombra la sección), «Ver tus contactos →» de
  `TarjetaPro`, los textos que hablan de las personas, y el admin (`AdminTenantScreen`).
  Por eso `src/screens/ContactosScreen.tsx` no se toca. W-286 (encabezado de columna
  «Correo») no aplica: la lista de la app son tarjetas sin encabezado.

### Lo que NO cambia

- `AuthContext` y la lógica de autenticación (spec 194). `CambiarContrasenaScreen`.
- El resto de las dos pantallas del panel.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `npx expo export --platform web` termina sin errores.
3. `grep -n "Alert" src/screens/LoginScreen.tsx src/screens/RegisterScreen.tsx` no devuelve nada.
4. `grep -n "signIn(\|signUp(" src/screens/LoginScreen.tsx src/screens/RegisterScreen.tsx`
   no devuelve nada, y `grep -n "validarCorreo" src/screens/LoginScreen.tsx src/screens/RegisterScreen.tsx`
   devuelve al menos una línea en cada archivo.
5. `grep -n "title: 'Correo'" src/navigation/MusicoStack.tsx src/navigation/MiLocalStack.tsx`
   devuelve una línea en cada uno, y `grep -n 'name="Contactos"' src/navigation/MusicoStack.tsx src/navigation/MiLocalStack.tsx`
   sigue devolviendo una línea en cada uno (la ruta no cambió).
6. `grep -n "👥 Contactos" src/screens/DashboardLocalScreen.tsx src/screens/PerfilMusicoScreen.tsx`
   no devuelve nada.
7. Ningún hex nuevo en los archivos tocados (`git diff` sin `#[0-9a-fA-F]{3,6}` agregado).
8. `git diff --stat` del commit toca solo los seis archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- En la web de la app (`expo export` servido) y en un teléfono: entrar con
  `ana.rojas@gmail` → error bajo el correo, sin llamar a la base; entrar con una contraseña
  incorrecta → «Correo o contraseña incorrectos» bajo la contraseña.
- Crear cuenta sin nombre → «Falta el nombre» bajo el nombre; con un correo que ya tiene
  cuenta → el aviso de cuenta existente sobre el botón; con un correo nuevo → «Revisa tu
  correo para confirmar la cuenta.» en lugar del formulario.
- «¿Olvidaste tu contraseña?» con `ana@` → el error nuevo bajo el campo.
- Panel del local y del músico: el botón dice «✉️ Correo» y abre la pantalla titulada «Correo».

## Fuera de alcance

- El rediseño completo del login de la web (W-324: modo segmentado, rol en tarjetas,
  requisitos de contraseña en chips).
- Quitar `signIn` y `signUp` de `AuthContext` (deuda anotada por el 194).
- Renombrar la ruta `Contactos` o cualquier otro texto del CRM.

## Bugs encontrados al aplicar (28-nov-2026)

- **Criterio 3.** `grep -n "Alert"` también encontraba un comentario anterior de
  `LoginScreen.tsx` («Error en un Text y no en Alert…»), no solo el import y las llamadas. El
  comentario pasa a decir «y no en un diálogo»; el diseño no cambia.
