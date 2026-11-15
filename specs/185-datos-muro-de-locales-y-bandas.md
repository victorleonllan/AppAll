# Spec 185 — El muro de locales y bandas: publicaciones, comentarios y eventos pasados

> Estado: aplicado (14-nov-2026) — migración escrita, **sin pushear a producción** (el push lo pide Victor o lo corre la cadena): `supabase/migrations/20261114202000_spec_185_muro.sql`. Verificado en un Postgres 17 local desechable con réplicas mínimas de `auth`, `venues`, `profiles`, `artists`, `events`, `crm_correos` y `es_admin_sonopolis`: los criterios 1 a 5 pasan (migración corrida dos veces; `anon` lee y no inserta; eventos pasados solo con flyer, ya ocurridos, publicados y visibles; `muro_comentar` con sus cuatro errores y el undécimo comentario rechazado; borrado por autor, dueño del muro y admin, y cascada al quitar la publicación). Faltan el criterio 6 (`supabase db push --linked`) y repetir 2-5 contra producción en transacción abortada. `tsc` limpio fuera de `supabase/functions`.
> Capa: DATOS. Migración nueva en `supabase/migrations/` (`<timestamp>_spec_185_muro.sql`).
> Depende de: spec 074 (`es_admin_sonopolis`), `crm_correos` (W-198), `events`, `artists`, `venues`, `profiles`. No hay otra migración pendiente al diseñarlo (`supabase migration list`: ninguna fila sin `remote`, última `20261027120000`).
> Alimenta: `sonopolisWeb` W-279 (LÓGICA) → W-280 y W-281 (FRONTEND); specs 186 (LÓGICA) → 187 (FRONTEND) de la app.

> **En una frase:** dos tablas nuevas —las publicaciones del muro de un local o banda y los
> comentarios que deja el público— más las funciones que dicen qué eventos pasados van en cada
> muro y que guardan un comentario con el nombre real de quien lo escribe.

## Motivo

Pedido de Victor (14-nov-2026): «cada vez que manden un correo se publica publicamente en el
perfil publico de musicos o locales. y el perfil fan puede dejar comentarios. la idea es que
el muro de locales y muscios (lo que ven los fans al entrar a ver el perfil de musico o local)
tenga un muro con el historial de ese tipo de publicacion o de correos, todo aprte de un correo
enviado y va la copia de ese correo al muro del local o musico. la idea es hacer una proto red
social. El muro contempla los flyers de los eventos pasados y estos correos que se publican
tambien n ese muro.»

## Por qué estas tablas y no reutilizar `crm_correos`

- `crm_correos` tiene columnas que no son públicas (`enviado_por`, `segmento`,
  `destinatarios`) y la RLS recorta por fila, no por columna. Hacerla pública las expondría.
- Los correos ya enviados antes de este spec se mandaron sin saber que serían públicos. Con
  tabla aparte no se publican solos: el muro empieza vacío de correos (hoy `crm_correos` tiene
  0 filas, así que no se pierde nada).
- **Los flyers de eventos pasados no se copian a ninguna tabla**: salen de `events` con una
  función. Copiarlos obligaría a sincronizar cada edición o cancelación de un evento.
- Los perfiles de fans no son públicos (`profiles` solo deja leer músicos y la fila propia).
  Por eso el comentario guarda el nombre de su autor al crearse, y lo escribe una función del
  servidor: si lo mandara el cliente, cualquiera firmaría con el nombre de otro.

## Decisión

Migración idempotente (`create table if not exists`, `create or replace`, `drop policy if exists`).

### `public.muro_publicaciones`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `tenant_type` | `text not null` | `check (tenant_type in ('venue', 'musician'))` |
| `tenant_id` | `uuid not null` | `venues.id` o `profiles.id` |
| `correo_id` | `uuid unique` | `references public.crm_correos(id) on delete set null` — el correo del que es copia |
| `titulo` | `text not null` | `check (char_length(titulo) between 1 and 120)` — el asunto |
| `cuerpo` | `text not null` | `check (char_length(cuerpo) between 1 and 3000)` — texto plano |
| `created_at` | `timestamptz not null` | `default now()` |

Índice `(tenant_type, tenant_id, created_at desc)`.

RLS activada:

- `select` para `anon` y `authenticated`: `using (true)`. El muro es público.
- `delete` para `authenticated`: `using (public.muro_es_dueno(tenant_type, tenant_id))`.
- Sin policy de `insert` ni `update`: inserta el servidor con `service_role` al mandar el correo
  (W-279). Una publicación no se edita: se quita.

### `public.muro_comentarios`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `tenant_type`, `tenant_id` | como arriba | el muro donde se escribió |
| `publicacion_id` | `uuid` | `references public.muro_publicaciones(id) on delete cascade` |
| `event_id` | `uuid` | `references public.events(id) on delete cascade` |
| `autor_id` | `uuid not null` | `references auth.users(id) on delete cascade` |
| `autor_nombre` | `text not null` | lo pone `muro_comentar`, nunca el cliente |
| `cuerpo` | `text not null` | `check (char_length(cuerpo) between 1 and 500)` |
| `created_at` | `timestamptz not null` | `default now()` |

`check (num_nonnulls(publicacion_id, event_id) = 1)`: un comentario es de una publicación o
de un evento pasado, nunca de los dos ni de ninguno.

El comentario de un evento lleva también el muro (`tenant_type`, `tenant_id`): el mismo evento
sale en el muro del local y en el de la banda, y cada muro tiene sus propios comentarios y su
propio dueño que modera.

Índices: `(publicacion_id, created_at)` y `(tenant_type, tenant_id, event_id, created_at)`.

RLS activada:

