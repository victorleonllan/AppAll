# Spec 141 — Abrir la invitación de dueño de local en la app y activar el local

> Estado: propuesto (16-oct-2026)
> Capa: FRONTEND. `src/screens/InvitacionLocalScreen.tsx`.
> Depende de: spec 114, spec 135, spec 142
> Hermano en la web: `app/(marketing)/invitacion/[token]/page.js` y `Acciones.js` (W-230–232, W-241).

> **En una frase:** el enlace `appall://invitacion/<token>` abre en la app la misma
> invitación que la web: muestra el local, y según la sesión lo activa, pide entrar con el
> correo invitado o explica que la invitación es para otra cuenta.

## Contexto

W-230 a W-232 dejan a un admin de Sonópolis invitar por correo al dueño real de un local.
El correo lleva a `https://sonopolis.org/invitacion/<token>`, una página que no vence
(el enlace de acceso de Supabase sí vence, por eso se pide en la página y no va en el
correo, `page.js:17-24`).

La base hace el traspaso de dos formas (migración
`20261007120000_spec_w230_invitar_dueno_de_local.sql`):

- **Al entrar** con el correo invitado: el trigger `claim_venue_owner_invites_update_trg`
  corre en cada cambio de `last_sign_in_at` o `email_confirmed_at` (`:362-367`). Entrar con
  contraseña, con Google o crear la cuenta y confirmar el correo ya activa el local, sin
  que la app haga nada.
- **Con la sesión ya abierta** con ese correo: no hay login nuevo, así que se llama a
  `reclamar_invitacion_local` (`:371-405`).

Al aplicar, la base cambia el rol de la cuenta a `local` en `profiles` y en
`user_metadata` (`:291-296`), y rechaza cuentas de músico o que ya administran otro local
(`:281-289`). El spec 135 deja `getInvitacionLocalPublica`, `reclamarInvitacionLocal` (que
además refresca la sesión para que la app vea el rol nuevo) y `cerrarSesionSoloAqui`. El
spec 114 registra la ruta `InvitacionLocal` (`{ token }`), el deep link y el placeholder de
esta pantalla. El spec 048 hace que el rol `local` muestre la pestaña del local.

### Cómo llega alguien que abre el correo

El correo sigue apuntando a la web, y así queda: el enlace HTTPS funciona en cualquier
teléfono, tenga o no la app, y el flujo web está completo y probado (V41 de la web). La app
atiende `appall://invitacion/<token>` para quien ya la tiene, y en el build web de Expo la
ruta `/invitacion/<token>`.

**Nota para un spec W futuro (no se escribe acá):** en `/invitacion/[token]`, con
`estado === 'pending'` y en un navegador móvil, un enlace secundario «Abrir en la app» hacia
`appall://invitacion/<token>`. Que el enlace del correo abra la app directamente exige
Universal Links (iOS) y App Links (Android): archivos `apple-app-site-association` y
`assetlinks.json` en `sonopolis.org` y un build nativo con el dominio asociado. Es una
decisión aparte.

## Diseño

`InvitacionLocalScreen.tsx` reemplaza el placeholder del 114.

```ts
const { token } = route.params as { token: string };
const { session, user } = useAuth();
```

### Carga

- Si `!esTokenInvitacion(token)` → estado «no existe» sin consultar.
- Si no, `getInvitacionLocalPublica(token)` al montar **y cada vez que cambia
  `user?.id`**: después de entrar, el trigger puede haber activado el local, y la
  invitación ya viene `accepted`.
- `null` → «Esta invitación no existe. Revisa que el enlace esté completo.».

### Tarjeta del local

Antetítulo «INVITACIÓN», título «Activa <nombreLocal> en Sonópolis», y una tarjeta con la
imagen (si hay, `Image` de 64 × 64), el nombre, el tipo con `venueLabel(tipo)` y
«<direccion>, <comuna>» (lo que exista). Al pie de la pantalla: «¿No eres de
<nombreLocal>? Ignora esta invitación.».

