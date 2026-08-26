# Spec 058 — Pantalla de error tras login con Google fallido (web)

**Capa: FRONTEND · `src/lib/oauthError.ts`, `src/screens/OAuthErrorScreen.tsx`, `App.tsx` · Depende de: nada**

> Estado: aplicado (2026-08-24) — código escrito y montado en `App.tsx`. Sin verificar en
> el navegador (no se forzó el error real contra Supabase). Diseño visual pendiente —
> hoy usa los estilos de `LoginScreen` como placeholder, Victor lo va a rediseñar aparte.

## Contexto

Red de seguridad para cuando `window.location` en la versión web de AppAll (Expo Web,
`app-all-lemon.vercel.app`) vuelve con `?error=...` de un login de Google fallido — antes
no había nada que lo capturara, la SPA cargaba el login normal con la basura de query
params sin usar, o el usuario caía en el 404 crudo de Vercel si el deployment de origen ya
se había reciclado (ver spec 057, causa raíz real del segundo caso, no arreglable desde
acá — sin app corriendo no hay dónde interceptar nada).

AppAll está pausado (no es el camino de login real de Sonópolis hoy — ver
`02-PROJECTS/AppAll.md` del vault), así que esto es defensa en profundidad, no la
prioridad. El caso que importa es el de `sonopolisWeb` (spec w038).

## Trabajo

- `src/lib/oauthError.ts` — `getOAuthErrorFromUrl()`: lee `error`/`error_description` de
  `window.location.search` (`typeof window === 'undefined'` → `null`, no rompe en nativo)
- `src/screens/OAuthErrorScreen.tsx` — ícono + título + mensaje (el de Supabase o uno
  genérico) + botón único que abre `https://sonopolis.org/unete` con `Linking.openURL`.
  Deliberadamente manda afuera de la app en vez de reintentar en el mismo origin: ese
  origin puede ser el deployment reciclado que causó el error
- `App.tsx` — antes de montar `AuthProvider`/`AppNavigator`, si `getOAuthErrorFromUrl()`
  devuelve algo, renderiza `OAuthErrorScreen` en su lugar y corta ahí

## Criterios de aceptación

- [ ] Forzar `app-all-lemon.vercel.app/?error=access_denied&error_description=test` en el
      navegador muestra `OAuthErrorScreen`, no el login normal — sin verificar
- [ ] El botón "Volver a intentar" abre `sonopolis.org/unete` en pestaña nueva/misma
      pestaña — sin verificar
- [ ] `tsc --noEmit` limpio — sin correr en esta sesión (verificar antes de dar por
      cerrado el spec)
- [ ] En nativo (`Platform.OS !== 'web'`) `getOAuthErrorFromUrl()` no rompe — el flujo
      nativo (`WebBrowser.openAuthSessionAsync` en `AuthContext.tsx`) ni pasa por acá,
      pero el `typeof window` guard cubre el caso

## Fuera de alcance

El diseño visual final — Victor lo arma en otra ventana. Los estilos actuales son un
placeholder funcional (mismo patrón de `LoginScreen`), no la versión que se publica.
