# Spec 197 — El admin edita como el dueño, conecta y une bandas, y cambia bandas y local del evento

> Estado: aplicado (28-nov-2026) — `tsc` sin errores fuera de `supabase/functions`; criterios 2 y 3 probados con `node`, 4 y 5 con `grep`; sin probar contra la base ni en un dispositivo (llega con el 206).
> Capa: LÓGICA. `src/lib/bandas.ts` (nuevo), `src/lib/edicionAdmin.ts` (nuevo), `src/lib/adminEdicion.ts` (nuevo), `src/hooks/useEventoPermisos.ts`.
> Depende de: migraciones ya en producción de W-341 (`20261124120000_…`), W-347 (`20261125140000_…`), W-350 (`20261125160000_…`) y W-353 (`20261125180000_…`); spec 152 (`useEsAdmin`). No edita `src/hooks/useAdminCrm.ts` (lo edita el 188) ni `src/lib/lineup.ts` (lo crea el 189).
> Alimenta: spec 206 (FRONTEND).
> Hermano en la web: `libs/bandas.js` y `libs/data/adminEdicion.js` (W-342, W-348), `libs/edicionAdmin.js` (W-351), `libs/lineup.js` y `libs/data/lineup.js` (W-354).

> **En una frase:** la app gana las reglas puras y las llamadas a la base para que el admin
> de Sonópolis liste cuentas de músico y fichas de banda sueltas, edite y conecte o una
> fichas, guarde el perfil de una cuenta ajena con el formulario del músico, y cambie la
> banda principal, las bandas adicionales y el local de un evento; y `useEventoPermisos`
> reconoce al admin.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0
después de esta orquestación.»

En la web: W-341..W-343 (24-nov-2026, «necesito que en admin pueda editar los músicos,
locales y eventos… ventanas de cada cosa en mi CRM»), W-350..W-352 (25-nov-2026, «editar
exactamente lo que ellos pueden editar, no es necesario tener una herramienta distinta») y
W-353..W-355 (25-nov-2026, «falta poder agregar banda y local en la edición de admin del
evento»). La base ya tiene todo (migraciones en producción). En la app el admin no puede
nada de eso: `useEventoPermisos.ts` solo mira `event_collaborators` y `created_by`, así que
ni siquiera abre la edición de un evento ajeno (el spec 158 dejó «Editar» fuera de
`AdminEventosScreen` por eso).

**Ninguna migración nueva.** Lo que este spec usa ya está en la base:

| Qué | Firma real (migración) |
|---|---|
| Editar una ficha suelta | `admin_editar_banda(p_id uuid, p_datos jsonb) → jsonb` (W-341). Columnas: `name`, `genero`, `comuna`, `contacto`, `instagram`; otra clave lanza `campo no editable: <clave>` |
| Conectar ficha con cuenta | `admin_vincular_banda(p_artist uuid, p_profile uuid) → void` (redefinida en W-347: la ficha se **convierte** en la cuenta y desaparece; irreversible) |
| Unir dos fichas | `admin_unir_bandas(p_origen uuid, p_destino uuid) → jsonb` con `{ eventos_principal, eventos_adicional, invitaciones }` |
| Cambiar local del evento | `admin_cambiar_local_evento(p_event uuid, p_venue uuid) → jsonb` (la fila del evento) |
| Cambiar banda principal | `admin_cambiar_principal_evento(p_event uuid, p_musico uuid, p_artist uuid) → jsonb`; exactamente uno no nulo |
| Perfil de cuenta ajena | policy `profiles_update_admin` + guardia `guard_edicion_admin()` (W-350): UPDATE directo, solo cuentas `musician`, solo las columnas del formulario |
| Local ajeno, direcciones, fotos | policies `venues_update_admin`, `venue_addresses_*_admin`, `media_*_admin` (W-350): el código del dueño ya funciona sin cambios |
| Bandas adicionales | `event_artists` con `can_edit_event` (spec 078 incluye al admin) y los triggers de W-347 |

Lo que **no** se usa, a propósito:
- `admin_editar_perfil_musico` y `admin_editar_local`: W-352 las dejó sin uso porque el
  admin edita con el formulario del dueño. La app hace lo mismo (spec 206).
