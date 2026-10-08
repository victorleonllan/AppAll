# Spec 113 — Redes sociales del CRM: cuentas conectadas, publicaciones y su cola (datos)

> Estado: **Aplicado (07-oct-2026) — migración escrita, NO pusheada a producción.** `20261007180000_spec_113_redes_sociales_del_crm.sql`. Verificado en un Postgres local con stubs de `auth`, `storage`, `vault`, `cron` y `net`: los 7 criterios pasan (5 tablas con RLS y 0 policies; `authenticated` ve 0 filas y no ejecuta `redes_tomar_destinos`; check `x`+`meta` rechazado; estados `programada`→`parcial`→`cancelada`; dos sesiones concurrentes toman destinos distintos y el colgado de 11 min queda `fallida`; bucket 100 MB; 2 jobs y `redes_tick()` sin `cron_secret` no encola nada). Falta: `supabase db push` y crear `cron_secret` en el vault.
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_113_redes_sociales_del_crm.sql`.
> Depende de: `events` (para `evento_id`), `vault` y las extensiones `pg_cron` y `pg_net` de Supabase.
> Alimenta: `sonopolisWeb` W-233 (núcleo), W-234 (Meta), W-235 (Zernio), W-236 (orquestador), W-237/W-238/W-239 (pantallas).
> ⚠️ Capa DATOS de a una: si otra migración está creada y sin pushear (p. ej. la de W-224), esta espera.

> **En una frase:** cinco tablas que solo lee el servidor (las cuentas de redes que conecta
> cada local o banda, con su token cifrado; la selección de página de Facebook a medio
> hacer; el perfil de Zernio de cada tenant; las publicaciones; y un destino por red con su
> estado), una función que reparte destinos sin que dos procesos tomen el mismo, un bucket
> público `redes` para los medios y un disparador de `pg_cron` que llama al orquestador de
> la web cada minuto solo cuando hay algo por publicar.

## Motivo

Pedido de Victor: que los locales y bandas con Sonópolis Pro conecten Instagram, Facebook,
Threads, X y TikTok, y publiquen desde el CRM, tanto un post libre como el anuncio de un
evento, al momento o programado.

Decisiones de producto ya tomadas (detalle en la nota del vault «Plan — Publicar en redes
desde el CRM»):

- **Integración mixta.** Instagram, Facebook y Threads van por la API de Meta, con una app
  propia de Sonópolis: es gratis por cuenta y se aprueba en una sola revisión de app. X y
  TikTok van por **Zernio**, un servicio que publica en varias redes con una sola API: TikTok
  exige una auditoría propia y X cobra cada llamada, y Zernio ya resolvió las dos cosas.
- **Solo Sonópolis Pro.** El gate de fecha (`sonopolis_pro_hasta`) se revisa en la web, en
  pantalla y en el servidor; esta migración no lo duplica.

## Decisión

### Por qué todo vive en tablas sin policies

Las cinco tablas tienen RLS activado y **ninguna policy**. Solo las lee y escribe el
`service_role`, desde las API routes de la web, después de comprobar con la sesión del
usuario que el tenant es suyo y que tiene Pro. Mismo criterio que `venue_owner_invites`
(W-230) y `privado.crm_base` (W-198).

Se descartó dejar que el tenant lea `redes_publicaciones` por RLS: el tenant es polimórfico
(`venue` o `musician`) y la pertenencia ya se resuelve en JS con `getTenantPropio`. Una
segunda copia de esa regla en SQL se desincroniza, como pasó con la regla del dueño del
evento, que hoy vive en tres lugares (#34 de `W-PENDIENTES.md`).

Los tokens se guardan **cifrados por la web** (AES-256-GCM, la llave vive solo en Vercel).
Si se filtra la base, no se filtran los accesos a las cuentas de nadie. Por eso la columna
es `text` y la base nunca ve el token en claro.

### 1. `redes_conexiones` — una cuenta conectada por red y tenant

```
id                  uuid pk default gen_random_uuid()
tenant_type         text not null check in ('venue','musician')
tenant_id           uuid not null
red                 text not null check in ('instagram','facebook','threads','x','tiktok')
proveedor           text not null check in ('meta','zernio')
cuenta_externa_id   text not null   -- id de la cuenta de Instagram, de la página de Facebook,
                                    -- del usuario de Threads, o accountId de Zernio
