# Spec 042 — Login con Google (OAuth) además de magic link

**Estado: código listo, bloqueado por credenciales.** Falta el Client ID y Client
Secret de Google Cloud Console. Sin eso, el provider no está habilitado en Supabase
Auth y `signInWithOAuth({ provider: 'google' })` devuelve error.

## Contexto

El login hoy es Supabase Auth con dos caminos: contraseña (`signIn`) y magic link
por correo (`signInOtp`, spec 013/028). Victor pidió una tercera vía: entrar con la
cuenta de Google, para bajar la fricción de registro de músicos y locales.

**Importante — esto no reemplaza nada del spec 028.** Resend (028) es el proveedor
SMTP que manda los correos de Auth; Google es un provider de login más, configurado
aparte, en la misma pantalla de Supabase Auth pero sin relación con SMTP.

## Decisión

Google OAuth vía Supabase Auth (no una integración directa con la API de Google).
Supabase ya sabe hacer el intercambio de código por sesión — el trabajo real es:
credenciales de Google + habilitar el provider + el flujo de UI en la app.

### Dónde vive cada secreto

**El Client Secret de Google NO va en `.env` de la app.** Expo empaqueta toda
variable `EXPO_PUBLIC_*` en el bundle del cliente — cualquiera que inspeccione la
app la vería. El secreto va **solo** en la config de Auth de Supabase (lado
servidor, se guarda en el dashboard). El cliente solo necesita saber que existe el
provider `google`; no maneja el secreto en ningún momento.

## Configuración a aplicar (pendiente, la hace Victor)

1. Google Cloud Console → OAuth consent screen (External) → Credentials → OAuth
   client ID → tipo **Web application** (aunque el login final sea nativo, Supabase
   media el flujo por navegador).
2. Authorized redirect URI: `https://xluinfihjjtxkglihxqz.supabase.co/auth/v1/callback`
3. Pegar Client ID + Client Secret en `Authentication → Providers → Google` del
   dashboard de Supabase, activar el toggle.

## Código (aplicado en esta sesión)

- **`src/context/AuthContext.tsx`** — `signInWithGoogle()`, agregada al contrato de
  `AuthState` junto a `signIn`/`signInOtp`. Dos caminos según plataforma:
  - **Web:** `supabase.auth.signInWithOAuth` redirige la pestaña entera a Google;
    `detectSessionInUrl: true` (ya activo en `src/lib/supabase.ts`) captura la
    sesión sola al volver. No hace falta código adicional de retorno.
  - **Nativo:** no hay redirect de navegador de por sí. Se pide la URL de Google con
    `skipBrowserRedirect: true`, se abre con `expo-web-browser`
    (`WebBrowser.openAuthSessionAsync`), y cuando vuelve al deep link `appall://`
    con los tokens en la URL, se arma la sesión a mano con
    `supabase.auth.setSession()`.
- **`src/screens/LoginScreen.tsx`** — botón "Continuar con Google" bajo un divisor,
  debajo del login de contraseña existente.

## Hueco a propósito fuera de este spec: rol en cuentas nuevas por Google

`RegisterScreen` pide explícitamente "¿Sos músico o dueño de local?" y guarda ese
rol en `user_metadata.role` al hacer `signUp()`. **Google OAuth no pasa por ahí**:
un usuario nuevo que entra por Google llega sin `role` en sus metadatos (Google solo
manda nombre/email/foto), y `AuthContext` lo lee como `null`.

No se resolvió acá a propósito — es una decisión de producto (¿pantalla de
"completa tu perfil" post-login? ¿selector antes de mandarlo a Google? ¿default a
`public` y que lo cambie después desde su perfil?), no una consecuencia obvia del
código. Bloquea que un músico o local nuevo entre por Google y llegue directo a su
dashboard — hoy llegaría como `public`. **Spec aparte cuando se decida la UX.**

## Criterios de aceptación

- [ ] Provider Google habilitado en Supabase Auth (Client ID + Secret configurados)
- [ ] En web (`app-all-lemon.vercel.app`): tocar "Continuar con Google" abre el
      consentimiento de Google y vuelve autenticado, sesión persistida
- [ ] En nativo: mismo resultado vía el navegador embebido y el deep link `appall://`
- [ ] Cancelar el flujo de Google (cerrar el navegador) no muestra un error — hoy
      vuelve en silencio, sin sesión
- [ ] Un usuario que ya existía por email/password y entra por primera vez con
      Google usando el mismo correo: verificar qué hace Supabase (¿linkea la cuenta
      o crea una segunda?) — no probado, depende de la config de "Manual linking"
      del proyecto

## Fuera de alcance

- Rol de usuarios nuevos por Google (ver sección arriba) — spec aparte
- Apple Sign-In u otros providers — no pedido
- Vincular una cuenta de Google a un usuario ya logueado (hoy es solo login/signup)