- `select` para `anon` y `authenticated`: `using (true)`.
- `delete` para `authenticated`: `using (autor_id = auth.uid() or public.muro_es_dueno(tenant_type, tenant_id))`.
- Sin policy de `insert` ni `update`: se escribe solo con `muro_comentar`.

### `public.muro_es_dueno(p_tenant_type text, p_tenant_id uuid) returns boolean`

`stable`, `security definer`, `set search_path = public`. Verdadero si:

- `p_tenant_type = 'musician'` y `p_tenant_id = auth.uid()`, o
- `p_tenant_type = 'venue'` y existe `venues` con `id = p_tenant_id` y `owner_id = auth.uid()`, o
- `public.es_admin_sonopolis()`.

`grant execute` a `authenticated`.

### `public.muro_evento_es_de(p_tenant_type text, p_tenant_id uuid, p_event_id uuid) returns boolean`

`stable`, `security definer`, `set search_path = public`. Verdadero si el evento existe y:

- `status not in ('draft', 'cancelled')`, `coalesce(visible_en_cartelera, true)`,
  `comienza_at < now()`, `imagen is not null and imagen <> ''`; y
- pertenece a ese muro: con `'venue'`, `events.venue_id = p_tenant_id`; con `'musician'`,
  `events.created_by = p_tenant_id` **o** existe `artists` con `id = events.artist_id` y
  `profile_id = p_tenant_id` (la misma regla de `cuentasDelEvento`, W-194).

La regla de «qué evento va en qué muro» vive solo acá: la usan `muro_eventos_pasados` y
`muro_comentar`. `grant execute` a `anon` y `authenticated`.

### `public.muro_eventos_pasados(p_tenant_type text, p_tenant_id uuid, p_limite int default 30)`

`stable`, `security definer`, `set search_path = public`. Devuelve
`table (id uuid, artist_name text, venue_name text, comienza_at timestamptz, imagen text)`:
los eventos con `muro_evento_es_de(...)` verdadero, `order by comienza_at desc`,
`limit least(greatest(p_limite, 1), 100)`. `grant execute` a `anon` y `authenticated`.

Un evento con `comienza_at` nulo no entra: no se sabe si ya pasó.

### `public.muro_comentar(p_tenant_type text, p_tenant_id uuid, p_publicacion_id uuid, p_event_id uuid, p_cuerpo text) returns public.muro_comentarios`

`security definer`, `set search_path = public`. En este orden:

1. `auth.uid()` nulo → `raise exception 'sin_sesion' using errcode = '42501'`.
2. `btrim(p_cuerpo)` vacío o de más de 500 caracteres → `'comentario_invalido'` (`22023`).
3. `num_nonnulls(p_publicacion_id, p_event_id) <> 1` → `'destino_desconocido'` (`22023`).
4. Con `p_publicacion_id`: debe existir en `muro_publicaciones` con ese `tenant_type` y
   `tenant_id`. Con `p_event_id`: `muro_evento_es_de(...)` debe ser verdadero. Si no →
   `'destino_desconocido'` (`22023`).
5. Más de 10 comentarios de `auth.uid()` en los últimos 10 minutos (en todos los muros) →
   `'demasiados_comentarios'` (`P0001`). Es el freno contra spam.
6. `autor_nombre` = `coalesce(nullif(btrim(profiles.nombre), ''), 'Fan')` de la fila de
   `auth.uid()`. Nunca el correo.
7. Inserta y devuelve la fila.

`revoke all … from public, anon; grant execute … to authenticated`.

**Comenta cualquier cuenta con sesión** (fan, músico o local), no solo las de rol fan: Victor
pidió «el perfil fan», y un músico que comenta en el muro de un local es la misma
conversación. Decisión de diseño, reversible con un `if` en el paso 1.

## Criterios de aceptación

Se verifican en producción dentro de una transacción abortada (`begin;` + bloque `DO` que
termina en `raise exception`), como el spec 161, sin dejar filas. Para simular un usuario:
`set local role authenticated` y `set local request.jwt.claims`.

1. La migración corre dos veces sin error.
2. `anon` lee `muro_publicaciones` y `muro_comentarios` (0 filas, sin error) y **no** puede
   insertar en ninguna de las dos (`42501`).
3. `muro_eventos_pasados('venue', <un venue con eventos pasados con flyer>)` devuelve filas,
   todas con `comienza_at < now()` e `imagen` no vacía; con un uuid inexistente, 0 filas.
4. `muro_comentar` como `authenticated`: sobre un evento pasado de ese muro inserta y devuelve
   `autor_nombre` igual a `profiles.nombre` de quien llama; con `p_cuerpo = '   '` →
   `comentario_invalido`; con los dos destinos nulos → `destino_desconocido`; con un evento de
   **otro** local → `destino_desconocido`; el undécimo comentario en 10 minutos →
   `demasiados_comentarios`. Como `anon` → `permission denied` o `sin_sesion`.
5. Borrado: el autor borra su comentario; otra cuenta que no es dueña del muro no puede (0
   filas afectadas); el dueño del muro sí; el admin sí. Una publicación la borra su dueño y sus
   comentarios se van con ella (`on delete cascade`).
6. `supabase db push --linked` aplica solo esta migración (lo corre la cadena si es la única
   pendiente).

## Fuera de alcance

- Publicar el correo en el muro al enviarlo → W-279 de `sonopolisWeb`.
- Me gusta, respuestas a comentarios, notificaciones y fotos en los comentarios.
- Publicaciones que no nacen de un correo (un redactor propio del muro).

## Abierto

- **Reportar un comentario.** Hoy modera el dueño del muro y el admin; no hay botón de
  «reportar» para el público.
