# Spec 152 — Lógica del admin de Sonópolis en la app: quién es admin, Pagos y Eventos

> Estado: propuesto (19-oct-2026)
> Capa: LÓGICA. `src/lib/admin.ts` (nuevo), `src/hooks/useEsAdmin.ts` (nuevo), `src/hooks/useAdminPagos.ts` (nuevo), `src/hooks/useAdminEventos.ts` (nuevo).
> Depende de: spec 119, spec 135
> Hermano en la web: `libs/admin.js`, `libs/data/pagos.js`, `app/(private)/admin/sonopolis/page.js`, `app/(private)/admin/eventos/page.js`, `app/(private)/admin/BotonCerrarEvento.js` (W-083, W-085, W-092, W-172, W-174, W-175).

> **En una frase:** la app aprende a saber si la sesión es admin de Sonópolis y a leer lo
> mismo que `/admin/sonopolis` y `/admin/eventos` de la web —qué hay que transferir, a
> quién, y qué eventos falta cerrar—, más la acción `cerrar_evento`, para que el spec 158
> sea solo pantallas.

## Contexto

Hoy no hay una línea de admin en la app. El back office vive solo en la web, detrás de
`app/(private)/admin/layout.js`, que redirige a quien no es admin. Victor quiere operarlo
desde el teléfono con la misma información.

No hace falta nada nuevo en la base. Todo lo que usa la web ya existe y funciona con la
sesión del admin, sin service role:

- **Quién es admin.** `platform_admins` (spec 074) tiene la policy
  `platform_admins_select_self` (`20260904131105_spec_074_admin_de_plataforma.sql:18-19`):
  cada sesión ve solo su propia fila. La web lo usa en `esAdmin()` (`libs/admin.js:23-30`)
  con un `maybeSingle()`. Es guarda de **navegación**; la de seguridad es
  `es_admin_sonopolis()` (spec 077) dentro de las policies y los RPC.
- **Pagos.** `getEventosConPagoPendiente` (`libs/data/pagos.js:92-129`) lee
  `event_payouts` con el evento embebido (policy `event_payouts_select_admin`, spec 074),
  excluye pagados y cerrados (W-174), pide `monto_a_transferir` por fila y descarta los de
  monto 0. `getEventosSinDatosBancarios` (`:140-158`) busca los eventos no cancelados sin
  fila en `event_payouts`. La página separa en tres grupos
  (`app/(private)/admin/sonopolis/page.js:31-33`) y suma por moneda (`:37-38`).
- **Eventos.** `/admin/eventos` (`app/(private)/admin/eventos/page.js:28-56`) usa la misma
  consulta de la cartelera; la diferencia es que la RLS le devuelve al admin también los
  borradores ajenos (spec 078). Separa próximos, por cerrar y cerrados, y pide
  `monto_a_transferir` solo para los por cerrar.
- **Cerrar.** `cerrarEvento` (`libs/data/pagos.js:184-190`) llama `cerrar_evento` (spec
  102/103). Las guardas (admin, ya pasó, datos bancarios si hay plata) viven en el RPC.

En la app ya existen las piezas a reusar: `mapPayoutFromDB` (`src/lib/datosPago.ts:58`,
spec 135), `mapEventoFromDB` (`src/context/EventosContext.tsx:40`, spec 119) y
`formatearMonto` (`src/lib/precio.ts:37`).

## Diseño

Ningún archivo nuevo tiene `catch {}` vacío ni datos mock (spec 115): los errores suben
con el mensaje de Postgres. **Los tipos viven en el archivo de su hook**, no en
`src/types/index.ts`: son del back office y nadie más los usa, y así este spec no choca con
otros que editan los tipos compartidos.

### 1. `src/lib/admin.ts` (nuevo)

```ts
export async function esAdmin(): Promise<boolean>
export async function getMontoATransferir(eventoId: string): Promise<number>
export async function cerrarEvento(eventoId: string): Promise<void>
```

