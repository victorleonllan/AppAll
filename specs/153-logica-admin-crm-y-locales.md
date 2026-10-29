# Spec 153 — Lógica del admin en la app: CRM de cada tenant, Sonópolis Pro y Locales

> Estado: aplicado (29-oct-2026) — `npx tsc --noEmit` sin errores, `expo export --platform web` sin error, sin `catch {}` vacíos (criterios 1-3); criterio 9 verificado con tsx sobre `filtrarLocales`. Criterios 4-8 (cuenta admin, paridad con la web, `darPro` y códigos reales, W-249/W-250 desplegados) pendientes: V-candidata 153-a y 153-b
> Capa: LÓGICA. `src/lib/adminPro.ts` (nuevo), `src/hooks/useAdminCrm.ts` (nuevo), `src/hooks/useTenantAdmin.ts` (nuevo), `src/hooks/useAdminLocales.ts` (nuevo).
> Depende de: spec 152, spec 148, spec 150, W-249 de la web, W-250 de la web
> Hermano en la web: `libs/data/adminCrm.js`, `libs/data/proAdmin.js`, `libs/data/proSuscripcion.js`, `libs/data/invitacionesLocal.js`, `app/(private)/admin/crm/`, `app/(private)/admin/locales/`, `app/api/crm/correo/route.js`, `app/api/admin/locales/invitar/route.js` (W-193, W-212, W-216, W-219, W-220, W-232, W-243).

> **En una frase:** la app lee y opera lo mismo que `/admin/crm` y `/admin/locales` de la
> web —el público de cada local y banda, activar o quitar Pro, generar el código de
> suscripción, buscar locales e invitar o cancelar al dueño—, para que el spec 159 sea solo
> pantallas.

## Contexto

Sigue al spec 152, que dejó `useEsAdmin` y `src/lib/admin.ts`. Este spec no los toca; va
después para que los dos LÓGICA del admin no se crucen y el 159 los encuentre a los dos.

Lo que hace la web y de dónde lo saca:

- **Lista del CRM** (`libs/data/adminCrm.js:76-124`): lee **toda** la vista
  `crm_contactos` una vez y agrupa en JS por tenant; suma Pro (`sonopolis_pro_hasta`) y
  eventos activos de cada uno. Para contar eventos aplica la regla de a quién pertenece un
  evento, `tenantDeEvento` (`adminCrm.js:21-28`): músico creador → local → artista
  reclamado. **Esa regla es la misma de la vista SQL (W-184)**; si la app la escribiera
  distinto, contaría eventos de un tenant cuyos compradores están en el CRM de otro.
  `esActivo` (`:31-34`) define activo como próximo (o sin fecha), sin cerrar y no
  cancelado. Los músicos salen de **todos** los perfiles `role = 'musician'`, también los
  sin nombre (`:36-47`), porque la vista mira solo el rol.
- **Detalle del tenant** (`app/(private)/admin/crm/[tipo]/[id]/page.js`): el tenant
  (`venues` o `profiles`), sus contactos, sus eventos activos con la misma regla, y la
  suscripción a Pro (`cargarSuscripcion`, `:155`): RPC `admin_cuenta_del_tenant` (spec 110),
  `pro_suscripciones` y `paises_cobro`. Si la suscripción falla, el resto del CRM sigue
  viéndose. Los números de correo los pide el redactor a `GET /api/crm/correo?tenantType=&tenantId=`
  (`app/api/crm/correo/route.js:58-68`), que lee con service role y hoy solo acepta cookie;
  el **W-249** la hace aceptar el Bearer de la app.
- **Correos enmascarados.** La vista `crm_contactos` ya enmascara en la base
  (`20261005180000_spec_w198_correos_del_crm.sql:98-111`: `enmascarar_email(email)` y
  `md5(contacto_key)`). La web vuelve a enmascarar en JS; la app no necesita hacerlo.
- **Pro a mano** (`libs/data/proAdmin.js`): RPC `admin_dar_pro(p_tenant_type, p_tenant_id, p_dias)`
  (W-211; `0` días apaga Pro) y `admin_pro_sin_vencimiento` (W-242). El permiso lo decide
  `es_admin_sonopolis()` en Postgres.
- **Código de suscripción** (`libs/data/proSuscripcion.js:25-31`): Edge Function
  `crear-suscripcion-pro` con `{ tenant_type, tenant_id, monto }`. Responde CORS `*`
  (`supabase/functions/crear-suscripcion-pro/index.ts:22`), así que la app la llama con
  `supabase.functions.invoke`. `functions.invoke` envuelve cualquier no-2xx en un mensaje
  genérico; el motivo real viene en el cuerpo (`errorLegible`, `:49-66`).
