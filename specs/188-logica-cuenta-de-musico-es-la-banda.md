# Spec 188 — La app lee y escribe la banda como cuenta de músico o ficha suelta

> Estado: propuesto (27-nov-2026)
> Capa: LÓGICA. `src/types/index.ts`, `src/context/EventosContext.tsx`, `src/lib/artistas.ts`, `src/lib/cuentaEsBanda.ts` (nuevo), `src/hooks/useFeedFan.ts`, `src/hooks/useTenantCrm.ts`, `src/hooks/useAdminCrm.ts`, `src/hooks/useTenantAdmin.ts`, `src/screens/VentasMusicoScreen.tsx`.
> Depende de: W-347 (migración `supabase/migrations/20261125140000_spec_w347_cuenta_de_musico_es_la_banda.sql`, ya en producción: `events.musico_id`, `event_artists.musico_id`, normalización de fichas con cuenta). Ningún spec de la app.
> Alimenta: spec 189 (lineup), spec 198 (frontend de bandas del evento).
> Hermano en la web: W-348 (`libs/data/artists.js`, `libs/mappers.js`, `libs/crmTenants.js`, `libs/data/adminCrm.js`, `libs/data/whatsapp.js`, `libs/data/muro.js`).

> **En una frase:** la app trata cada banda como `{ tipo: 'cuenta' }` (una cuenta de músico,
> `events.musico_id`) o `{ tipo: 'ficha' }` (una banda sin cuenta, `events.artist_id`), busca
> las dos juntas con las cuentas primero, y corrige el feed del fan, el tenant del evento, los
> conteos del admin y las ventas del músico, que hoy pierden los eventos con `musico_id`.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en el
mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después de
esta orquestación.»

W-347 ya está en producción y la base es compartida: desde el 25-nov-2026 un evento cuya banda
tiene cuenta apunta a `events.musico_id` y no a `events.artist_id` (8 eventos pasaron). La app
sigue leyendo solo `artist_id`, y eso produce errores hoy, sin que nadie toque la app:

1. `buscarArtistas` (`src/lib/artistas.ts:16-28`) busca solo en `artists`: las cuentas de
   músico no aparecen al crear un evento, se crean fichas duplicadas y la banda no queda admin.
2. `useFeedFan.ts:59` filtra por `artist_id` (vía `artists.profile_id`) y `created_by`: un fan
   que sigue a una banda no ve los eventos donde la banda es `musico_id` o banda adicional.
3. `useTenantCrm.ts:141-151` (paso 3) resuelve el tenant solo por `artist_id` →
   `artists.profile_id`: un evento con `musico_id` y sin local queda sin tenant (sin opt-in).
4. `useAdminCrm.ts:51-70` cuenta eventos con la regla vieja de dueño único y ficha → cuenta.
5. `VentasMusicoScreen.tsx:46` cuenta solo los eventos con `created_by = yo`: una banda que
   toca en el evento de un local no ve esas ventas aunque es admin del evento.

## Decisión

### `src/types/index.ts`

- `Evento` suma `musicoId?: string | null` — `events.musico_id` (W-347): la cuenta de músico que
  es la banda principal. Se corrige el comentario de `artistId` (línea 52), que hoy dice «FK
  opcional a profiles»: pasa a decir «ficha de banda sin cuenta (`artists`, spec 061). Un
  evento tiene `musicoId` o `artistId`, nunca los dos (check `events_una_banda_principal`)».
- Tipo nuevo:

```ts
/** Spec 188 (W-348) — una banda del evento. Con `tipo: 'cuenta'`, `id` es de `profiles`
 * (una cuenta de músico); con `'ficha'`, de `artists` (una banda sin cuenta). Dos bandas son
 * la misma solo si coinciden `tipo` e `id`. */
export interface Banda {
  tipo: 'cuenta' | 'ficha';
  id: string;
  nombre: string;
  foto: string | null;
  orden?: number; // 0 = principal; 1, 2, … = adicionales (event_artists.orden). Solo al leer un lineup.
}
```

### `src/lib/cuentaEsBanda.ts` (nuevo, puro)

Sin red y sin imports de valor: solo `import type` (de `../types` y `./adminPro`), para que se
pruebe con `node` directo (Node 26 quita los tipos). Port de las reglas puras de W-348.

