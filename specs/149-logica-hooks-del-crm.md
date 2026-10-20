# Spec 149 — Hooks del CRM: tenant, contactos, correo, aviso por WhatsApp y opt-in

> Estado: propuesto (19-oct-2026)
> Capa: LÓGICA. `src/hooks/useTenantCrm.ts` (nuevo), `src/hooks/useContactosCrm.ts` (nuevo), `src/hooks/useCorreoCrm.ts` (nuevo), `src/hooks/useAvisoWhatsApp.ts` (nuevo), `src/hooks/useOptInWhatsApp.ts` (nuevo).
> Depende de: spec 148. Además, W-249 de la web desplegado en producción (las rutas del CRM aceptan el Bearer de la app).
> Hermano en la web: `libs/data/crm.js`, `libs/data/crmCorreo.js`, `libs/data/whatsapp.js`, `libs/telefono.js`, `components/RedactarCorreo.js`, `app/(marketing)/cartelera/[id]/BotonAvisarWhatsApp.js`.

> **En una frase:** cinco hooks nuevos le dan a las pantallas del 155 y el 156 todo lo que
> la web lee o manda en su CRM —de quién es el CRM, la lista de contactos, el correo, el
> aviso por WhatsApp y el opt-in— con las mismas reglas que la web y sin tocar
> `src/types/index.ts`.

## Contexto

La web reparte el CRM en cuatro fuentes, y la app necesita las cuatro:

| Qué | Dónde lo lee la web | Cómo lo lee la app |
|---|---|---|
| Contactos y resumen | Vista `crm_contactos` con la sesión (`libs/data/crm.js:19-55`) | Igual, directo a Supabase |
| Conteos y envío del correo | `GET/POST /api/crm/correo` (service role + Resend) | `llamarApiWeb` con Bearer (W-249) |
| Aviso por WhatsApp | `POST /api/whatsapp/broadcast` (Kapso) | `llamarApiWeb` con Bearer (W-249) |
| Opt-in | RPC `crear_optin_whatsapp` (`libs/data/whatsapp.js:78-95`) | Igual, directo a Supabase |

**Por qué la app puede leer `crm_contactos` directo:** desde W-198 la vista ya sale
enmascarada de la base: `public.enmascarar_email(email)` y `md5(contacto_key)`
(`supabase/migrations/20261005180000_spec_w198_correos_del_crm.sql:97-114`). La función
`enmascarar_email` (`…_spec_w196_seguidores_con_correo.sql:29-38`) aplica la misma regla
que `enmascararEmail` de la web (`libs/privacidad.js:15-25`): tres primeras letras y el
dominio. El correo completo nunca llega al teléfono. La vista es `security_invoker`, así que
la RLS de las tablas base recorta a lo del dueño; está revocada para `anon`.

**Por qué el tenant es un hook aparte:** «de quién es el CRM» tiene dos reglas en la web y
ninguna en la app:

- El CRM propio (`getTenantPropio`, `libs/data/crmCorreo.js:19-32`): el local del dueño, o
  el perfil propio si su `role` es `musician`.
- El tenant de un evento (`getTenantDelEvento`, `libs/data/whatsapp.js:31-69`): el creador
  si es músico; si no, el local; si no, el artista vinculado y reclamado. Es la lista a la
  que se suma quien compra y la que avisa el owner, y la vista `crm_contactos` repite la
  misma regla en SQL (W-184). Si la app usara otra, el opt-in de la compra caería en una
  lista y el aviso saldría de otra.

**Corrección al mapa del tipo `Evento`:** el comentario de `artistId` en
`src/types/index.ts:49` dice «FK a profiles», pero desde el spec 061 `events.artist_id`
apunta a `artists` (`sonopolisWeb/libs/data/artists.js:33-36`). Para llegar al perfil hay
que pasar por `artists.profile_id`. Este spec no edita el tipo (lo dice su propio
comentario histórico); el hook lo resuelve bien.

**Cómo llegan los errores de la web:** `llamarApiWeb` lanza `ErrorApiWeb` con
`codigo = body.error` (`src/lib/apiWeb.ts:16-27`). En estas rutas `error` es una frase
para la persona («Ya mandaste un correo en las últimas 24 horas»), no un código. Los demás
campos del cuerpo se pierden (`proximoEnvio` del `429`, `codigo` del `503`), así que el
hook decide por `status` y, donde hace falta un dato, vuelve a pedirlo. `apiWeb.ts` no se
toca: otro spec de este lote puede necesitarlo.

