# Spec 123 — `useSeguir`: seguir músicos y locales, y el feed de lo que anuncian

> Estado: propuesto (16-oct-2026)
> Capa: LÓGICA. `src/lib/follows.ts` (nuevo), `src/hooks/useSeguir.ts` (nuevo), `src/hooks/useSeguidos.ts` (nuevo), `src/hooks/useFeedFan.ts` (nuevo), `src/types/index.ts`.
> Depende de: spec 047, spec 119, spec 121
> Alimenta: spec 124 (botón de seguir y panel de fan), spec 127 (botón de seguir en el detalle del local).
> Hermano en la web: W-098 (seguidores), W-194 (el feed reconoce al músico del evento), W-195 (a quién sigo). Archivos: `sonopolisWeb/libs/data/follows.js`, `components/BotonSeguir.js`, `libs/data/events.js:58` (`cuentasDelEvento`), `libs/data/artists.js:42` (`getPerfilesDeArtistas`), `app/(private)/fan/page.js`.

> **En una frase:** las tablas `follows_musicians` y `follows_venues` existen desde
> agosto y la web las usa para el botón «Seguir» y el feed del fan; la app no las lee ni
> las escribe — este spec da las funciones y los hooks para hacerlo.

## Contexto

- **Tablas y RLS** (spec 047, `20260815232523_spec_047_seguir_musicos_locales.sql`):
  - PK `(follower_id, musician_id)` y `(follower_id, venue_id)`: seguir dos veces choca con
    `23505` (violación de unicidad).
  - `SELECT`, `INSERT` y `DELETE` solo sobre las filas propias
    (`auth.uid() = follower_id`). Por eso las funciones reciben el `userId` explícito, igual
    que en la web: la base no lo infiere.
  - `follows_musicians_insert` además exige que el seguido tenga `role = 'musician'`
    (`:25-29`): seguir a un fan o a un local por esa tabla falla por RLS.
  - Los specs W-098 y W-191 solo agregan lectura para el dueño del perfil y para el admin; no
    cambian lo que hace un fan.
- **La app** no tiene ninguna referencia a `follows_` en `src/`.
- **El feed de la web** (`fan/page.js`, sección «Feed») muestra los eventos publicados de
  músicos y locales seguidos, ordenados por fecha de publicación (`created_at`). Para saber
  si un evento es «del músico» usa `cuentasDelEvento` (`libs/data/events.js:58`): primero la
  cuenta que reclamó el registro de banda (`artists.profile_id` del `artist_id` del evento),
  después `created_by`. **Nunca** compara `events.artist_id` contra el id del músico: desde
  el spec 061 apunta a `artists`, no a `profiles`, y no coincide nunca (bug del W-195).
- **Lo que deja el 119:** `mapEventoFromDB` exportado y `Evento.createdAt`/`comienzaAt`.
  **Lo que deja el 121:** `mapProfileFromDB` con `avatar` y `pais`.

## Diseño

### 1. Tipos (`src/types/index.ts`)

```ts
export type TipoSeguible = 'musico' | 'venue';

/** Lo mínimo de un local seguido para listarlo (ver Decisión 2). */
export type VenueSeguido = Pick<Venue, 'id' | 'name' | 'type' | 'comuna' | 'image'>;

export interface ItemFeed {
  evento: Evento;
  autor: { tipo: TipoSeguible; id: string; nombre: string };
}
```

### 2. `src/lib/follows.ts` (nuevo)

Funciones async sobre el cliente `supabase` de `src/lib/supabase.ts`. Una tabla por tipo:

```ts
const TABLA = {
  musico: { tabla: 'follows_musicians', columna: 'musician_id' },
  venue:  { tabla: 'follows_venues',    columna: 'venue_id' },
} as const;
```

| Función | Qué hace |
|---|---|
| `sigoA(tipo, userId, targetId): Promise<boolean>` | `select(columna).eq('follower_id', userId).eq(columna, targetId).maybeSingle()` |
| `seguir(tipo, userId, targetId): Promise<void>` | `insert({ follower_id, [columna]: targetId })`. Un error `23505` se trata como éxito: ya lo seguía, que es el estado pedido (pasa con dos toques rápidos o dos pantallas abiertas) |
| `dejarDeSeguir(tipo, userId, targetId): Promise<void>` | `delete().eq('follower_id', userId).eq(columna, targetId)`. Borrar algo que no existe no es error |
| `getIdsSeguidos(tipo, userId): Promise<string[]>` | `select(columna).eq('follower_id', userId)` |
| `getMusicosSeguidos(userId): Promise<PerfilMusico[]>` | ids → `profiles.select('*').in('id', ids)` → `mapProfileFromDB`. Sin ids, `[]` sin consultar |
| `getVenuesSeguidos(userId): Promise<VenueSeguido[]>` | ids → `venues.select('id, name, type, comuna, image').in('id', ids)`. Sin ids, `[]` |

Toda función que recibe `error` de Supabase lo **lanza** (`throw error`), salvo el `23505`
de `seguir`. Sin `catch {}`.

**Decisión 1 — `userId` explícito, igual que la web.** Leerlo de la sesión adentro de cada
función sería un `getSession()` extra por llamada y escondería la dependencia; los hooks ya
tienen `user` de `useAuth()`.

**Decisión 2 — el local seguido se lee con 5 columnas y sin `mapVenueFromDB`.** El mapper de
locales es privado de `VenuesContext.tsx`, que ya tocan los specs 095, 096, 115, 127, 133 y
134. Exportarlo desde acá metería a este spec en esa cola por una lista de nombres. Las cinco
columnas se copian tal cual en `getVenuesSeguidos` (`id`, `name`, `type`, `comuna` e `image`
se llaman igual en la tabla y en el tipo `Venue`), con un comentario que diga por qué no se
usa el mapper del contexto.