```ts
export const MAX_BANDAS = 8;

export function bandaDeLaCuenta(perfil: { id: string; nombre?: string | null; foto?: string | null }): Banda;
export function bandaDeFicha(ficha: { id: string; name?: string | null; image?: string | null }): Banda;

/** Cuentas primero, después fichas; cada grupo por `nombre` (localeCompare 'es');
 * como máximo MAX_BANDAS en total. No modifica sus argumentos. */
export function juntarBandas(cuentas: Banda[], fichas: Banda[]): Banda[];

/** A quiénes pertenece un evento en el CRM (W-301/W-348, misma regla que
 * `privado.crm_base`): el creador si es músico, el local, la cuenta principal (`musicoId`) y
 * cada cuenta adicional. Sin repetidos. Una ficha suelta no suma tenant. */
export function tenantsDeEvento(
  evento: { id: string; createdBy: string | null; venueId: string | null; musicoId?: string | null },
  reglas: { musicosIds: Set<string>; adicionalesPorEvento: Map<string, string[]> }
): { type: TipoTenant; id: string }[];

/** Para el feed del fan: la cuenta seguida que firma el evento. Orden: la principal
 * (`musicoId`), las adicionales en su orden, el creador. `null` si ninguna está en `seguidos`. */
export function musicoAutorDelEvento(
  evento: { musicoId?: string | null; createdBy: string },
  adicionales: string[],
  seguidos: Set<string>
): string | null;

/** Une listas de filas por `id`, la primera aparición gana. No modifica sus argumentos. */
export function unirPorId<T extends { id: string }>(...listas: T[][]): T[];
```

`bandaDeLaCuenta` usa `nombre ?? ''` y `foto ?? null`; `bandaDeFicha`, `name ?? ''` e
`image ?? null`. `tenantsDeEvento` es la copia de `tenantsDeEvento` de
`sonopolisWeb/libs/crmTenants.js` con la clave `"<type>:<id>"` para no repetir; su segundo
argumento es un `Map<eventId, string[]>` con solo las cuentas (la app no necesita las fichas).

### `src/lib/artistas.ts`

- `buscarBandas(q: string): Promise<Banda[]>` — reemplaza a `buscarArtistas` para el selector.
  Con menos de 2 letras devuelve `[]`. Dos consultas en paralelo, como `buscarBandas` de la web:
  - `profiles` con `role = 'musician'` e `ilike('nombre', %q%)`, `select('id, nombre, foto')`,
    orden por `nombre`, `limit(MAX_BANDAS)` → `bandaDeLaCuenta`;
  - `artists` con `.is('profile_id', null)` e `ilike('name', %q%)`, `select('id, name, image')`,
    orden por `name`, `limit(MAX_BANDAS)` → `bandaDeFicha`.

  Devuelve `juntarBandas(cuentas, fichas)`. Cualquier error de las dos se lanza.
- `crearFichaSuelta({ nombre, contacto, instagram, creadoPor }): Promise<Banda>` — mismo insert
  que `crearArtista` (sin `profile_id`: una banda con cuenta es la cuenta, no una ficha),
  `select('id, name, image')`, devuelve `bandaDeFicha`. Mismo error si falta `creadoPor`:
  «Un artista necesita quién lo registra (creadoPor)».
- `eventosDeLaCuenta(musicoId: string): Promise<any[]>` — filas crudas de `events` donde la
  cuenta es creadora, principal o adicional. En paralelo:
  `events.select('*').or('created_by.eq.<id>,musico_id.eq.<id>')` y
  `event_artists.select('event_id').eq('musico_id', <id>)`; con los `event_id` que falten, una
  tercera consulta `events.select('*').in('id', faltan)`. Devuelve `unirPorId(...)` ordenado por
  `fecha` descendente (comparación de texto, igual que el `.order('fecha', desc)` de hoy).
  Lo usa `VentasMusicoScreen`; el spec 193 (próximos eventos del perfil) puede reusarlo.
- `buscarArtistas`, `crearArtista` y `ArtistaBreve` **se quedan** con `@deprecated` en su
  JSDoc («usar `buscarBandas` / `crearFichaSuelta` (spec 188)»): `ArtistaSelector.tsx` y
  `CrearEventoScreen.tsx` los usan hasta el spec 198, y este spec no toca esas pantallas.
  Borrarlos queda como deuda para cuando el 198 esté aplicado.

### `src/context/EventosContext.tsx`

- `mapEventoFromDB` suma `musicoId: db.musico_id ?? null` (junto a `artistId`, línea 44).
- `mapEventoToDB` suma `musico_id: evento.musicoId ?? null` (junto a `artist_id`, línea 73).
- `createEvento`: si llegan `artistId` y `musicoId` a la vez, lanza antes de ir a la base
  `new Error('Un evento tiene una sola banda principal: una cuenta o una ficha, no las dos')`
  (W-348: `createEvento` rechaza los dos a la vez). El check de la base lo rechazaría igual,
  pero con un mensaje en inglés.
- `updateEvento` no cambia: la banda principal sigue sin editarse desde la app (spec 034).
  Si la app cambiara `artist_id` en el futuro, la normalización de W-347 reemplaza la cuenta.

### `src/hooks/useFeedFan.ts`

Con músicos seguidos:

1. `event_artists.select('event_id, musico_id').in('musico_id', idsMusicos)` → mapa
   `eventId → musicoIds[]` (solo cuentas seguidas) y la lista de `event_id`.