## Diseño

Ningún tipo nuevo va a `src/types/index.ts`: cada uno vive y se exporta en el hook que lo
produce. Los textos y listas que la web tiene en `libs/constants.js` se copian al hook que
los usa, con el comentario «copia de …» y su ruta.

### 1. `src/hooks/useTenantCrm.ts`

```ts
export type TipoTenant = 'venue' | 'musician';
export interface TenantCrm {
  tipo: TipoTenant;
  id: string;
  nombre: string;
  sonopolisProHasta: string | null;   // se pasa tal cual a esPro() del spec 148
}

export function useTenantPropio(tipo: TipoTenant): { tenant: TenantCrm | null; cargando: boolean; error: string | null };
export function useTenantDelEvento(evento: Evento | null | undefined): { tenant: TenantCrm | null; cargando: boolean };
```

**`useTenantPropio`** — port de `getTenantPropio`:
- `venue`: el mismo criterio que `DashboardLocalScreen.tsx:56`,
  `useVenues().allVenues.find((v) => v.ownerId === user.id)`. `nombre = venue.name`,
  `cargando` = el `loading` del contexto. Sin local → `tenant: null`.
- `musician`: `profiles.select('id, role, nombre, sonopolis_pro_hasta').eq('id', user.id).maybeSingle()`.
  Si `role !== 'musician'` → `null` (misma regla de la web). `nombre = nombre || 'Tu banda'`.
- Sin sesión → `null`. Error de lectura → `error` con el mensaje y `tenant: null`.

**`useTenantDelEvento`** — port de `getTenantDelEvento`, en ese orden y cortando en el
primero que resuelve:
1. Con `evento.createdBy`: `profiles.select('id, role, nombre, sonopolis_pro_hasta')` del
   creador. Si `role === 'musician'` → `{ tipo: 'musician', id, nombre: nombre ?? evento.artista }`.
   Para un tercero, la RLS de `profiles` (spec 020) solo deja ver filas `musician`: un
   creador que no es músico vuelve `null` y se sigue al paso 2.
2. Con `evento.venueId`: `venues.select('id, name, sonopolis_pro_hasta')` → `{ tipo: 'venue', … }`.
3. Con `evento.artistId`: `artists.select('profile_id')`; si hay `profile_id`, el perfil
   como en el paso 1 pero sin exigir `role` (igual que la web, que usa `getPerfilMusico`).
4. Si nada resuelve → `null`.

Se consulta la base y no `VenuesContext` en el paso 2 para que el Pro sea el de la fila
recién leída, como hace la web antes de dejar avisar. Un error en cualquier paso deja
`tenant: null` (no se ofrece opt-in ni aviso) y va a `console.error` sin datos personales.
El efecto depende de `evento?.id`, `createdBy`, `venueId` y `artistId`.

### 2. `src/hooks/useContactosCrm.ts`

```ts
export type OrigenContacto = 'comprador' | 'seguidor' | 'whatsapp';
export interface ContactoCrm {
  clave: string;            // md5 de la vista: sirve de key de React sin exponer nada
  email: string | null;     // ya enmascarado por la base
  telefono: string | null;  // phone_e164, solo existe si dejó su WhatsApp
  origenes: OrigenContacto[];
  primerContacto: string;
  ultimaCompra: string | null;
  entradas: number;
  totalGastado: number;
  aceptaWhatsapp: boolean;
}
export type FiltroContactos = 'todos' | OrigenContacto;

export function useContactosCrm(tenant: Pick<TenantCrm, 'tipo' | 'id'> | null):
  { contactos: ContactoCrm[] | null; cargando: boolean; error: string | null; refrescar: () => Promise<void> };

export function resumirContactos(c: ContactoCrm[]): { total: number; compradores: number; seguidores: number; conWhatsapp: number };
export function contarPorSegmento(c: Pick<ContactoCrm, 'origenes' | 'aceptaWhatsapp'>[]): Record<SegmentoBroadcast, number>;
export function filtrarContactos(c: ContactoCrm[], filtro: FiltroContactos, busqueda: string): ContactoCrm[];
export function agruparContactos(c: ContactoCrm[]): { titulo: string; contactos: ContactoCrm[] }[];
```