### 3. `src/hooks/useSeguir.ts` (nuevo) — un botón

```ts
export function useSeguir(tipo: TipoSeguible, targetId: string): {
  siguiendo: boolean;
  cargando: boolean;
  error: string | null;
  haySesion: boolean;
  alternar: () => Promise<boolean>;   // true si quedó aplicado
}
```

- Lee `user` de `useAuth()`. Sin sesión: `siguiendo = false`, `haySesion = false`, no
  consulta, y `alternar()` devuelve `false` sin tocar la base (la pantalla decide qué
  ofrecer).
- Al montar (y si cambia `targetId` o `user`), `sigoA`. Mientras tanto `cargando = true`.
- `alternar()`: `cargando = true`; llama `seguir` o `dejarDeSeguir` según el estado; **solo
  después** de que la base responde cambia `siguiendo` (no optimista, igual que
  `BotonSeguir.js`: si la RLS rechaza, el botón no miente). Error → `error = mensaje`,
  `console.error`, devuelve `false`.

### 4. `src/hooks/useSeguidos.ts` (nuevo) — a quién sigo

```ts
export function useSeguidos(): {
  musicos: PerfilMusico[];
  venues: VenueSeguido[];
  loading: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
}
```

- `getMusicosSeguidos` y `getVenuesSeguidos` en paralelo (`Promise.all`).
- Deja fuera los músicos sin nombre (mismo criterio que `useMusicos`, W-194).
- Sin sesión: listas vacías, `loading = false`, sin consultar.
- `refrescar` existe porque seguir desde otra pantalla no avisa a esta; el panel del fan lo
  llama al volver a tener foco (spec 124).

### 5. `src/hooks/useFeedFan.ts` (nuevo) — lo que anuncian los que sigo

```ts
export function useFeedFan(musicos: PerfilMusico[], venues: VenueSeguido[]): {
  feed: ItemFeed[];
  loading: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
}
```

Recibe las listas de `useSeguidos` en vez de volver a pedirlas: el panel ya las tiene.

Pasos (dependencias del efecto: los ids unidos con coma, no los arreglos):

1. `idsMusicos`, `idsVenues`. Si los dos están vacíos → `feed = []`, sin consultar.
2. Registros de banda reclamados por los músicos seguidos:
   `artists.select('id, profile_id').in('profile_id', idsMusicos)` → mapa
   `artistId → profileId`. (`artists_select` es `USING (true)`, spec 061.)
3. Eventos publicados de cualquiera de los tres orígenes, en una sola consulta:
   `events.select('*').eq('status', 'published').or(<cláusulas>).order('created_at', { ascending: false }).limit(50)`,
   con `<cláusulas>` = las que tengan ids, unidas con coma:
   `artist_id.in.(…artistIds)`, `created_by.in.(…idsMusicos)`, `venue_id.in.(…idsVenues)`.
   Es la búsqueda al revés de la web (que trae todos los eventos y filtra en memoria): acá
   no hay servidor que cargue todo, y traer la cartelera entera al teléfono para quedarse con
   unos pocos no tiene sentido.
4. Mapea con `mapEventoFromDB` (exportado por el 119).
5. Autor de cada evento, en este orden (el de `cuentasDelEvento`): si
   `perfilPorArtista.get(evento.artistId)` es un músico seguido → ese músico; si no, si
   `evento.createdBy` es un músico seguido → ese músico; si no, el local seguido
   `evento.venueId`. Un evento sin autor (no debería pasar) se descarta. Con músico y local
   seguidos en el mismo evento, gana el músico: «publicó» se lee más personal que «programó»
   (criterio de la web).
6. Orden final por `evento.createdAt` descendente.

Sin filtro de país: el feed es de lo que sigo, y un músico chileno que toca en México sigue
siendo alguien que sigo (mismo criterio que `getEventos(supabase)` sin `pais` en
`fan/page.js`).

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin errores.
2. Con sesión de fan, `seguir('musico', …)` sobre un músico crea la fila; `sigoA` devuelve
   `true`; `dejarDeSeguir` la borra y `sigoA` vuelve a `false`.
3. `seguir` dos veces seguidas sobre el mismo músico no lanza (el `23505` se absorbe).
4. `seguir('musico', …)` sobre el id de un fan **lanza** (la RLS lo rechaza) y `useSeguir`
   deja `siguiendo = false` con `error` no nulo.
5. `useSeguidos` devuelve los músicos y locales seguidos con nombre; sin sesión devuelve
   listas vacías sin consultar.
6. Siguiendo a un músico que reclamó su registro en `artists`, un evento publicado con ese
   `artist_id` y creado por otra cuenta aparece en `useFeedFan` con ese músico como autor.
7. Siguiendo solo a un local, sus eventos publicados aparecen con el local como autor; un
   `draft` de ese local no aparece.
8. `rg -n "follows_" src/` solo aparece en `src/lib/follows.ts`.

## Fuera de alcance

- Cualquier pantalla o componente (spec 124; el detalle del local es del 127).
- Ver quién me sigue (lado del músico o del local, W-098): es parte del CRM, fuera del plan.
- Notificaciones push de eventos nuevos de quien sigo.
- Paginar el feed más allá de 50.

## Verificación manual (candidatas a `V#`)

- V-a: seguir a un músico desde la app y comprobar que la web (`/fan`, misma cuenta) lo
  muestra en «Sigues a», y al revés.
