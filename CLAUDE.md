# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

`AGENTS.md` cubre estructura de carpetas, tema visual y convenciones de código, y **no se
modifica sin spec explícito**. Este archivo cubre lo operativo y lo que solo se entiende
leyendo varios archivos a la vez.

## Comandos

```bash
npm start              # Expo dev server
npm run web            # dev en navegador
npm run ios/android    # dev en nativo
npm run build:web      # expo export --platform web → dist/
npm run deploy:web     # vercel --prod
npx tsc --noEmit       # typecheck
```

**`tsc` siempre reporta errores en `supabase/functions/`** (`Cannot find name 'Deno'`, imports
por URL). Son esperados: esas funciones corren en Deno, no en el tsconfig del proyecto.
Para ver solo lo que importa:

```bash
npx tsc --noEmit 2>&1 | grep -v "supabase/functions"
```

**No hay tests en el repo.** Es deliberado hasta cerrar el spec 021 — ver `specs/PENDIENTES.md`,
spec 026. No inventes un runner: la arquitectura de testing ya está diseñada en el vault
(`Hermes/Agentes/Arquitectura Testing/V-Model-Testing.md`).

## Especificaciones — el flujo de trabajo del repo

Los specs en `specs/` son el registro de decisiones del proyecto, no documentación posterior.

- **Un spec numerado = un commit.** Nueva funcionalidad = spec nuevo.
- **Los specs aplicados no se editan.** Si algo cambia, se escribe el siguiente número.
- `specs/README.md` — índice de estado y las convenciones que no se improvisan.
- `specs/PENDIENTES.md` — inventario de lo detectado y **no** corregido, con orden sugerido.

⚠️ **"Aplicado" no significa "verificado".** El flujo de compra estuvo 20 specs sin completarse
ni una vez. Antes de dar algo por bueno, confírmalo contra la base o contra la app corriendo.

## Tres estados que se desincronizan

Repo, backend y frontend se despliegan por caminos distintos, y en la práctica **nunca están en
la misma versión**. Auditoría del 8-ago-2026: `create-preference` corría el código nuevo,
`webhook-mp` uno de nueve días antes, y Vercel un build de tres días antes que todavía mandaba
la anon key —la misma causa raíz que el spec 021 ya había arreglado en disco—.

Antes de diagnosticar cualquier bug de runtime, **verifica qué corre de verdad en cada capa**:

```bash
git status                              # ¿el fix está commiteado?
curl -s <URL_WEB>/ | grep -o '/_expo/static/js/web/[^"]*\.js'   # bundle en producción
supabase secrets list                   # ¿los secrets existen?
```

Y del lado de Supabase, con el MCP: `get_edge_function` devuelve el **código desplegado**
(no el del repo), `get_logs` da la ventana de 24 h, y `list_migrations` dice qué migraciones
están registradas en la base.

Un arreglo no existe hasta que está en las tres capas. Cerrar un spec sin desplegar deja el
sistema peor que antes: el repo dice que está resuelto y producción sigue rota.

## Arquitectura

### Tres roles, una app

`src/navigation/index.tsx` arma un tab navigator donde **la tercera pestaña cambia según el
rol**: `musician` → `MusicoStack`, `cafe` → `MiLocalStack`, `public` → `PerfilScreen`, sin sesión
→ `AuthScreen`. Los dos primeros tabs (Cartelera, Locales) son públicos.

⚠️ **El rol de navegación sale de `session.user.user_metadata.role`, no de `profiles.role`.**
Son dos fuentes distintas para el mismo concepto y pueden divergir. Cambiar el rol de un
usuario real implica migrar `auth.users.raw_user_meta_data`, que es un spec aparte.

### Providers con fallback a mock — el que más confunde

`VenuesContext` y `EventosContext` arrancan con datos mock y hacen `setUseMock(false)` solo si
Supabase responde. Si la conexión falla, **la app se ve perfectamente bien con datos falsos** y
las escrituras se quedan en memoria local sin llegar a la base.

Si algo "funciona" pero no aparece en Postgres, sospecha de esto primero.

⚠️ **Con `events` vacío el fallback se muerde la cola.** `setUseMock(false)` solo ocurre si la
consulta devuelve **filas**, y `createEvento` solo escribe en Supabase si `useMock` es `false`.
Con 0 eventos en la base, publicar un evento desde la app lo deja **solo en memoria** y
desaparece al recargar — no hay forma de sembrar el primer evento desde la UI. La cartelera,
además, no se ve vacía: muestra los 5 eventos mock, cuyos ids (`"1"`, `"2"`…) dan 404 al comprar.