- La consulta es la de `getContactos`: `crm_contactos.select('*')`, filtro por
  `tenant_type` **y** `tenant_id` (la vista es global; sin el filtro Postgres recorre todo
  lo visible, W-100), orden `primer_contacto` descendente. El mapeo sigue
  `mapContactoCrmFromDB` (`sonopolisWeb/libs/mappers.js:493-508`) sin `userId` ni
  `tenantType`/`tenantId`, que ninguna pantalla usa.
- **Un error deja `contactos: null`, no `[]`**: un CRM que dice «no tienes contactos»
  cuando no pudo leer la vista es peor que uno caído (W-100).
- `resumirContactos` es el de la web sin `ingresos`: la web no muestra montos en el resumen
  (W-218) y la app tampoco los va a mostrar.
- `contarPorSegmento` es el de `libs/data/crm.js:108-115`: el piso es `aceptaWhatsapp`, el
  segmento recorta. `SegmentoBroadcast` se importa de `useAvisoWhatsApp.ts` con
  `import type`: ese archivo a su vez importa `contarPorSegmento` de este, y un import solo
  de tipo se borra al compilar, así que no queda un ciclo entre módulos en tiempo de ejecución.
- `filtrarContactos` y `agruparContactos` son la lógica de `components/TablaContactos.js`:
  filtro por origen (`whatsapp` = `aceptaWhatsapp`), búsqueda sin acentos sobre email y
  teléfono, y tres grupos excluyentes por prioridad — «Compraron entradas», «Te siguen»,
  «Dejaron su WhatsApp» — omitiendo los vacíos. La búsqueda quita acentos con
  `normalize('NFD')` solo si `String.prototype.normalize` existe en el motor; si no, compara
  en minúsculas sin más (un correo enmascarado o un teléfono rara vez llevan tildes).

### 3. `src/hooks/useCorreoCrm.ts`

```ts
export type SegmentoCorreo = 'compradores' | 'seguidores' | 'ambos';
export interface EstadoCorreo {
  conteos: { compradores: number; seguidores: number };
  ultimoEnvio: { createdAt: string; destinatarios: number; segmento: SegmentoCorreo } | null;
  proximoEnvio: string | null;
}
export const MAX_ASUNTO_CORREO = 120;
export const MAX_CUERPO_CORREO = 3000;
export const MOTIVOS_CORREO: Record<'compradores' | 'seguidores', (nombre: string) => string>;

export function useCorreoCrm(tipo: TipoTenant | null): {
  estado: EstadoCorreo | null; cargando: boolean; error: string | null; enviando: boolean;
  enviar: (p: { segmento: SegmentoCorreo; asunto: string; cuerpo: string }) =>
    Promise<{ ok: true; enviados: number } | { ok: false; mensaje: string }>;
};

export function mensajeApiWeb(e: unknown, respaldo: string): string;
```

- Con `tipo === null` no pide nada. La pantalla pasa `null` cuando el tenant no tiene Pro:
  la ruta responde `402` sin Pro, y pedirlo sería un error seguro.
- Al montar: `llamarApiWeb<EstadoCorreo>('/api/crm/correo?tenantType=' + tipo)`.
- `enviar` hace `POST /api/crm/correo` con `{ tenantType, segmento, asunto, cuerpo }`.
  - `200` `{ enviados }` → actualiza `estado` como `RedactarCorreo.js`: `ultimoEnvio` con
    la hora actual y `proximoEnvio` a 24 h.
  - `429` (ya se mandó uno) o `502` (salió solo una parte, y el servidor ya registró lo
    enviado) → devuelve el mensaje del servidor **y vuelve a pedir el GET**, que trae el
    `proximoEnvio` real que `ErrorApiWeb` perdió.
  - Cualquier otro error → `{ ok: false, mensaje: mensajeApiWeb(e, 'No se pudo mandar el correo') }`.
- `MOTIVOS_CORREO` es copia de `MOTIVOS` de `sonopolisWeb/libs/emails/correoCrm.js:34-37`
  (la vista previa de texto del 155 la usa para la línea «Te escribe … porque …»).
