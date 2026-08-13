# Spec 043 — Migración de la web a Next.js (spec puente)

## Contexto

La web de Sonópolis hoy es `expo export --platform web` desplegado en
`app-all-lemon.vercel.app` — la misma app RN, exportada. Victor decidió reemplazarla
por una app Next.js nativa, usando `shipearapido` (un molde/SaaS-starter propio,
repo `github.com/victorleonllan/shipearapido`) como base de estructura y
convenciones — no como código a ejecutar tal cual, porque su stack de datos (Mongo,
NextAuth, Stripe, R2) no es el de Sonópolis.

**Decisión clave:** Supabase se queda como la única base de datos. La app nativa
(iOS/Android, Expo) sigue viva contra el mismo proyecto Supabase sin ningún cambio.
Esta es una migración **solo de la capa web** — nada de datos, nada de un segundo
sistema de identidad. El schema, las 16 migraciones, las policies RLS y las Edge
Functions de pago (`create-preference`, `webhook-mp`) no se tocan.

## Por qué este spec vive en dos repos

El trabajo real de la migración pasa a vivir en `~/projects/sonopolisWeb` (clonado
de `shipearapido`, con el remote hacia el molde ya cortado — nada de eso se pushea
de vuelta ahí). Ese repo tiene su propia serie de specs, numerada desde
`sonopolisWeb/specs/w001-...`, para no forzar que alguien la lea después de 42 specs
de un proyecto RN que no le aplican.

Este 043 es el único registro que queda en `AppAll/specs/`: declara el corte y
documenta el plan completo, para que el historial de este repo no tenga un salto sin
explicación.

## Plan completo (fases, cortadas por capa)

| Fase | Qué hace | Repo/carpeta |
|---|---|---|
| 0 — Andamiaje | Cortar remote al molde, borrar Mongo/NextAuth/Stripe/R2/blog/admin-CMS/leads (fuera de alcance de Sonópolis), agregar `@supabase/ssr` + `@supabase/supabase-js`, `config.js` de Sonópolis | `sonopolisWeb` |
| 1 — Auth | Magic link + Google OAuth vía Supabase Auth (mismo `auth.users` que el nativo), guard de rutas en cada `layout.js` (sin `middleware.js`, sigue la convención del molde) | `sonopolisWeb` |
| 2 — Público | Cartelera y Locales como Server Components, fetch directo a Supabase, sin el patrón de fallback a mock de los contexts RN | `sonopolisWeb` |
| 3 — Compra | Llama a `create-preference`/`webhook-mp` sin tocarlas; confirmación con polling | `sonopolisWeb` |
| 4 — Dashboard músico | Perfil (+ Supabase Storage, funcionalidad nueva), eventos, equipo, ventas, entradas con QR, escáner | `sonopolisWeb` |
| 5 — Dashboard local | Perfil de local + reutiliza componentes de la Fase 4 | `sonopolisWeb` |
| 6 — Corte | Deploy en paralelo, verificación de punta a punta, `APP_WEB_URL` actualizado, dominio apuntado a `sonopolisWeb` | `sonopolisWeb` + secrets de Supabase |

Plan completo, con el mapeo pantalla→ruta y las decisiones de diseño, aprobado por
Victor y replicado en `sonopolisWeb/specs/w001-andamiaje.md`.

## Explícitamente fuera de alcance de esta migración

- El rename `cafe` → `local` en `profiles.role` — sigue como deuda, spec aparte.
- La doble fuente del rol (`user_metadata.role` vs `profiles.role`) — se porta tal
  cual, sin arreglar.
- El bug `monto`/`precio` sin conectar (spec 021, problema 0c).
- Login con Google (spec 042) — sigue bloqueado por credenciales.

## Estado

Fase 0 (andamiaje) aplicada en `sonopolisWeb` — ver `sonopolisWeb/specs/w001-andamiaje.md`
para el detalle de qué se borró y qué se agregó. `yarn build` limpio. Fases 1-6
pendientes.