- `esAdmin`: `supabase.from('platform_admins').select('user_id').maybeSingle()`; `error`
  → tira; devuelve `Boolean(data)`. Mismo criterio que `libs/admin.js:23-30`: la policy
  `select_self` no deja ver a los demás admins.
- `getMontoATransferir`: `rpc('monto_a_transferir', { p_event })` → `Number(data ?? 0)`.
  La fórmula la calcula Postgres a propósito: es el mismo número que congela el cierre.
- `cerrarEvento`: `rpc('cerrar_evento', { p_event })`; `error` → tira con el mensaje de la
  base (ya viene en español y dice qué falta). No devuelve el evento: quien llama recarga
  su lista.

### 2. `src/hooks/useEsAdmin.ts` (nuevo)

`useEsAdmin()` → `{ esAdmin: boolean; cargando: boolean; error: string | null }`.

- Corre `esAdmin()` cuando cambia `useAuth().user?.id`. Sin usuario: `esAdmin = false`,
  `cargando = false`, sin consulta.
- Un error deja `esAdmin = false` y el mensaje en `error`: ante la duda, no se muestra la
  entrada al back office. No se cachea entre sesiones: cerrar sesión y entrar con otra
  cuenta vuelve a preguntar porque cambia `user.id`.

### 3. `src/hooks/useAdminPagos.ts` (nuevo)

Tipos exportados:

```ts
export interface FilaPagoAdmin extends Payout {
  evento: { id: string; artista: string; venueName: string; fecha: string; comienzaAt: string | null };
  moneda: string | null;
  cancelado: boolean;
  yaPaso: boolean;
  monto: number;
}
export interface EventoSinDatos {
  id: string; artista: string; venueName: string; fecha: string;
  comienzaAt: string | null; yaPaso: boolean;
}
```

`useAdminPagos()` → `{ cargando, error, porPagar, sinReclamar, acumulando, sinDatos, totalPorPagar, totalAcumulando, recargar }`.

Carga, igual que la web:

1. **Pendientes:** `event_payouts.select('*, events!inner(id, artist_name, venue_name, fecha, hora, comienza_at, moneda, status, closed_at)')`,
   `.neq('status', 'pagado')`, `.is('events.closed_at', null)`,
   `.order('comienza_at', { referencedTable: 'events', ascending: true })`. Cada fila:
   `mapPayoutFromDB(fila)` + `evento` mapeado a los nombres de la app, `moneda`,
   `cancelado = events.status === 'cancelled'`,
   `yaPaso = new Date(events.comienza_at).getTime() < Date.now()` (sin fecha → `false`,
   igual que la web) y `monto = await getMontoATransferir(event_id)` en `Promise.all`. Se
   descartan las de `monto <= 0`.
2. **Sin datos bancarios:** primero `event_payouts.select('event_id')`; después
   `events.select('id, artist_name, venue_name, fecha, hora, comienza_at, status')`,
   `.neq('status', 'cancelled')`, orden por `comienza_at` ascendente y, si hay ids,
   `.not('id', 'in', '(id1,id2,…)')`. Se ordena en el hook como la página web
   (`page.js:131-136`): primero los que ya pasaron, después por fecha.
3. Los grupos, con la regla de `page.js:31-33`:
   `porPagar = yaPaso && status === 'reclamado'`, `sinReclamar = yaPaso && status === 'pendiente'`,
   `acumulando = !yaPaso`.
4. Totales por moneda, en una función pura exportada del mismo archivo:
   `formatearTotales(filas: { monto: number; moneda: string | null }[]): string`. Suma por
   moneda y une con `" + "` usando `formatearMonto`; sin filas, `formatearMonto(0, null)`.
   Copia de `libs/moneda.js:41-47`: sumar CLP con MXN en un solo número sería falso. Vive
   en el hook y no en `src/lib/precio.ts` para no editar un archivo que comparten otros
   specs.