- `mensajeApiWeb`: `ErrorApiWeb` con `status === 401` → «Tu sesión expiró. Vuelve a iniciar
  sesión.»; `ErrorApiWeb` con `codigo` que empieza con `HTTP ` → `respaldo`; otro
  `ErrorApiWeb` → su `codigo` (la frase del servidor); cualquier otra cosa (sin red, CORS)
  → «No pudimos conectar con Sonópolis. Revisa tu conexión e intenta de nuevo.».

### 4. `src/hooks/useAvisoWhatsApp.ts`

```ts
export type SegmentoBroadcast = 'todos' | 'compradores' | 'seguidores';
export const SEGMENTOS_BROADCAST: { value: SegmentoBroadcast; label: string }[];
export const SEGMENTO_BROADCAST_DEFAULT: SegmentoBroadcast = 'todos';
export type ResultadoAviso =
  | { tipo: 'enviado'; recipientsCount: number }
  | { tipo: 'no_conectado'; mensaje: string }
  | { tipo: 'error'; mensaje: string };

export function useAvisoWhatsApp(p: { eventoId: string | null; tenant: TenantCrm | null; habilitado: boolean }): {
  tienePro: boolean;
  ultimoEnvioAt: string | null;
  conteos: Record<SegmentoBroadcast, number> | null;
  cargando: boolean;
  enviando: boolean;
  avisar: (segmento: SegmentoBroadcast) => Promise<ResultadoAviso>;
};
```

- `SEGMENTOS_BROADCAST` es copia de `sonopolisWeb/libs/constants.js:194-200` con sus
  etiquetas.
- `habilitado` lo calcula la pantalla: owner del evento y evento no cancelado, la misma
  condición que la web (`cartelera/[id]/page.js:434`). Con `habilitado` falso o sin tenant
  no consulta nada y `tienePro = false`.
- `tienePro = esPro(tenant)` (spec 148).
- `ultimoEnvioAt`: `whatsapp_broadcasts.select('sent_at').eq('event_id', eventoId)`, el más
  nuevo. La policy `whatsapp_broadcasts_select_owner` solo deja leer al dueño del tenant:
  si el owner del evento no lo es, ve `null`, igual que en la web; el servidor sigue
  frenando el doble envío con su `409`.
- `conteos`: solo si `tienePro && !ultimoEnvioAt`, como la web (no hay modal que abrir
  en otro caso). `crm_contactos.select('origenes, acepta_whatsapp')` del tenant y
  `contarPorSegmento`. Misma fuente que la pantalla de contactos, así el número del modal y
  el de la lista no pueden discrepar (W-108).
- `avisar` hace `POST /api/whatsapp/broadcast` con `{ eventoId, segmento }`:
  - `200` → `{ tipo: 'enviado', recipientsCount }` y `ultimoEnvioAt` pasa a la hora actual:
    la idempotencia es por evento, no por segmento (W-107).
  - `503` → `{ tipo: 'no_conectado', mensaje }` con la frase del servidor («todavía no está
    activo: estamos esperando la aprobación de Meta…»). Se distingue por `status` porque el
    `codigo` del cuerpo no llega (ver Contexto). No es un fallo de quien usa la app, y la
    pantalla lo muestra como aviso, no como error.
  - Otro error (`402`, `403`, `409`, `502`, red) → `{ tipo: 'error', mensaje: mensajeApiWeb(…) }`.

### 5. `src/hooks/useOptInWhatsApp.ts`

```ts
export type FuenteOptIn = 'perfil' | 'checkout';
export function normalizarE164(numero: string | null | undefined): string | null;
export function useTelefonoPropio(): string;   // '' si no hay sesión o no hay teléfono
export function useOptInWhatsApp(): {
  guardando: boolean;
  guardar: (p: { tenantTipo: TipoTenant; tenantId: string; telefono: string }) =>
    Promise<{ ok: true } | { ok: false; mensaje: string }>;
};
export function dispararOptInDeCompra(p: {
  tenantTipo: TipoTenant; tenantId: string; telefono: string; userId?: string; email?: string;
}): void;
```

- `normalizarE164` es port exacto de `sonopolisWeb/libs/telefono.js:17-28` (Chile `56` por
  defecto). Un mismo criterio en los dos lados evita guardar un número que Kapso después
  rechaza por forma.
