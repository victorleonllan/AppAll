# Spec 057 — Corregir Site URL de Supabase Auth (causa raíz del error de login con Google)

**Capa: INFRA · Configuración del dashboard de Supabase, sin código · Depende de: nada**

> Estado: pendiente — acción manual en el dashboard, no requiere sesión de código.

## El problema

Al cancelar/perder el login con Google en `sonopolis.org` (spec relacionado: W-018 de
`sonopolisWeb`), el navegador terminó en `app-all-lemon.vercel.app` con
`error=invalid_request&error_code=bad_oauth_state`, seguido de un 404
`DEPLOYMENT_NOT_FOUND` — atrapado ahí, sin poder reintentar.

## Diagnóstico

`sonopolisWeb/app/(auth)/signin/AuthForm.js:81` arma bien el `redirectTo`
(`${window.location.origin}/auth/callback`, o sea `sonopolis.org`). Pero cuando Supabase
pierde el `state` de OAuth (el caso `bad_oauth_state`), GoTrue no tiene cómo recuperar a
qué `redirect_uri` volver — y en ese caso usa como respaldo el **Site URL** configurado en
Authentication → URL Configuration del proyecto Supabase, no el que mandó el request
original.

Ese Site URL casi seguro sigue apuntando a `app-all-lemon.vercel.app`: es la configuración
que quedó de cuando AppAll era el único proyecto, antes de que `sonopolis.org` se mudara a
`sonopolisWeb` (ver nota del vault, `02-PROJECTS/Sonópolis Web.md`, sección Estado,
2026-08-17). Es el mismo patrón de bug que el dominio de Vercel documentado en
`sonopolisWeb/specs/W-PENDIENTES.md` (§ "sonopolis.org se lo robaba app-all") — algo que
apuntaba a AppAll por default nunca se actualizó cuando `sonopolis.org` pasó a ser
producción de `sonopolisWeb`.

El 404 posterior (`DEPLOYMENT_NOT_FOUND`) es secundario: el deployment específico de
`app-all-lemon.vercel.app` al que cayó ya se había reciclado en Vercel. Corregir el Site
URL elimina el síntoma de raíz — con el fallback apuntando a `sonopolis.org`, ese 404 deja
de ser alcanzable desde este flujo.

## Trabajo

En el dashboard de Supabase, proyecto `xluinfihjjtxkglihxqz` (el mismo backend
compartido por AppAll y `sonopolisWeb` — ver `AppAll.md` del vault):

1. Authentication → URL Configuration → **Site URL**: cambiar a `https://sonopolis.org`
2. **Redirect URLs** (allowlist): confirmar que estén los dos —
   - `https://sonopolis.org/auth/callback` (sonopolisWeb, producción real)
   - `https://app-all-lemon.vercel.app/**` (AppAll, pausado pero no desconectado —
     ver spec 058 de este repo, que le agregó su propio fallback)

## Criterios de aceptación

- [ ] Site URL en el dashboard de Supabase quedó en `https://sonopolis.org`
- [ ] Forzar el error (cancelar el login de Google a medio camino, o dejar expirar el
      `state` esperando) redirige a `sonopolis.org/signin?error=...`, nunca a
      `app-all-lemon.vercel.app`
- [ ] AppAll (`app-all-lemon.vercel.app`) sigue pudiendo loguear con Google sin romperse —
      sigue en la allowlist aunque no sea el Site URL por default

## Fuera de alcance

El mensaje que se muestra en `sonopolis.org/signin` cuando llega `?error=...` — hoy es un
`alert-error` con el texto crudo de Supabase. Eso es el spec w038 de `sonopolisWeb`.