Las dos consultas corren en paralelo. Un error de cualquiera deja `error` con su mensaje y
conserva las listas de la carga anterior, como `EventosContext` (spec 115).

### 4. `src/hooks/useAdminEventos.ts` (nuevo)

Tipo exportado: `export type EventoAdmin = Evento & { cerradoAt: string | null; montoATransferir?: number };`
(`montoATransferir` y no `monto`: `Evento.monto` ya es el precio de la entrada).

`useAdminEventos()` → `{ cargando, error, proximos, porCerrar, cerrados, hayPasados, recargar }`.

- Consulta propia, no `useEventos()`: el contexto no mapea `closed_at`, y sumarlo ahí es
  tocar un archivo de todos. `events.select('*').order('comienza_at', { ascending: true, nullsFirst: false })`,
  cada fila `{ ...mapEventoFromDB(db), cerradoAt: db.closed_at ?? null }`.
- `esProximo = !comienzaAt || comienzaAt >= ahora` (`eventos/page.js:36`: sin fecha cuenta
  como próximo, para que no se pierda entre los pasados). Pasados en orden inverso (el más
  reciente primero). `porCerrar = pasados sin cerradoAt`, `cerrados = pasados con cerradoAt`.
- Solo a `porCerrar` se le pide `getMontoATransferir` (en `Promise.all`), igual que
  `eventos/page.js:51-55`: decide si el botón dice «Pagado y cerrado» o «Cerrar evento».
  Incluye cancelados (W-175).
- `hayPasados` existe para el texto del vacío («Todavía no pasó ningún evento.» contra
  «Todos los eventos pasados están cerrados.»).

### 5. Lo que hereda el spec 158

La regla de qué pregunta el confirm y qué dice el botón de cerrar
(`BotonCerrarEvento.js:24-34`) es de presentación y la escribe el 158. Este spec solo
garantiza que cada fila trae `monto`, `moneda`, `cancelado`, `titular` y `artista`.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. `grep -n "catch {}\|catch (e) {}" src/lib/admin.ts src/hooks/useEsAdmin.ts src/hooks/useAdminPagos.ts src/hooks/useAdminEventos.ts`
   sin salida.
4. Con la cuenta de Victor (admin), `useEsAdmin` da `true`; con una cuenta de prueba
   cualquiera, `false`, y `useAdminPagos` devuelve las cuatro listas vacías (la RLS no le
   da filas).
5. Con la cuenta admin, los tres grupos y los sin datos tienen los mismos eventos y montos
   que `sonopolis.org/admin/sonopolis` en el mismo momento; `totalPorPagar` muestra una
   suma por moneda.
6. Con la cuenta admin, `useAdminEventos` da los mismos próximos, por cerrar y cerrados
   que `sonopolis.org/admin/eventos`, incluidos borradores ajenos.
7. `cerrarEvento` sobre un evento futuro tira el mensaje del RPC y el evento no cambia;
   sobre un evento de prueba ya pasado y sin ventas, deja `closed_at` no nulo.

## Fuera de alcance

- Un RPC agregado que devuelva cada fila con su monto en una sola llamada: hoy son N+1
  llamadas (una `monto_a_transferir` por evento), igual que la web, y son pocas filas.
  Sería una optimización de capa DATOS para cuando la lista crezca.
- Las pantallas, la entrada desde el perfil y el botón de cerrar: spec 158.
- CRM, Pro y Locales del admin: spec 153.
- Que `useEventoPermisos` reconozca al admin de plataforma (el bypass de
  `can_edit_event()`, spec 078): sin eso, la app no le ofrece Editar/Entradas de eventos
  ajenos. Queda para un spec propio.

## Verificación manual

- **V-candidata 152-a:** con la cuenta admin en la app y `sonopolis.org/admin/sonopolis`
  abierta al lado, comparar evento por evento los tres grupos, los montos y el total por
  moneda; repetir con `/admin/eventos`.