- `admin_desvincular_banda`: desde W-347 siempre lanza «una banda con cuenta ya no tiene
  ficha; no hay qué desconectar». No se expone.

## Decisión

### 1. `src/lib/bandas.ts` (nuevo) — puro, sin imports

Port literal de `sonopolisWeb/libs/bandas.js` más las tres funciones puras de W-354 (en la
web viven en `libs/lineup.js`; aquí van en `bandas.ts` porque `src/lib/lineup.ts` es del
spec 189 y un archivo lo edita un solo spec LÓGICA).

```ts
export type TipoBanda = 'cuenta' | 'ficha';
export interface BandaRef { tipo: TipoBanda; id: string }

export function normalizarNombreBanda(nombre: string | null | undefined): string;
export function sugerirCoincidencias(
  fichasSueltas: { id: string; name: string; createdBy?: string | null }[],
  cuentas: { id: string; nombre: string | null }[]
): { fichaId: string; cuentaId: string; exacta: boolean }[];
export function soloCambios<T extends Record<string, unknown>>(antes: Partial<T> | null | undefined, despues: T): Partial<T>;
export function siguienteOrden(adicionales: { orden: number }[]): number;
export function argsPrincipal(banda: BandaRef): { p_musico: string | null; p_artist: string | null };
export function estaEnElEvento(bandas: BandaRef[], banda: BandaRef): boolean;
```

Mismas reglas que la web, sin reinterpretar:
- `normalizarNombreBanda`: minúsculas, sin tildes; apóstrofes y puntos se pegan
  (`R.E.M.` → `rem`), el resto de los signos separa palabras; se quitan del inicio `the`,
  `los`, `las`, `la`, `el`, `banda`, `grupo` mientras quede más de una palabra.
- `sugerirCoincidencias`: igual exacto, o uno contiene al otro con al menos 5 letras (las
  del contenido). Exactas primero; no sugiere una cuenta para una ficha que creó esa cuenta.
- `soloCambios`: `""` y `undefined` cuentan como `null`; arreglos por contenido en orden;
  objetos sin importar el orden de las claves.
- `siguienteOrden`: mayor `orden` + 1, o `1` sin adicionales (la principal es el `0`).
- `argsPrincipal`: `cuenta` → `{ p_musico: id, p_artist: null }`, `ficha` → al revés; otro
  `tipo` lanza `banda sin tipo`.
- `estaEnElEvento`: `true` si hay una banda con el mismo `tipo` e `id`.

Si al aplicar el spec 188 o el 189 ya exportan un tipo equivalente a `BandaRef`, este se
queda igual (es estructural): no se importa de ellos para no crear dependencia de orden.

### 2. `src/lib/edicionAdmin.ts` (nuevo) — puro, solo `import type`

Port de `sonopolisWeb/libs/edicionAdmin.js` (sin los `href…`: en la app volver es
`navigation.goBack()`) más la regla de permisos del evento, para poder probarla con `node`.

```ts
import type { EventRole } from '../types';

export interface EventoPermisos {
  rol: EventRole | null;
  esOwner: boolean;
  puedeEditar: boolean;
  puedeInvitar: boolean;
  puedeBorrar: boolean;
  esAdmin: boolean;     // la sesión es admin de Sonópolis (tenga o no rol en el evento)
  comoAdmin: boolean;   // edita SOLO por ser admin: no es del equipo ni lo creó
}

export function decidirEdicion(p: {
  userId: string | null | undefined; rol: string | null; esAdmin: boolean;
  rolDueno: 'musician' | 'local'; objetivoId?: string | null; duenoId?: string | null;
}): { permitido: boolean; comoAdmin: boolean };

export function puedeEditarComoDueno(p: { userId: string | null | undefined; duenoId: string | null | undefined; esAdmin: boolean }): boolean;

export function permisosDeEvento(p: {
  colaboracion: { role: EventRole; canDelete: boolean } | null;
  esCreador: boolean;
  esAdmin: boolean;
}): EventoPermisos;
```