- **Locales** (`libs/data/invitacionesLocal.js`): RPC `admin_buscar_locales(p_q)` (W-230).
  Invitar y cancelar van por `POST`/`DELETE /api/admin/locales/invitar`, porque crear la
  invitación y mandar el correo con Resend son un solo paso de servidor. El **W-250** hace
  que esa ruta acepte el Bearer; el **W-249** agrega `DELETE` al CORS.

`llamarApiWeb` (`src/lib/apiWeb.ts:30-58`) hoy solo acepta `GET` y `POST`.

## Diseño

Sin `catch {}` vacíos ni mocks (spec 115). **Tipos en el archivo de su hook**, no en
`src/types/index.ts`, como el 152.

### 1. `src/lib/apiWeb.ts` — lo amplía el spec 150

El spec 150 (redes) ya lleva `metodo` a `'GET' | 'POST' | 'DELETE' | 'PATCH'`, y este spec depende de él. Aquí no se toca `apiWeb.ts`: se usa `metodo: 'DELETE'` tal como lo deja el 150. (Ajuste de coordinación del 19-oct-2026, antes del primer commit: los dos specs editaban el mismo archivo.)

### 2. `src/lib/adminPro.ts` (nuevo)

```ts
export const PRO_PRECIO_USD = 20; // copia de sonopolisWeb/config.js:28 (config.pro.precioUsd)
export const PLAZOS_PRO = [{ meses: 1, dias: 30 }, { meses: 3, dias: 90 }]; // BotonesPro.js:19-22
export async function darPro(tipo: TipoTenant, id: string, dias: number): Promise<string | null>
export async function darProSinVencimiento(tipo: TipoTenant, id: string): Promise<string | null>
export async function generarCodigoPro(tipo: TipoTenant, id: string, monto: number): Promise<{ codigo: string; url: string }>
export type TipoTenant = 'musician' | 'venue';
```

- `esPro` y `esProSinVencimiento` **no se definen aquí**: se importan de `src/lib/pro.ts`
  (spec 148), pasando `{ sonopolisProHasta: proHasta }`. Una sola copia de la regla en la
  app.
- `darPro` y `darProSinVencimiento`: los dos RPC con sus parámetros exactos; tiran el
  error de la base. Quitar Pro es `darPro(tipo, id, 0)`.
- `generarCodigoPro`: `supabase.functions.invoke('crear-suscripcion-pro', { body: { tenant_type, tenant_id, monto } })`.
  Con `error`, lee `error.context` (la `Response`): si tiene `.text()`, parsea el JSON y usa
  `detail || error || message`, si no el texto crudo; tira `new Error(mensaje)`. Port de
  `errorLegible`. Sin `data.url`, arma `${URL_WEB}/pro/${codigo}` (`src/constants/web.ts`),
  igual que `CodigoSuscripcionPro.js` en la web.

### 3. `src/hooks/useAdminCrm.ts` (nuevo) — la lista

Tipos exportados:

```ts
export interface TenantCrm {
  type: TipoTenant; id: string; nombre: string; pais: string | null;
  proHasta: string | null; esPro: boolean;
  contactos: number; compradores: number; conWhatsapp: number; eventosActivos: number;
}
export interface ReglasTenant { musicosIds: Set<string>; perfilPorArtista: Map<string, string> }
export interface EventoDeTenant {
  id: string; artista: string; venueName: string | null; fecha: string; comienzaAt: string | null;
  cerradoAt: string | null; status: string; createdBy: string | null; venueId: string | null; artistId: string | null;
}
```

Funciones puras exportadas (las usa también `useTenantAdmin`):

- `tenantDeEvento(evento, reglas): { type: TipoTenant; id: string } | null` — **copia
  literal de `sonopolisWeb/libs/data/adminCrm.js:21-28`**, con un comentario que lo diga y
  que nombre la vista `crm_contactos` (W-184) como la definición de la que depende.
- `esEventoActivo(evento, ahora)` — copia de `adminCrm.js:31-34`.
- `cargarEventosYReglas()` — en paralelo:
  `events.select('id, artist_name, venue_name, fecha, comienza_at, closed_at, status, created_by, venue_id, artist_id')`
  ordenado por `comienza_at` ascendente (`nullsFirst: false`),
  `profiles.select('id').eq('role', 'musician')` (todos, también sin nombre) y
  `artists.select('id, profile_id')`. Arma `musicosIds` y `perfilPorArtista` (solo los
  artistas con `profile_id`).

