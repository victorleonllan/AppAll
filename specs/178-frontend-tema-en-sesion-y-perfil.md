# Spec 178 — Tema oscuro en el ingreso, el registro, los roles y el perfil

> Estado: aplicado (13-nov-2026) — criterios 1-3 verificados: `tsc` limpio, `expo export --platform web` sin error, `rg "colors\b"` vacío en los 11 archivos. 4-7 y V 178-a sin verificar en dispositivo. `FormElegirRol` no tiene opción elegida con fondo `accent`/`accentLight` (las tarjetas son `cardBackground`), así que la Decisión 2 no le aplica
> Capa: FRONTEND. `src/screens/AuthScreen.tsx`, `src/screens/LoginScreen.tsx`,
> `src/screens/RegisterScreen.tsx`, `src/screens/CambiarContrasenaScreen.tsx`,
> `src/screens/OAuthErrorScreen.tsx`, `src/screens/ElegirRolScreen.tsx`,
> `src/components/FormElegirRol.tsx`, `src/components/GuardaRol.tsx`,
> `src/screens/PerfilScreen.tsx`, `src/components/PantallaEnCamino.tsx`,
> `src/screens/InvitacionLocalScreen.tsx`.
> Depende de: spec 173
> Hermano en la web: W-272 (paso 5: `app/(auth)/quien-eres/QuienEresForm.js`,
> `app/(auth)/app/volver/page.js`, `app/(auth)/signin/AuthForm.js`,
> `app/(marketing)/invitacion/[token]/page.js`; addenda del 12-nov: opción de rol con
> `text-accent-content`).

> **En una frase:** las pantallas de ingreso, registro, cambio de contraseña, error de
> Google, elección de rol, perfil, invitación de dueño de local y «en camino» leen la
> paleta activa.

## Contexto

173 dejó la paleta doble, `useTema`, `useEstilos` y la receta (§6). Referencias por
archivo:

| Archivo | `colors.` | Texto blanco | Fondo `accent` (línea) | Props JSX |
|---|---|---|---|---|
| `screens/AuthScreen.tsx` | 11 | 0 | — | 0 |
| `screens/LoginScreen.tsx` | 19 | 1 | 195 | 3 |
| `screens/RegisterScreen.tsx` | 17 | 2 | 155, 160 | 3 |
| `screens/CambiarContrasenaScreen.tsx` | 16 | 1 | 134 | 1 |
| `screens/OAuthErrorScreen.tsx` | 5 | 1 | 58 | 0 |
| `screens/ElegirRolScreen.tsx` | 5 | 1 | 55 | 0 |
| `components/FormElegirRol.tsx` | 14 | 0 | — | 1 |
| `components/GuardaRol.tsx` | 1 | 0 | — | 0 |
| `screens/PerfilScreen.tsx` | 13 | 1 | 74 | 0 |
| `components/PantallaEnCamino.tsx` | 6 | 1 | 59 | 0 |
| `screens/InvitacionLocalScreen.tsx` | 22 | 1 | 260 | 3 |

Casos especiales:

- `OAuthErrorScreen` se monta fuera del navegador, en la rama temprana de `App.tsx:17-20`.
  173 dejó `TemaProvider` envolviendo también esa rama, así que puede llamar a
  `useTema`.
- `GuardaRol` tapa toda la app mientras la sesión no tiene rol (spec 128) y usa un solo
  color (`rg -n "colors\." src/components/GuardaRol.tsx`).
- La addenda del 12-nov de W-272 encontró que la opción de rol elegida en `/signin`
  quedaba con texto blanco sobre amarillo porque heredaba el color. En la app,
  `FormElegirRol.tsx` dibuja las opciones de rol: la opción elegida debe declarar su color
  de texto sobre el acento.

## Decisiones

1. **Receta de 173 §6.** En claro, nada cambia de valor.
2. **Toda opción o botón con fondo `accent` declara `c.onAccent` como color de texto**,
   también donde hoy lo hereda o no lo declara. Es la regla que deja la addenda de W-272.

## Cambios por archivo

Los 11 archivos: receta de 173 §6, más:

- `LoginScreen.tsx`, `RegisterScreen.tsx`, `CambiarContrasenaScreen.tsx`,
  `OAuthErrorScreen.tsx`, `ElegirRolScreen.tsx`, `PerfilScreen.tsx`,
  `PantallaEnCamino.tsx`, `InvitacionLocalScreen.tsx`: texto blanco sobre el fondo
  `accent` de la línea de la tabla → `c.onAccent`.
- `FormElegirRol.tsx`: si la opción elegida usa fondo `accent` o `accentLight`, su texto
  declara `c.onAccent` o `c.accent` respectivamente (Decisión 2).

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. `rg -n "colors\b" <los 11 archivos>` no muestra nada.
4. En claro, ingreso, registro, cambio de contraseña, elegir rol, perfil del fan y la
   invitación de dueño de local se ven igual que antes del spec.
5. En oscuro, esas pantallas tienen fondo `#121315`, campos `#1C1E20` con texto claro y
   placeholder `#8A868D`.
6. En oscuro, los botones de ingresar, registrarse y elegir rol muestran texto oscuro
   sobre el acento, y la opción de rol elegida se lee.
7. En web, con tema oscuro guardado, abrir la app con `?error=…` de Google muestra
   `OAuthErrorScreen` en oscuro.

## V-candidatas

- **178-a** — En iOS y Android, con tema oscuro, el teclado y el autocompletado de
  contraseña siguen claros (efecto esperado de `userInterfaceStyle: "light"`, ver 173) y
  no tapan texto ilegible.

## Fuera de alcance

- La imagen de la estatua de `/signin` de la web: la app no la tiene.
- Controles nativos (teclado, `Alert`): 173, «Fuera de alcance».