- `decidirEdicion` y `puedeEditarComoDueno`: copia de la web.
  - Sin `objetivoId`, o con `duenoId === userId`: `permitido = rol === rolDueno`, `comoAdmin = false`.
  - Con `objetivoId` de otro (`duenoId` puede ser `null`: local sin dueño):
    `permitido = comoAdmin = esAdmin`.
  - `puedeEditarComoDueno = Boolean(userId) && (userId === duenoId || esAdmin)`.
- `permisosDeEvento`, en este orden:
  1. Con `colaboracion`: lo de hoy (`esOwner = role === 'owner'`, `puedeEditar = true`,
     `puedeInvitar = esOwner || role === 'admin'`, `puedeBorrar = esOwner || canDelete`),
     `comoAdmin = false`.
  2. Si no, con `esCreador`: lo de hoy (todo `true`, `rol = 'owner'`), `comoAdmin = false`.
  3. Si no, con `esAdmin`: `{ rol: null, esOwner: false, puedeEditar: true,
     puedeInvitar: false, puedeBorrar: false, comoAdmin: true }`. El admin edita (spec 078,
     `can_edit_event`), pero no invita ni borra: `events_delete` es solo del owner (specs
     059/060) y el equipo es del dueño.
  4. Si no: todo `false`.
  - `esAdmin` del resultado = el `esAdmin` recibido, en los cuatro casos.

`EventRole` se importa con `import type` para que `node` pueda cargar el archivo (Node 26
quita las importaciones de solo tipos).

### 3. `src/hooks/useEventoPermisos.ts`

- Llama a `useEsAdmin()` y arma el resultado con `permisosDeEvento({ colaboracion,
  esCreador, esAdmin })`. Mientras `useEsAdmin` carga, `esAdmin` es `false` (con la duda no
  se abre nada, igual que el spec 152).
- `EventoPermisos` pasa a definirse en `src/lib/edicionAdmin.ts`; el hook lo reexporta
  (`export type { EventoPermisos } from '../lib/edicionAdmin'`) para que
  `src/components/AccionesEvento.tsx` no cambie su import.
- Sin `eventoId` o sin `user`: `SIN_PERMISOS` con `esAdmin: false, comoAdmin: false`.
- Efecto en pantallas que ya leen el hook (sin tocarlas): el admin ve «Gestión del evento»
  en `DetalleEventoScreen`, entra a `EditarEventoScreen`, `EntradasEventoScreen` y al
  escáner de un evento ajeno; no ve «Equipo», «Cobrar» ni «Borrar». Es lo mismo que la base
  ya le permite. El texto «Tu rol: …» con `rol: null` lo resuelve el spec 206.

### 4. `src/lib/adminEdicion.ts` (nuevo) — con `supabase` de `src/lib/supabase`

Port de `sonopolisWeb/libs/data/adminEdicion.js` (versión W-348) y de `libs/data/lineup.js`
(W-354), recortado a lo que usa el spec 206. Todo con la sesión del admin. Cada escritura
relanza el error de la base tal cual (`throw error`): sus mensajes ya vienen en español y
son el texto que ve el admin.

**Tipos:**

```ts
export interface CuentaMusicoAdmin { id: string; nombre: string; ciudad: string | null; eventos: number }
export interface FichaSueltaAdmin {
  id: string; name: string; genero: string | null; comuna: string | null;
  contacto: string | null; instagram: string | null; createdBy: string | null;
  eventos: number; primerLocal: string | null;   // venue_name del primer evento, para «Creada en un evento de X»
}
export interface EventoDeFicha { id: string; nombre: string; fecha: string | null; comienzaAt: string | null; local: string | null; principal: boolean }
export interface BandaEncontrada extends BandaRef { nombre: string }
export interface BandaDelEvento extends BandaRef { nombre: string; orden: number }
```