usuario_externo_id  text            -- id del usuario dentro de la app de Meta (app-scoped);
                                    -- es el que llega en las llamadas de baja de Meta
cuenta_nombre       text            -- @usuario o nombre de la página
cuenta_avatar       text            -- URL de la foto de perfil
token_cifrado       text            -- null en Zernio (el token lo guarda Zernio)
token_expira_at     timestamptz     -- null = no vence (token de página de Facebook)
estado              text not null default 'activa' check in ('activa','reconectar')
error               text            -- por qué hay que reconectar, legible
conectada_por       uuid not null references auth.users(id)
created_at          timestamptz not null default now()
updated_at          timestamptz not null default now()
unique (tenant_type, tenant_id, red)
check ((red in ('instagram','facebook','threads')) = (proveedor = 'meta'))
```

- **Una cuenta por red y tenant.** Un local que quiere publicar en dos páginas de Facebook
  queda fuera de alcance: complica la pantalla y nadie lo pidió.
- `tenant_id` no tiene FK porque apunta a `venues` o a `profiles` según `tenant_type`. Las
  conexiones de un tenant borrado las limpia el mantenimiento de la web (W-236).
- Índice en `(proveedor, usuario_externo_id)`, para resolver la baja que avisa Meta.
- Trigger `updated_at` con la función que ya usan las demás tablas, si existe. Si no existe,
  se crea una local a esta migración.

### 2. `redes_conexiones_pendientes` — elegir la página de Facebook

```
id                uuid pk default gen_random_uuid()
tenant_type       text not null check in ('venue','musician')
tenant_id         uuid not null
red               text not null check (red = 'facebook')
opciones_cifradas text not null   -- lista de páginas con su token, cifrada por la web
creada_por        uuid not null references auth.users(id)
expira_at         timestamptz not null default now() + interval '15 minutes'
```

Cuando quien conecta administra varias páginas, la web guarda la lista acá y le pregunta
cuál usar. Se descartó guardar la lista en una cookie porque lleva tokens de página.

### 3. `redes_zernio_perfiles` — el perfil de Zernio de cada tenant

```
tenant_type  text not null check in ('venue','musician')
tenant_id    uuid not null
perfil_id    text not null unique   -- _id del perfil en Zernio (24 caracteres)
created_at   timestamptz not null default now()
primary key (tenant_type, tenant_id)
```

En Zernio, un perfil agrupa las cuentas de un cliente. Uno por tenant aísla las cuentas de
cada local o banda dentro de la cuenta única de Sonópolis.

### 4. `redes_publicaciones` — lo que el tenant redactó

```
id               uuid pk default gen_random_uuid()
tenant_type      text not null check in ('venue','musician')
tenant_id        uuid not null
evento_id        uuid references public.events(id) on delete set null
texto            text not null default ''
textos_por_red   jsonb not null default '{}'   -- {"x": "...", "instagram": "..."}; si falta, va `texto`
medios           jsonb not null default '[]'   -- [{path, url, tipo:'imagen'|'video', ancho, alto, duracion}]
opciones_por_red jsonb not null default '{}'   -- {"tiktok": {privacidad, comentarios, ...}}
programada_para  timestamptz                   -- null = ahora
estado           text not null default 'programada'
                 check in ('programada','publicando','publicada','parcial','fallida','cancelada')
creada_por       uuid not null references auth.users(id)
created_at       timestamptz not null default now()
updated_at       timestamptz not null default now()
```

Índice en `(tenant_type, tenant_id, created_at desc)` para el historial.

`estado` **no lo escribe nadie a mano**: lo calcula el trigger del punto 6 a partir de los
destinos. Así la pantalla no puede mostrar «publicada» mientras una red sigue fallando.

### 5. `redes_destinos` — una fila por red de cada publicación

```
id               uuid pk default gen_random_uuid()
publicacion_id   uuid not null references redes_publicaciones(id) on delete cascade
red              text not null check in ('instagram','facebook','threads','x','tiktok')
conexion_id      uuid references redes_conexiones(id) on delete set null
estado           text not null default 'pendiente'
                 check in ('pendiente','publicando','esperando','publicada','fallida','cancelada')