⚠️ **`createVenue` falla en silencio.** `mapVenueToDB` manda `owner_id: null` y la policy
`venues_insert` exige `auth.uid() = owner_id`: el insert se rechaza, el `catch {}` se lo traga y
devuelve un venue falso. Mismo patrón — un `catch` vacío convirtiendo un error de RLS en éxito
aparente.

Los providers también son el único punto de mapeo snake_case (DB) ↔ camelCase (frontend):
`mapEventoFromDB` / `mapEventoToDB` en `EventosContext.tsx`. Un campo nuevo se agrega en los dos.

### El flujo de compra

Cruza cliente, dos Edge Functions y Mercado Pago. Ningún archivo lo cuenta entero:

```
DetalleEventoScreen ──POST access_token──▶ create-preference (Edge Function)
                                                │
                                    inserta ticket 'pending'
                                    crea preferencia en MP
                                                │
                          ◀── init_point ───────┘
        window.open(checkout) en pestaña nueva
                    │
ConfirmacionCompraScreen ──polling cada 3s, ventana 3 min──▶ tickets.status
                                                                    ▲
Mercado Pago ──notificación──▶ webhook-mp (service role) ───────────┘
```

Puntos que ya costaron caro y conviene no repetir:

- **`create-preference` valida con `supabase.auth.getUser()`.** Hay que mandarle el
  `access_token` de la sesión, **no** la anon key: con la anon key devuelve `null` y corta en 401.
- **`create-preference` lleva CORS; `webhook-mp` no lo necesita** (lo llama MP servidor a
  servidor). La web vive en otro origen: sin headers en *todas* las respuestas de
  `create-preference` —incluidas las de error— el navegador bloquea la llamada y el detalle
  del fallo se pierde.
- **La confirmación llega por webhook, no por la back_url.** El checkout se abre en pestaña
  nueva y la original hace polling. Las `back_urls` deben ser HTTPS (`APP_WEB_URL`), nunca el
  scheme nativo `appall://`.
- **El webhook devuelve 500 ante error real.** MP solo reintenta lo que no es 2xx; un `200`
  optimista deja el pago cobrado y el ticket colgado para siempre.

### Edge Functions

`create-preference` y `webhook-mp`, ambas con **`verify_jwt: false`** (hacen su propia
validación; MP no manda JWT). Secrets: `MERCADOPAGO_ACCESS_TOKEN`, `APP_WEB_URL`.

⚠️ **`APP_WEB_URL` todavía no está seteado** (verificado el 8-ago con `supabase secrets list`):
la function cae al fallback hardcodeado. Funciona, pero un deploy de preview apunta sus
`back_urls` a producción.

Desplegando con el MCP de Supabase hay que pasar `import_map_path: "deno.json"` explícito —
si no, arrastra la ruta absoluta del deploy anterior y falla.

### Base de datos

Tablas: `venues`, `events`, `profiles`, `tickets`. Proyecto Supabase `xluinfihjjtxkglihxqz`.

**El esquema se versiona en `supabase/migrations/`** desde el spec 018; antes vivía solo en el
dashboard. Para no volver atrás:

> Escribe primero el archivo `.sql` en `supabase/migrations/`, y recién después aplícalo.

`apply_migration` del MCP escribe en producción y la registra en `supabase_migrations`, pero
**no crea el archivo** — usarlo solo desincroniza el repo de la base en silencio.

⚠️ **No hay entorno local ni respaldo** (specs 024 y 025 pendientes): todo cambio de esquema va
directo a producción, en plan Free, sin PITR ni restore self-service. Un `DELETE` es
irreversible. Además el plan Free **pausa el proyecto tras ~1 semana de inactividad**.

⚠️ La cadena de migraciones **nunca se probó de punta a punta**; el baseline es una
reconstrucción razonada. Antes del primer `db push`:
`supabase migration repair --status applied 20260608000000`.

## Vocabularios que se parecen y no son lo mismo

La mayoría de los bugs del proyecto salieron de confundir estos pares. No los mezcles:

