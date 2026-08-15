# Spec 048 — Lógica y frontend para rol fan, guest checkout y seguir

> Estado: **propuesto, sin implementar.** Depende de que el spec 046 esté aplicado en
> producción antes de tocar código (los literales `'fan'`/`'local'` no son roles válidos en
> la base hasta entonces — ver "Orden de implementación"). El spec 047 es independiente,
> se puede implementar en paralelo.

**Capa: Comportamiento + Frontend · `src/`, `supabase/functions/create-preference/` ·
Depende de: spec 046 (roles, guest checkout) y spec 047 (seguir), ambos sin aplicar.**

## Contexto

Los specs 046 y 047 son solo capa de datos. Completan lo que el spec 032
("Renombrar café a local") dejó fuera a propósito y el spec 018 documentó en
`specs/README.md` ("`profiles.role` sigue usando `'cafe'`, no `'local'`: cambiarlo es un
spec aparte"). Ese "spec aparte" es este. Tres frentes, verificados contra el código real
del repo el 2026-08-15 (no supuestos):

1. Cuatro archivos siguen comparando contra `'cafe'`/`'public'` como si fueran roles
   válidos — dejan de serlo en cuanto el spec 046 se aplica.
2. El único camino de "comprar sin cuenta" que existe hoy en AppAll **no es guest
   checkout real**: crea una cuenta con `role: 'public'` vía magic link antes de comprar.
   El spec 046 agrega `reservar_ticket_pending_guest`, pensado para comprar sin crear
   ninguna cuenta — pero nada en el frontend lo llama todavía.
3. No existe UI para "seguir" ni para el dashboard del fan — las tablas del spec 047 no
   tienen ningún consumidor.

## 1 — Rename de literales de rol

`'cafe'`→`'local'`, `'public'`→`'fan'`, en los cuatro archivos que el spec 032 señaló y
dejó explícitamente sin tocar:

| Archivo | Líneas (2026-08-15) | Cambio |
|---|---|---|
| `src/context/AuthContext.tsx` | 7 | `type UserRole = 'public' \| 'musician' \| 'cafe' \| null;` → `'fan' \| 'musician' \| 'local' \| null` |
| `src/navigation/index.tsx` | 14, 21 | mismo `UserRole`; `if (role === 'cafe')` → `if (role === 'local')` |
| `src/screens/AuthScreen.tsx` | 9, 72 | `type RoleOption = "musician" \| "cafe"` → `"musician" \| "local"`; `setSelectedRole("cafe")` → `setSelectedRole("local")` |
| `src/screens/RegisterScreen.tsx` | 9, 88-89, 92 | mismo `RoleOption`; las tres comparaciones/asignación `"cafe"` → `"local"` |

`AuthScreen`/`RegisterScreen` **nunca ofrecieron `'public'`/`'fan'` como opción
autoseleccionable** — el registro solo elige entre músico y dueño de local; una cuenta
`fan` se crea sin pasar por esa UI (hoy: magic link con `role: 'public'` hardcodeado en
`AuthContext.signInOtp:69`; después de este spec: guest checkout + claim, ver sección 2).
Por eso este punto no necesita agregar una tercera opción al selector, solo corregir el
valor que ya usa "dueño de local".

`PerfilScreen.tsx:25` muestra el texto "🎭 Público" en un botón decorativo (sin
`onPress`, es puro texto activo) — pasa a "🎭 Fan", ver sección 4.

El alias `'cafe'` en `handle_new_user()` (spec 046, paso 3) sigue aceptando el valor viejo
mientras este punto no se implemente — no bloquea, pero deja de ser necesario en cuanto
se cierra.

## 2 — Guest checkout real reemplaza el flujo de magic link

**Hallazgo:** `signInOtp` (`AuthContext.tsx:62-75`) solo tiene un caller en todo el repo:
`DetalleEventoScreen.tsx:137`. No es un mecanismo de login general, es el "comprar sin
cuenta" actual — y crea una cuenta real (`shouldCreateUser: true`, `role: 'public'`) para
lo que debería ser una compra sin cuenta. Con `reservar_ticket_pending_guest` (spec 046)
ese rodeo ya no hace falta.

### `create-preference` (Edge Function)

Nueva rama cuando no llega `Authorization` con sesión válida:

- Body acepta `email` en vez de (o adicional a) `user_id`.
- Si no hay usuario autenticado: exigir `email`, validar formato, llamar
  `reservar_ticket_pending_guest(evento_id, cantidad, preference_id, email)` en vez de
  `reservar_ticket_pending`.
- `preference.payer.email`: usar el email del invitado en vez de `user.email`.
- `preference.external_reference` (`create-preference/index.ts:85`): pasa a
  `` `${evento_id}|guest:${email}` `` en el camino invitado. Verificado que
  `external_reference` no se lee en ningún otro punto del repo (`grep` sin resultados
  fuera de esa línea) — es solo trazabilidad en el dashboard de MP, cambiarlo no rompe
  nada downstream.
- `webhook-mp` **no necesita cambios**: identifica el ticket por `preference_id`
  (`webhook-mp/index.ts:144`), nunca por `external_reference` ni por `user_id` — el mismo
  código sirve para tickets con dueño y para tickets de invitado.

### `DetalleEventoScreen.tsx`

El paso `step === 'email'` (líneas 217-245) deja de llamar `signInOtp` y en su lugar llama
directo a `create-preference` en modo invitado (mismo `fetch`, sin header
`Authorization`, con `email` en el body). Efectos:

- El paso `step === 'enviado'` (248-270, "revisa tu correo... vuelve a esta pantalla") y
  el mecanismo de auto-compra por `pending_ticket` en `localStorage`/`AsyncStorage`
  (líneas 99-126, 142-147) dejan de tener trabajo que hacer para este flujo — la compra
  ya no espera un click en un link, ocurre en el mismo momento en que el invitado confirma
  su email. Se eliminan.
- `signInOtp` en `AuthContext.tsx` queda sin ningún caller — se borra junto con su entrada
  en `AuthState`, mismo criterio que el spec 032 aplicó a `cafes`/`otherVenues` en
  `VenuesContext` ("si nada lo consume, se borra, no se deja de nombre desactualizado").
- El checkout se abre igual (`window.open(checkoutUrl)`); `ConfirmacionCompraScreen` no
  necesita cambios — ya navega con `ticketId`, no con el usuario.

## 3 — Claim: sin cambio de UI requerido

El trigger `on_auth_user_created_claim_guest_tickets` (spec 046) reclama los tickets solos
al crear la cuenta — no hay paso manual que agregar. Fuera de alcance de este spec: un
aviso tipo "tus entradas de invitado ya están en tu cuenta" al iniciar sesión por primera
vez con un email que tenía tickets de invitado (necesitaría comparar `tickets` antes/después
del signup, o una función que lo detecte) — se propone como spec propio si Victor lo pide,
no bloquea el resto.

## 4 — Seguir músicos y locales + dashboard del fan

**Hook nuevo** `src/hooks/useFollows.ts`: `seguirMusico(musicianId)`,
`dejarDeSeguirMusico(musicianId)`, `seguirLocal(venueId)`, `dejarDeSeguirLocal(venueId)`,
`misMusicosSeguidos()`, `misLocalesSeguidos()` — sobre `follows_musicians`/`follows_venues`
(spec 047), mismo patrón de hook-sobre-Supabase que `useEventoPermisos`/`useCanjeEntrada`.

**Botón "Seguir" — músico:** en `VerMusicoScreen.tsx` (perfil público de un músico, ya
existe y ya se navega ahí desde `LocalesScreen`). Visible solo si `role === 'fan'`.

**Botón "Seguir" — local:** **no hay una pantalla de detalle de un local hoy.**
`LocalesScreen.tsx` lista locales en tarjetas sin navegar a un detalle propio (a
diferencia de los músicos, que sí tienen `VerMusicoScreen`) — verificado, no hay ruta
`VerLocal` en `LocalesStack.tsx`. Dos caminos, a decidir antes de implementar:
- (a) agregar el ícono de seguir directo en la tarjeta de `LocalesScreen` (toggle inline,
  sin pantalla nueva), o
- (b) crear una pantalla `VerLocalScreen` (simétrica a `VerMusicoScreen`) y mover el botón
  ahí.
No se elige acá porque no fue pedido explícitamente y (b) es una pantalla nueva, no un
ajuste de lógica — este spec se limita a marcar la decisión pendiente.

**Dashboard del fan:** `PerfilScreen.tsx` hoy es un stub — título, tres botones de rol
decorativos sin `onPress` (línea 24-32) y cerrar sesión. Se reemplaza el bloque decorativo
por, gateado a `role === 'fan'`:
- Lista de músicos seguidos (de `misMusicosSeguidos()`), cada uno navega a `VerMusico`.
- Lista de locales seguidos (de `misLocalesSeguidos()`).
- Lista de tickets comprados: `SELECT * FROM tickets WHERE user_id = auth.uid()` — ya
  permitido por `tickets_select_own` (spec 020), sin cambios de datos.

## Orden de implementación

1. Aplicar spec 046 y 047 en producción (paso de Victor, fuera de este spec).
2. Punto 1 (rename) — desbloquea que el resto compile contra los tipos correctos.
3. Punto 2 (guest checkout) y punto 4 (seguir/dashboard) — independientes entre sí, se
   pueden hacer en cualquier orden o en paralelo.

## Fuera de alcance

Contadores públicos de seguidores; aviso de claim al iniciar sesión (sección 3);
decisión (a) vs (b) para el botón de seguir un local (sección 4); rediseño visual de
`PerfilScreen`/`AuthScreen` más allá de lo que este spec requiere; `set_my_role` /
pantalla "¿quién eres?" para login por Google sin rol — eso es equivalente a
`sonopolisWeb`'s `app/(auth)/quien-eres/` (W-014) y AppAll no lo necesita hoy porque su
único login sin rol previo (Google, spec 042) sigue bloqueado por credenciales.

## Criterios de aceptación

- [ ] `npx tsc --noEmit` limpio (ignorando `supabase/functions/*`, ver `CLAUDE.md`)
- [ ] Cero referencias a `'cafe'`/`'public'` como valor de rol en `src/` (grep) — las
      legítimas (`VenueType`, `VENUE_LABEL`, nombres propios) no aplican, mismo criterio
      que el spec 032
- [ ] Comprar sin sesión no crea ninguna fila en `auth.users`; crea un `tickets` con
      `guest_email` seteado
- [ ] `signInOtp` no existe más en `AuthContext.tsx` ni en ningún caller
- [ ] Crear una cuenta con el mismo email de una compra de invitado deja el ticket
      visible en "tickets comprados" del dashboard del fan sin acción manual
- [ ] Seguir/dejar de seguir un músico se refleja en `follows_musicians` y en la lista del
      dashboard sin recargar la app
- [ ] `PerfilScreen` con `role === 'fan'` muestra seguidos y tickets; con otro rol o sin
      sesión se comporta como hoy

## Relacionado

- Spec 046 — rol `fan`, guest checkout, claim (capa datos, prerequisito)
- Spec 047 — seguir músicos y locales (capa datos, prerequisito)
- Spec 032 — rename cafe→local en frontend (precedente directo, dejó esta deuda abierta)
- Spec 042 — Google OAuth (por qué "¿quién eres?" no aplica todavía en AppAll)
- [[Hermes/Agentes/Base de Datos/plan-datos-fan-guest-checkout-20260815]] (vault) — pedido
  original de Victor