**Lecturas** (como máximo 50 filas cada lista; `q` filtra por nombre con `ilike`, escapando
`%`, `_` y `\` como `patron()` de la web):

- `listarCuentasMusico(q?: string): Promise<CuentaMusicoAdmin[]>` — `profiles` con
  `role = 'musician'`, orden por `nombre`; `eventos` = eventos distintos donde la cuenta es
  principal (`events.musico_id`) o adicional (`event_artists.musico_id`).
- `listarFichasSueltas(q?: string): Promise<FichaSueltaAdmin[]>` — `artists` con
  `profile_id is null`, orden por `name`; `eventos` y `primerLocal` salen de
  `eventosDeFichas`.
- `eventosDeFichas(ids: string[]): Promise<Map<string, EventoDeFicha[]>>` — port de
  `eventosPorFicha` de `admin/crm/ventanas/datos.js`: principal (`events.artist_id`) o
  adicional (`event_artists.artist_id` con `events(...)`), sin repetir, principales
  primero, ordenados por `comienza_at` (sin fecha al final).
- `fichaSueltaPorId(id: string): Promise<FichaSueltaAdmin | null>` — la ficha si sigue
  suelta (`profile_id is null`); `null` si ya no existe (la conectaron o la unieron).
- `buscarBandasAdmin(q: string, tipos: TipoBanda[] = ['cuenta', 'ficha']): Promise<BandaEncontrada[]>`
  — menos de 2 caracteres devuelve `[]`; cuentas de músico primero (8 como máximo), después
  fichas sueltas (8 como máximo), cada grupo por nombre. Es el buscador del selector del
  admin; no reemplaza a `buscarArtistas` (spec 188), que es el del dueño.
- `bandasDelEventoAdmin(eventId: string): Promise<BandaDelEvento[]>` — la principal
  (`events.musico_id` → `profiles.nombre`, o `events.artist_id` → `artists.name`) con
  `orden: 0`, y después las de `event_artists` del evento por `orden`, cada una `cuenta` o
  `ficha`. Si el spec 189 ya dejó un lector equivalente en `src/lib/lineup.ts`, se puede
  usar por dentro sin cambiar esta firma.

**Escrituras:**

- `adminEditarBanda(id: string, cambios: Record<string, unknown>): Promise<any | null>` —
  `rpc('admin_editar_banda', { p_id, p_datos: cambios })`; con `cambios` vacío devuelve
  `null` sin llamar a la base.
- `adminVincularBanda(artistId: string, profileId: string): Promise<void>` —
  `rpc('admin_vincular_banda', { p_artist, p_profile })`.
- `adminUnirBandas(origenId: string, destinoId: string): Promise<{ eventos_principal: number; eventos_adicional: number; invitaciones: number }>`.
- `adminCambiarLocalEvento(eventId: string, venueId: string): Promise<any>` — devuelve la fila.
- `adminCambiarPrincipalEvento(eventId: string, banda: BandaRef): Promise<any>` —
  `rpc('admin_cambiar_principal_evento', { p_event: eventId, ...argsPrincipal(banda) })`;
  devuelve la fila (de ahí sale `artist_name` para que el formulario no pise el nombre nuevo).
- `agregarBandaAdicional(eventId: string, banda: BandaRef, orden: number): Promise<void>` —
  `insert` en `event_artists` con `musico_id` o `artist_id` según `banda.tipo`. Error de la
  base tal cual (p. ej. «esa banda ya es la principal del evento»).
- `quitarBandaAdicional(eventId: string, banda: BandaRef): Promise<void>` — `delete` por
  `event_id` y `musico_id` o `artist_id`, con `.select('id')`; si no borró ninguna fila,
  lanza `new Error('esa banda no está en el evento')`.
- `guardarPerfilMusicoComoAdmin(cuentaId: string, fila: Record<string, unknown>): Promise<void>`
  — `from('profiles').update(fila).eq('id', cuentaId).eq('role', 'musician').select('id')`.
  Sin filas lanza `new Error('No se guardó: esa cuenta no es de músico o tu sesión no es admin.')`.
  `fila` es lo que arma `mapProfileToDB` en `EditarPerfilBandaScreen`.
  **Por qué un `update` y no el `upsert` del dueño:** un `INSERT … ON CONFLICT DO UPDATE`
  pasa también por la policy de INSERT de `profiles` (solo `auth.uid() = id`), así que el
  `upsert` del dueño falla para el admin aunque W-350 le abrió el UPDATE. `role: 'musician'`
  e `id` viajan en la fila sin cambiar de valor: el guardia de W-350 solo mira columnas que
  cambian.

No hace falta nada nuevo para el local: `updateVenue` de `VenuesContext` ya hace `update`
por `id`, y direcciones y fotos usan las policies de admin de W-350.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `src/lib/bandas.ts` con `node` (`import('./src/lib/bandas.ts')`):
   - `normalizarNombreBanda('Los Vecinos del Ruido!') === normalizarNombreBanda('vecinos del ruido')`;
     `normalizarNombreBanda('R.E.M.') === 'rem'`; `normalizarNombreBanda('La Banda') === 'banda'`.
   - `sugerirCoincidencias` con una exacta, una por contención (≥ 5 letras), una que no
     coincide y una ficha creada por la misma cuenta (no se sugiere); las exactas primero.
   - `soloCambios` con un campo igual, uno distinto, `""` frente a `null` y un objeto igual
     con las claves en otro orden.
   - `siguienteOrden([])` → `1`; `siguienteOrden([{ orden: 1 }, { orden: 4 }])` → `5`.
   - `argsPrincipal` con `cuenta`, con `ficha` y con un `tipo` inválido (lanza `banda sin tipo`).
   - `estaEnElEvento`: misma banda → `true`; mismo `id` con otro `tipo` → `false`.
3. `src/lib/edicionAdmin.ts` con `node`:
   - `decidirEdicion`: músico sin objetivo → permitido, no admin; fan sin objetivo en un
     formulario de músico → no permitido; admin (rol `fan`) con objetivo de otro →
     permitido y `comoAdmin`; no admin con objetivo de otro → no permitido; admin con su
     propio id como objetivo → como dueño; local con `duenoId = null` y admin → permitido y `comoAdmin`.
   - `puedeEditarComoDueno`: dueño → `true`; admin → `true`; otro → `false`; sin sesión → `false`.
   - `permisosDeEvento`: colaborador `editor` → como hoy y `comoAdmin: false`; creador sin
     fila → owner; admin sin fila → `puedeEditar: true`, `puedeBorrar: false`,
     `puedeInvitar: false`, `comoAdmin: true`; admin con fila `owner` → como owner,
     `esAdmin: true`, `comoAdmin: false`; nadie → todo `false`.
4. `grep -n "^import" src/lib/bandas.ts` no devuelve nada, y `grep -n "^import" src/lib/edicionAdmin.ts`
   devuelve solo líneas `import type`.
5. `grep -n "admin_desvincular_banda\|admin_editar_perfil_musico\|admin_editar_local" src/lib/adminEdicion.ts`
   no devuelve nada.
6. `git diff --stat` del commit toca solo los cuatro archivos de «Capa» y los del cierre;
   `src/hooks/useAdminCrm.ts` y `src/lib/lineup.ts` no aparecen.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

Se prueban con las pantallas del 206 (sesión del admin, eventos y fichas de prueba, logout
con `scope: 'local'` al terminar, sin cuentas de terceros):
- Guardar el perfil de una cuenta de músico ajena: cambia y deja una fila en `admin_ediciones`.
- Conectar una ficha suelta con una cuenta: la ficha desaparece y sus eventos salen en el
  perfil del músico.
- Cambiar la banda principal y el local de un evento; agregar y quitar una banda adicional.
- Un dueño de evento que no es admin sigue igual (sin «Equipo» de más ni bloque de admin).

## Fuera de alcance

- Pantallas: spec 206.
- Retirar `admin_editar_perfil_musico` / `admin_editar_local` de la base.
- Unir locales duplicados, cambiar el dueño de un local o crear un local para otro (sigue
  la invitación de W-230 en `AdminLocalesScreen`).
- Pagos del evento ajeno (`event_payouts`): siguen siendo solo del owner (W-350).

## Bugs encontrados al aplicar (28-nov-2026)

- **Orden de `eventosDeFichas`.** El spec pide «principales primero, ordenados por `comienza_at`»,
  pero `eventosPorFicha` de la web ordena todo junto por fecha (su comentario dice lo contrario).
  Se aplicó el texto del spec: principales primero y, dentro de cada grupo, por fecha. Por eso
  `primerLocal` puede diferir del que muestra la web en una ficha que además es adicional de un
  evento más antiguo.
- **`esAdmin` al cambiar de cuenta.** `useEsAdmin` conserva la respuesta anterior mientras pregunta
  por la nueva. El hook usa `esAdmin && !cargando` para cumplir «mientras carga es `false`».