listo_at         timestamptz not null   -- desde cuándo se puede tomar
tomado_at        timestamptz            -- última vez que un proceso lo tomó
esperando_desde  timestamptz            -- primera vez que quedó 'esperando'
intentos         int not null default 0
contenedor_id    text   -- contenedor de Meta o post de Zernio que todavía se está procesando
externo_id       text   -- id del post ya publicado en la red
url_externa      text   -- link público al post
error            text
publicado_at     timestamptz
unique (publicacion_id, red)
```

Índice parcial en `(listo_at) where estado in ('pendiente','esperando','publicando')`.

**Por qué existe `esperando`.** Instagram, Threads y TikTok no publican en una sola llamada:
primero reciben el medio («contenedor»), lo procesan (un video puede tardar minutos) y
recién después se publica. El destino queda `esperando` con su `contenedor_id`, y el
orquestador lo vuelve a revisar en la pasada siguiente en vez de bloquear la función
esperando.

### 6. Trigger: el estado de la publicación sale de sus destinos

`after insert or update of estado on redes_destinos` → recalcula `redes_publicaciones.estado`
de la publicación afectada, ignorando los destinos `cancelada`:

| Destinos (sin contar cancelados) | Estado |
|---|---|
| No queda ninguno (todos cancelados) | `cancelada` |
| Todos `pendiente` y `programada_para > now()` | `programada` |
| Alguno `pendiente`, `publicando` o `esperando` | `publicando` |
| Todos terminados, todos `publicada` | `publicada` |
| Todos terminados, alguno `publicada` y alguno `fallida` | `parcial` |
| Todos terminados, todos `fallida` | `fallida` |

También pone `updated_at = now()`.

### 7. `redes_tomar_destinos(p_limite int default 10)` → `setof redes_destinos`

`security definer`, `volatile`. `revoke execute … from public, anon, authenticated`: solo la
llama el `service_role`. En una sola transacción:

1. **Destinos colgados.** Los `publicando` con `tomado_at < now() - interval '10 minutes'`
   pasan a `fallida` con el error «La publicación se cortó a mitad de camino. Revisa tu
   cuenta antes de reintentar: puede que se haya publicado.». **No se reintentan solos**:
   si el proceso murió justo después de que la red aceptó el post, reintentar lo
   duplicaría en la cuenta del local, y un post duplicado se ve peor que uno que falló.
2. **Toma.** Hasta `p_limite` destinos con `estado in ('pendiente','esperando')` y
   `listo_at <= now()`, ordenados por `listo_at`, con `for update skip locked`. Pasan a
   `publicando` con `tomado_at = now()`, e `intentos + 1` solo si venían de `pendiente`
   (revisar un contenedor no es un intento nuevo). Los devuelve.

`skip locked` es lo que permite que el cron de cada minuto y el «publicar ahora» de la web
corran a la vez sin tomar el mismo destino dos veces.

### 8. Bucket `redes`

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('redes', 'redes', true, 104857600,
        array['image/jpeg','video/mp4','video/quicktime'])
on conflict (id) do nothing;
```

- **Público**, porque Instagram, Threads, Facebook y Zernio descargan el medio desde una URL.
  No se puede firmar la URL, porque Meta la baja minutos después y una URL firmada puede
  vencer antes.
- **Solo JPEG** en imágenes, porque la API de Instagram solo acepta JPEG. La web convierte la
  imagen antes de subirla (W-236).
- **100 MB.** Si el límite global del proyecto en Supabase es menor, manda el global: se
  verifica con `select file_size_limit from storage.buckets where id = 'redes'` y en
  Settings → Storage. La web valida el mismo tope antes de subir.
- **Sin policies de `storage.objects`.** La web sube con una URL de subida firmada que
  genera el `service_role` (`createSignedUploadUrl`) para una ruta
  `<tenant_type>/<tenant_id>/<uuid>.<ext>`. Nadie más puede escribir en el bucket.

### 9. El disparador: `pg_cron` + `pg_net`