| Concepto | Nombres | Regla |
|---|---|---|
| Precio de un evento | `precio` / `monto` | `precio` es texto libre que escribe el músico (`"$5.000"`); `monto` es el entero en CLP que cobra MP. **Hoy nadie los conecta** (`mapEventoToDB` manda `monto: evento.monto ?? null`), así que todo evento creado desde la app nace sin precio cobrable — spec 021, problema 0c, documentado y sin implementar |
| Estado de pago | `paid` / `completed` | `paid` y `approved` son **de Mercado Pago**. Los estados de ticket son `pending`, `completed`, `refunded`, `cancelled` (`TicketStatus`) |
| Estado en la UI de confirmación | `success` / `failure` / `pending` / `timeout` | Vocabulario **solo** de `ConfirmacionCompraScreen`. Se traduce desde `TicketStatus`, nunca se castea |
| Tipo de local | `cafe`, `bar`, `sala`, `centro_cultural` | `'venue'` **ya no es válido**; el CHECK lo rechaza. La categoría se llama "locales" en la UI, nunca "cafés" |
| Rol de usuario | `profiles.role` = `fan`\|`musician`\|`local` | Migrado del viejo `public`/`cafe` por el spec 046 (2026-08-15). El frontend de esta app (`navigation/index.tsx`, `AuthContext.tsx`, `AuthScreen.tsx`, `RegisterScreen.tsx`) todavía compara contra `'cafe'` — sigue andando por el alias que acepta `handle_new_user()`, corregirlo es el spec 048. `admin` todavía no es un valor válido |
| Tipo de proyecto musical | `tipo_proyecto` / `tipoProyecto` / `genero` | DB / TS / estado local de formulario, en ese orden |

Fuente de verdad de los tipos: `src/types/index.ts`.

### Género musical — vocabulario cerrado, nunca texto libre

`src/constants/generos.ts` (spec 054, 174 géneros) es el único vocabulario válido para
"género"/"estilo musical" — evento, perfil de músico, perfil de local. Cualquier campo
que represente esto usa `components/GeneroPicker.tsx` (spec 056, `single` o `multiple`
según el campo), nunca un `TextInput` de texto libre — dos locales escribiendo "jazz" y
"Jazz" a mano no empatan entre sí. `EditarLocalScreen.tsx` tuvo este bug hasta el spec 063.

**Mismo array en dos repos:** `libs/constants.js` (`GENEROS_MUSICALES`) en sonopolisWeb
(spec W-035) es una copia — agregar o quitar un género hay que hacerlo en los dos, mismo
orden, mismo texto exacto (sin CHECK en ninguna de las dos bases, así que un desajuste no
falla, solo deja de matchear en silencio).

## Frontera con `sonopolisWeb`

La web de Sonópolis se migró a Next.js y vive en un repo aparte, `~/projects/sonopolisWeb`
(spec 043). Este repo sigue siendo dueño del código nativo (`src/`, `App.tsx`) y del backend
compartido (`supabase/migrations/`, `supabase/functions/`) — la web lo consume, no lo duplica.

Para que una sesión de Claude Code trabajando en un repo no edite el otro **sin que Victor se
dé cuenta**, `.claude/settings.json` en ambos repos pone un límite técnico, no solo una
convención escrita:

- Este repo tiene bloqueado (`deny`) escribir en el código de `sonopolisWeb` (`app/`,
  `components/`, `libs/`, config, specs) — no hay ningún caso legítimo en el que haga falta.
- `sonopolisWeb` tiene bloqueado escribir en el código nativo de este repo (`src/`, `App.tsx`,
  config), pero **puede pedir permiso** (`ask`, no `deny`) para escribir en `supabase/` y
  `specs/` — porque un cambio de esquema que arranca en la web sigue siendo, por diseño, un
  spec de este repo (ver `sonopolisWeb/CLAUDE.md`, sección "La regla que gobierna todo").

Si una sesión de este repo necesita tocar algo de `sonopolisWeb`, es señal de que el pedido no
es de este repo — avísale a Victor en vez de forzarlo.

## Contexto externo

- **Mercado Pago**: Checkout Pro, cuenta de Chile (`site_id: MLC`, `currency_id: 'CLP'`).
  Credenciales de **prueba** todavía; pasar a producción exige cerrar el spec 022.
- **Deploy web**: Vercel, `app-all-lemon.vercel.app`. `vercel.json` manda sobre la config del
  dashboard (que tiene valores que no coinciden con el proyecto, pero son inocuos).
- **Documentación larga** vive en el vault de Obsidian del usuario, no acá.
- El proyecto se llamaba **AppAll**; el nombre actual es **Sonópolis**. Ambos aparecen en el
  código y en la infraestructura.