### Estados

1. **`revoked`** → «Esta invitación ya no es válida. Escríbenos a victor@sonopolis.org y te
   mandamos una nueva.».
2. **`accepted`** → la tarjeta y «Este local ya está activado.». Con sesión, el botón «Ir a
   mi local» navega a la pestaña del local (hoy `'Mi Local'`; el nombre que deje el 114 o
   el 048). Sin sesión, «Entra para administrarlo» abre el login del estado 5.
3. **`pending` con sesión y `user.email` igual a `correo`** (sin distinguir mayúsculas) →
   llama `reclamarInvitacionLocal(token)` **una sola vez** (un `useRef` como candado: el
   efecto puede correr dos veces). Mientras corre: «Activando tu local…». Si funciona: «Listo:
   <nombreLocal> ya es tuyo.» y «Ir a mi local». Si falla: el mensaje de la base en
   `colors.danger` (por ejemplo «esta cuenta es de músico; entra con una cuenta de local»).
4. **`pending` con sesión de otro correo** → «Esta invitación es para <correo>. Ahora
   estás con <user.email>.» y el botón «Cerrar sesión y continuar», que llama
   `cerrarSesionSoloAqui()`. `scope: 'local'` cierra solo la sesión de este teléfono.
5. **`pending` sin sesión** → «Vas a entrar con <correo>» y dos botones:
   - «Ya tengo cuenta — entrar»: muestra `LoginScreen` dentro de esta pantalla
     (`onBack` vuelve a la tarjeta, `onSwitchToRegister` pasa al otro).
   - «Crear mi cuenta»: muestra `RegisterScreen` con `preselectedRole` igual al valor de
     local que use ese componente al aplicar este spec (hoy `'cafe'`; `'local'` después del
     048).
   Mismo patrón que `AuthScreen.tsx:15-31`, sin navegar a otra pestaña: así el token no se
   pierde. Cuando aparece la sesión, la carga se repite (ver Carga) y se pasa al estado 2
   o 3.
   Ayuda bajo los botones: «Usa el correo <correo>: el local se activa en esa cuenta. Si
   creas la cuenta, confirma tu correo y vuelve a abrir este enlace.».

Los mensajes van en `Text` dentro de la pantalla, no con `Alert.alert`, por el build web.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `appall://invitacion/<token-pendiente>` sin sesión muestra la tarjeta del local y «Vas a
   entrar con <correo>».
3. Entrar con contraseña con el correo invitado deja `venues.owner_id` = esa cuenta y la
   invitación `accepted`, y la pantalla pasa a «Este local ya está activado».
4. Con la sesión abierta del correo invitado, abrir el enlace activa el local por RPC, y al
   volver a la app el rol es `local` sin cerrar sesión.
5. Con la sesión de otro correo, se ve el estado 4; «Cerrar sesión y continuar» deja la
   pantalla en el estado 5.
6. Un token revocado muestra el estado 1; un texto que no es UUID muestra «Esta invitación
   no existe…» sin consultar la base.
7. `npx expo export --platform web` termina sin error.

## Fuera de alcance

- El enlace «Abrir en la app» en la web y Universal Links / App Links (nota de arriba).
- Pedir el enlace de acceso por correo desde la app (`PedirEnlaceLocal` de la web): en
  nativo, el enlace de Supabase vuelve a la URL del sitio y no a la app
  (`AuthContext.tsx:63-65`), así que entraría en el navegador y no aquí.
- Crear o revocar invitaciones: es del admin en la web (W-232).

## Verificación manual

- **V-candidata 141-a:** con una invitación de prueba a un correo sin cuenta, abrir
  `appall://invitacion/<token>` en un teléfono, crear la cuenta, confirmar el correo, volver
  a abrir el enlace y ver el local en la pestaña del local. Revocar y borrar los datos de
  prueba al terminar.