**Por qué no un cron de Vercel.** El plan Hobby de Vercel permite 2 crons diarios, y los dos
ya están usados (scraping y reconciliación; ver el comentario en
`sonopolisWeb/app/api/cron/reconciliar-pagos/route.js`). Una publicación programada para
las 20:00 necesita salir a las 20:00, no al día siguiente.

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
```

- `redes_llamar_web(p_ruta text)`: `security definer`, `revoke` de todos. Lee de
  `vault.decrypted_secrets` los secretos `sonopolis_web_url` y `cron_secret`. **Si falta
  alguno, no hace nada** (`return`). Si están, hace
  `net.http_get(url := base || p_ruta, headers := {"Authorization": "Bearer " || secreto}, timeout_milliseconds := 5000)`.
  `pg_net` no espera la respuesta: la función de Vercel sigue corriendo aunque Postgres ya
  haya soltado la conexión.
- `redes_tick()`: `security definer`, `revoke` de todos. Llama a
  `redes_llamar_web('/api/cron/redes-publicar')` **solo si existe** algún destino
  `pendiente`/`esperando` con `listo_at <= now()`. Así, el 99 % de los minutos no hay ninguna
  llamada HTTP.
- Jobs:
  - `cron.schedule('redes-publicar', '* * * * *', 'select public.redes_tick()')`
  - `cron.schedule('redes-mantenimiento', '0 8 * * *', $$select public.redes_llamar_web('/api/cron/redes-mantenimiento')$$)`
    (08:00 UTC = 04:00 o 05:00 en Chile).
  Si un job con ese nombre ya existe, se reemplaza (`cron.unschedule` antes, dentro de un
  `do $$ … $$` que tolere que no exista).
- Secretos:
  - `sonopolis_web_url` **se crea en la migración** con `vault.create_secret('https://sonopolis.org', 'sonopolis_web_url')`,
    solo si no existe. No es secreto, pero así los dos valores se leen igual.
  - `cron_secret` **no va en la migración**: un secreto en un `.sql` versionado deja de ser
    secreto. Victor lo crea una vez en el SQL editor con el mismo valor de `CRON_SECRET` de
    Vercel: `select vault.create_secret('<valor>', 'cron_secret');`. Mientras no exista, el
    disparador no hace nada y el «publicar ahora» igual funciona (W-236 lo dispara desde la
    request).

## Lo que esta migración NO hace

- No revisa Pro. El gate es la fecha y vive en la web (pantalla y API route), igual que el
  correo del CRM. El orquestador lo vuelve a mirar al momento de publicar (W-236).
- No borra medios viejos del bucket: eso lo hace el mantenimiento de la web.
- No toca la app nativa. Las tablas son nuevas y nadie más las lee.

## Criterios de aceptación

1. Las cinco tablas existen con RLS activado y sin policies:
   `select tablename, rowsecurity from pg_tables where tablename like 'redes_%'` → 5 filas
   `true`, y `select count(*) from pg_policies where tablename like 'redes_%'` → 0.
2. Con rol `authenticated`, `select * from redes_conexiones` devuelve 0 filas aunque haya
   datos, y `select redes_tomar_destinos()` falla por permiso.
3. Insertar `red='x', proveedor='meta'` en `redes_conexiones` falla por el check.
4. En una transacción revertida: una publicación con dos destinos `pendiente` y
   `programada_para` en el futuro queda `programada`; un destino a `publicada` y el otro a
   `fallida` → `parcial`; los dos a `cancelada` → `cancelada`.
5. En una transacción revertida: dos llamadas a `redes_tomar_destinos(1)` desde dos sesiones
   concurrentes toman destinos distintos. Un destino `publicando` con `tomado_at` de hace 11
   minutos queda `fallida` tras la llamada, con el mensaje del punto 7.
6. `select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'redes'`
   devuelve el bucket público, con 104857600 o el tope que permita el proyecto.
7. `select jobname, schedule from cron.job where jobname like 'redes-%'` → 2 filas. Sin el
   secreto `cron_secret`, `select redes_tick()` no falla y no deja nada en `net.http_request_queue`.

## Fuera de alcance

- Varias cuentas de la misma red por tenant.
- Métricas de los posts (alcance, likes). Zernio las ofrece; sería otro spec.
- Responder comentarios o mensajes directos.
- La app móvil: estas pantallas son solo de la web.