2. `events` publicados con
   `.or([musico_id.in.(ids), created_by.in.(ids), venue_id.in.(idsVenues), id.in.(eventIds)])`
   (cada cláusula solo si su lista no está vacía), mismo orden y `limit(50)` de hoy.
3. Autor: `musicoAutorDelEvento(evento, adicionales.get(evento.id) ?? [], seguidos)`; si da una
   cuenta, autor músico; si no, el local seguido como hoy.

Se borra la consulta a `artists.profile_id` y el mapa `perfilPorArtista`: después de W-347
ningún evento apunta a una ficha con cuenta (la normalización la convierte). El comentario de
cabecera se actualiza a la regla nueva.

### `src/hooks/useTenantCrm.ts`

`resolverTenantDelEvento`, paso 3 (líneas 141-151): en lugar de `artistId` → `artists.profile_id`,
`if (evento.musicoId) return tenantDePerfil(evento.musicoId, evento.artista, false);`. Una
ficha suelta no tiene cuenta ni tenant (igual que `getTenantDelEvento` de la web). En
`useTenantDelEvento`, la dependencia `artistId` del efecto pasa a `musicoId`. Los pasos 1 y 2 no
cambian. El comentario de la función se actualiza.

### `src/hooks/useAdminCrm.ts`

- `EventoDeTenant` suma `musicoId: string | null`.
- `ReglasTenant` pasa a `{ musicosIds: Set<string>; adicionalesPorEvento: Map<string, string[]> }`.
- `cargarEventosYReglas`: el `select` de `events` suma `musico_id`; la tercera consulta deja de
  leer `artists` y lee `event_artists.select('event_id, musico_id').not('musico_id', 'is', null)`
  para armar `adicionalesPorEvento`.
- Se borra `tenantDeEvento` (singular). El conteo de `eventosActivos` suma 1 a **cada** tenant de
  `tenantsDeEvento(e, reglas)` (de `src/lib/cuentaEsBanda.ts`), como `/admin/crm` de la web desde
  W-303: un evento de un local con dos bandas con cuenta cuenta para los tres.
- `esEventoActivo` no cambia.

### `src/hooks/useTenantAdmin.ts`

`cargarPrincipal` (línea 90): `eventosActivos` = eventos donde
`tenantsDeEvento(e, reglas).some((t) => t.type === tipo && t.id === id)` y `esEventoActivo`.
El import de `tenantDeEvento` pasa a `tenantsDeEvento` desde `../lib/cuentaEsBanda`.

### `src/screens/VentasMusicoScreen.tsx`

`cargarVentas` (línea 45): la consulta `events … .eq('created_by', user.id)` pasa a
`eventosDeLaCuenta(user.id)`. El resto (tickets, agrupación, totales, interfaz) no cambia.
Leer las entradas de esos eventos ya está permitido: `tickets_select_event_team` (spec 038) deja
leer al equipo, y W-347 hace admin a la cuenta principal y a cada adicional.

### Lo que NO cambia

- `ArtistaSelector.tsx`, `CrearEventoScreen.tsx`, `DetalleEventoScreen.tsx` y `TarjetaEvento.tsx`
  → spec 198.
- La lectura de `event_artists` como lineup y el título con todas las bandas → spec 189.
- La base: ninguna migración (W-347 ya está pusheada).

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. Prueba con `node` de `src/lib/cuentaEsBanda.ts` (importado directo, sin compilar), con un
   script en el scratchpad que afirme:
   - `juntarBandas`: con 3 cuentas y 7 fichas devuelve 8, las 3 cuentas primero, cada grupo por
     nombre; no modifica los arreglos de entrada;
   - `tenantsDeEvento`: un evento con creador músico, local, `musicoId` y dos adicionales (una
     repetida con el creador) da 4 tenants sin repetir; un creador que no está en `musicosIds`
     no suma; sin `musicoId` ni adicionales da solo creador y local;
   - `musicoAutorDelEvento`: gana la principal seguida; sin principal seguida, la primera
     adicional seguida; si no, el creador seguido; si no, `null`;
   - `unirPorId`: sin repetidos, gana la primera aparición.
3. `grep -n "musico_id" src/context/EventosContext.tsx` devuelve las dos líneas del mapeo.
4. `grep -rn "perfilPorArtista\|tenantDeEvento\b" src` no devuelve nada.
5. `grep -n "eq('created_by'" src/screens/VentasMusicoScreen.tsx` no devuelve nada.
6. `git diff --stat` del commit toca solo los nueve archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Fan que sigue a Felio Saud (cuenta): ve en su feed un evento con Felio como `musico_id` y otro
  donde Felio es banda adicional.
- Comprar una entrada de un evento con `musico_id` y sin local con Pro: el opt-in sale a nombre
  de la banda.
- Admin → CRM: los eventos activos de una banda con cuenta cuentan los eventos donde es principal
  o adicional.
- Músico con un evento creado por un local donde es banda: aparece en «Ventas» con sus entradas.