- `useTelefonoPropio`: con sesión, `profiles.select('telefono').eq('id', user.id).maybeSingle()`.
  La RLS deja leer la fila propia sea cual sea el rol (spec 020); la web prellena igual
  (`locales/[id]/page.js:29`). Solo prellena: la casilla sigue siendo explícita.
- `guardar` es el opt-in del perfil público (`source: 'perfil'`): número inválido →
  `{ ok: false, mensaje: 'Ese número no parece válido' }` sin llamar a nada; si no,
  `supabase.rpc('crear_optin_whatsapp', { p_tenant_type, p_tenant_id, p_phone_e164, p_source: 'perfil' })`.
  Sin `p_user_id` ni `p_email`, igual que `OptInWhatsApp.js` de la web en el perfil: el
  opt-in del perfil admite gente sin cuenta, y la RPC está abierta a `anon`. Error de la
  RPC → `{ ok: false, mensaje: error.message ?? 'No se pudo guardar el aviso' }`.
- `dispararOptInDeCompra` es port de `libs/purchase.js:215-233`: **no es async y no
  devuelve nada esperable**; la compra no puede depender de esto en ninguna dirección.
  Número inválido → no hace nada; si no, la RPC con `p_source: 'checkout'`, `p_user_id` y
  `p_email` (la identidad de W-103, que deja cruzar el opt-in con la compra en el CRM), y
  un `.catch` que solo hace `console.error` sin el teléfono ni el correo.
- Los argumentos opcionales van como `undefined`, no `null`: `undefined` no viaja en el
  JSON de la RPC y Postgres usa el `default null` del argumento.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. `git diff --stat` del spec toca solo los cinco archivos de la línea Capa;
   `src/types/index.ts` y `src/lib/apiWeb.ts` sin cambios.
4. Con la sesión del dueño de un local con contactos, `useContactosCrm` devuelve los
   mismos contactos, en el mismo orden y con los mismos correos enmascarados que
   `/local/contactos` en la web; `resumirContactos` da los mismos tres números que las
   tarjetas de la web.
5. `useTenantDelEvento` resuelve el mismo tenant que la web para dos eventos de prueba en
   el mismo local: uno creado por un músico (tenant = ese músico, aunque haya local) y uno
   creado por el dueño del local (tenant = el local). El paso 3 (artista) solo se alcanza
   en un evento sin `venueId`, y se revisa leyendo el código contra
   `libs/data/whatsapp.js:55-66`.
6. `useCorreoCrm('venue')` con Pro trae los conteos de `GET /api/crm/correo`; tras un envío
   exitoso, un segundo `enviar` devuelve `ok: false` con «Ya mandaste un correo en las
   últimas 24 horas» y `estado.proximoEnvio` queda con la fecha que da el servidor.
7. Con `KAPSO_*` sin configurar, `avisar('todos')` devuelve `{ tipo: 'no_conectado' }` con
   la frase del servidor y no crea fila en `whatsapp_broadcasts`.
8. `normalizarE164('9 1234 5678')` → `'+56912345678'`; `normalizarE164('+52 55 1234 5678')`
   → `'+525512345678'`; `normalizarE164('123')` → `null`.
9. `guardar` sin sesión crea (o reactiva) la fila en `whatsapp_opt_ins` con
   `source = 'perfil'`; `dispararOptInDeCompra` con sesión la deja con `source = 'checkout'`,
   `user_id` y `email` de quien compra.

## Fuera de alcance

- Pantallas y componentes: tarjeta Pro (154), contactos y correo (155), aviso y opt-in (156).
- Exportar CSV (`config.crm.exportarCSV: false` en la web) y el regalo por QR (W-224–226,
  no construido en ningún lado).
- Revocar un opt-in desde la app (el `STOP` lo maneja el servidor con Kapso, W-051).
- Redes sociales del CRM: es del spec de Redes de la app.

## Verificación manual

- **V-candidata 149-a:** desde el build web de la app con un local de prueba con Pro, abrir
  la consola y confirmar que `GET /api/crm/correo` responde `200` sin error de CORS, y que
  la lista de contactos coincide con la de `sonopolis.org/local/contactos`.