`useAdminCrm()` → `{ cargando, error, bandas, locales, totalContactos, recargar }`.

En paralelo: `cargarEventosYReglas()`,
`profiles.select('id, nombre, pais, sonopolis_pro_hasta').eq('role', 'musician')`,
`venues.select('id, name, pais, sonopolis_pro_hasta').order('name')` y
`crm_contactos.select('tenant_type, tenant_id, origenes, acepta_whatsapp')` (solo las
columnas que la lista cuenta). Agrupa los contactos por `tenant_type:tenant_id` y cuenta
`contactos`, `compradores` (`origenes` incluye `'comprador'`) y `conWhatsapp`. Cuenta los
eventos activos de cada tenant con `tenantDeEvento`. `nombre` vacío → `'(sin nombre)'`.
Orden de `getTenantsConCrm`: más contactos primero, empate por nombre con
`localeCompare(…, 'es')`. `bandas` son los `musician`, `locales` los `venue`;
`totalContactos` es la suma.

### 4. `src/hooks/useTenantAdmin.ts` (nuevo) — el detalle

Tipos exportados: `ContactoCrm` (los campos de `mapContactoCrmFromDB`, `libs/mappers.js:493-508`:
`email, telefono, origenes, primerContacto, ultimaCompra, entradas, totalGastado, aceptaWhatsapp`),
`SuscripcionPro` (`codigo, monto, moneda, estado, correoCuenta, linkPedidoAt, createdAt`),
`EstadoCorreo` (`{ conteos: { compradores: number; seguidores: number }; ultimoEnvio: { createdAt: string; destinatarios: number; segmento: string } | null; proximoEnvio: string | null }`,
la respuesta de `getEstadoCorreo`, `libs/data/crmCorreo.js:86-96`).

`useTenantAdmin(tipo: TipoTenant, id: string)` →

```ts
{
  cargando, error, recargar,
  tenant: { nombre: string; pais: string | null; proHasta: string | null; esPro: boolean; sinVencimiento: boolean } | null,
  contactos: ContactoCrm[],
  resumen: { total: number; compradores: number; conWhatsapp: number },
  whatsapp: { todos: number; compradores: number; seguidores: number },
  eventosActivos: EventoDeTenant[],
  cuenta: { cuentaId: string; correo: string } | null,
  suscripciones: SuscripcionPro[],
  moneda: string | null, precioSugerido: number | null, errorSuscripcion: string | null,
  correo: EstadoCorreo | null, errorCorreo: string | null,
}
```

Tres bloques que cargan en paralelo y **fallan por separado**, como `cargarSuscripcion` en
la web: es una pantalla de revisión y no puede caerse entera por un bloque.

1. **Principal** (su error va a `error`): el tenant (`venues.select('*')` o
   `profiles.select('*')` por `id`, `maybeSingle()`; sin fila → `error = 'No existe'`),
   `crm_contactos.select('*').eq('tenant_type', tipo).eq('tenant_id', id).order('primer_contacto', { ascending: false })`
   y los eventos activos del tenant (`cargarEventosYReglas` + `tenantDeEvento` +
   `esEventoActivo`). `resumen` y `whatsapp` se derivan de `contactos` como
   `resumirContactos` y `contarPorSegmento` (`libs/data/crm.js:39-55` y `:108-115`); sin
   ingresos (W-218).
2. **Suscripción** (su error va a `errorSuscripcion`): `rpc('admin_cuenta_del_tenant', { p_tenant_type, p_tenant_id })`
   (primera fila o `null`), `pro_suscripciones.select('codigo, monto, moneda, estado, correo_cuenta, link_pedido_at, created_at')`
   del tenant, más nuevo primero, y `paises_cobro.select('pais, moneda, pro_precio_mensual')`.
   `moneda` y `precioSugerido` salen de la fila del país del tenant. **`precioSugerido`
   sale de `pro_precio_mensual` (spec 111) y no de una constante** como `config.pro.precioMensual`
   de la web: hoy es el mismo 20.000 CLP, pero la base es la fuente que el panel del dueño ya
   usa, y una copia en la app quedaría desfasada al primer cambio.
3. **Correo** (su error va a `errorCorreo`): `llamarApiWeb<EstadoCorreo>(\`/api/crm/correo?tenantType=${tipo}&tenantId=${encodeURIComponent(id)}\`)`.
   Hasta que el W-249 esté desplegado responde `401`, y solo esta sección lo muestra.

### 5. `src/hooks/useAdminLocales.ts` (nuevo)

Tipo exportado `LocalAdmin`, el mismo mapeo de `mapLocalAdmin`
(`libs/data/invitacionesLocal.js:8-32`): `venueId, nombre, tipo, pais, direccion, comuna, ciudad, imagen, dueno, invitacion, eventos`.

`useAdminLocales()` → `{ cargando, error, locales, recargar, invitar, cancelar }`.

- Carga: `rpc('admin_buscar_locales', { p_q: null })` (la base limita a 50; la web también
  carga todo y filtra en el cliente).
- `invitar(venueId, email)` → `Promise<{ token: string; emailError: string | null }>`:
  `llamarApiWeb('/api/admin/locales/invitar', { metodo: 'POST', cuerpo: { venueId, email } })`.
  Recarga la lista al volver, también si vino `emailError` (la invitación quedó creada).
- `cancelar(token)` → `llamarApiWeb(…, { metodo: 'DELETE', cuerpo: { token } })` y recarga.
- Los errores de la ruta suben como `ErrorApiWeb` con el mensaje de la base.
- Función pura exportada `filtrarLocales(locales, q)`: normaliza sin acentos ni mayúsculas
  (`normalize('NFD')`, como `src/lib/generos.ts:8`), busca en
  `nombre, direccion, comuna, ciudad`, y ordena primero los que **no** están a nombre de un
  local (`dueno?.rol !== 'local'`) y después por nombre. Copia de
  `BuscadorLocales.js:24-48`.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. `grep -n "catch {}" src/lib/adminPro.ts src/hooks/useAdminCrm.ts src/hooks/useTenantAdmin.ts src/hooks/useAdminLocales.ts`
   sin salida.
4. Con la cuenta admin, `useAdminCrm` da los mismos tenants, conteos, Pro y eventos activos
   que `sonopolis.org/admin/crm` en el mismo momento.
5. Con la cuenta admin, `useTenantAdmin` de un tenant de prueba da los mismos contactos,
   eventos activos, cuenta y códigos que su detalle en la web; con el W-249 desplegado,
   `correo.conteos` coincide con el redactor de la web.
6. `darPro(…, 30)` deja `sonopolis_pro_hasta` 30 días más adelante; `darPro(…, 0)` lo
   apaga; `darProSinVencimiento` lo deja en el año 9999. Con una cuenta no admin, los tres
   tiran el error de la base.
7. `generarCodigoPro` con un monto válido devuelve `{ codigo, url }` y crea la fila en
   `pro_suscripciones`; con un tenant sin cuenta tira el mensaje de la base, no «Edge
   Function returned a non-2xx status code».
8. Con W-249 y W-250 desplegados: `invitar` crea la invitación y llega el correo;
   `cancelar` la revoca. Desde el build web, sin W-249, `cancelar` falla con «Failed to
   fetch» (el preflight de `DELETE` no pasa): es lo esperado.
9. `filtrarLocales(locales, 'plectrum')` encuentra «Estudio Plectrum» y `'nunoa'`
   encuentra los de «Ñuñoa».

## Fuera de alcance

- Un RPC agregado para la lista del CRM: hoy la app baja toda la vista `crm_contactos` y
  agrupa en el teléfono, igual que la web. Sería una optimización DATOS cuando pase de
  cientos de filas.
- Unificar `tenantDeEvento` en un solo lugar: con esta copia son cuatro definiciones de la
  misma regla (vista SQL, `getTenantDelEvento`, `adminCrm.js` y esta), el pendiente #34 de
  la web crece. La solución es un RPC que devuelva el tenant de cada evento; spec DATOS
  aparte.
- Mandar correos o avisos de WhatsApp desde el CRM del admin: la web los muestra en modo
  vista y no envía nada.
- La vista previa HTML del correo de invitación.
- Las rutas de la web: W-249 y W-250.

## Verificación manual

- **V-candidata 153-a:** con la cuenta admin, comparar la lista y un detalle de la app con
  la web; activar Pro 1 mes a un tenant de prueba, verlo en la web, quitarlo; generar un
  código y abrir su `url`.
- **V-candidata 153-b:** con W-249 y W-250 en producción, invitar y cancelar al dueño de un
  local de prueba desde la app nativa y desde el build web.
