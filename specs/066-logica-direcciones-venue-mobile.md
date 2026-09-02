# Spec 066 — Hook `useVenueAddresses` (equivalente móvil de W-063)

**Capa: LÓGICA · `src/hooks/useVenueAddresses.ts`, `src/types/index.ts` · Depende de: spec
W-062 (sonopolisWeb, DATOS — tabla, RPC, triggers y policies ya en producción, ver
`AppAll/supabase/migrations/20260901140000_spec_w062_venue_addresses.sql`) · Bloquea: spec 067**

**Solo diseño — no implementar todavía** (pedido explícito de Victor, 2026-09-01: "arma
los specs pero no ejecutemos nada"). Este spec no toca código ni corre nada contra la
base; documenta el trabajo para cuando se decida ejecutar.

## Motivo

Hallazgo de la auditoría de `sonopolisWeb/specs/W-PENDIENTES.md` #26: `EditarLocalScreen.tsx`
(AppAll) sigue escribiendo `venues.address`/`ciudad`/`comuna` directo vía `updateVenue()`,
sin pasar por `venue_addresses`. La tabla, el índice único parcial, la RPC
`activar_direccion_venue`, los dos triggers (tope de 3, sync a `venues`) y las 4 policies
ya existen en producción — este spec es la mitad de LÓGICA que falta del lado móvil para
poder usarlos: mismo backend, mismo criterio que W-063 en sonopolisWeb (que hizo esto
mismo para el cliente web).

Sin este hook (y sin el 067 que lo consume), un dueño que edite su dirección desde el
celular sigue arriesgando el bug del pendiente #21/#25: `venues.address` cambia pero
`venue_addresses` no se entera, y la próxima activación desde la web pisa en silencio lo
que se cargó desde el móvil.

## Por qué un hook y no una función de `VenuesContext`

`VenuesContext` mantiene la lista de venues como estado global (`allVenues`) — tiene
sentido para algo que la app entera necesita leer (Cartelera, Mapa, `/locales`). Las
direcciones de un venue no son eso: solo le importan a la pantalla de edición de ESE
local, mientras está abierta. Mismo criterio que ya usa el spec 039
(`useEntradasEvento`, ver su propio comentario: "hook aparte y no una función de
EventosContext... los mismos datos no tienen sentido como estado global") y el spec 033
(`useEventoPermisos`). Un hook por pantalla, no una tabla nueva colgando del contexto
global.

## Tipo nuevo — `src/types/index.ts`

```ts
export interface DireccionVenue {
  id: string;
  venueId: string;
  address: string;
  comuna?: string;
  ciudad?: string;
  lat?: number;
  lng?: number;
  activa: boolean;
}
```

Espejo exacto de `DireccionVenue` en `sonopolisWeb/libs/mappers.js`
(`mapDireccionVenueFromDB`/`mapDireccionVenueToDB`) — mismas claves, mismo
snake_case↔camelCase que ya sigue `Venue` en este archivo.

## Hook — `src/hooks/useVenueAddresses.ts`

Mismo molde que `useEntradasEvento.ts`: `cargar()` con `useCallback`, `useEffect` que la
dispara al montar/cuando cambia `venueId`, sin catch silencioso.

```ts
interface VenueAddressesState {
  direcciones: DireccionVenue[];
  cargando: boolean;
  error: string | null;
  crear: (datos: { address: string; comuna?: string; ciudad?: string }) => Promise<void>;
  activar: (direccionId: string) => Promise<void>;
  eliminar: (direccion: DireccionVenue) => Promise<void>;
  refrescar: () => Promise<void>;
}

export function useVenueAddresses(venueId: string | undefined): VenueAddressesState
```

- `crear`: `supabase.from('venue_addresses').insert(mapDireccionVenueToDB({ venueId, ...datos }))`,
  después `refrescar()`. El trigger de tope de 3 (`venue_addresses_limite`) devuelve el
  error de Postgres tal cual si ya hay 3 — no se reimplementa el conteo acá, mismo
  principio que W-063 ("el permiso no se reimplementa, corre por las policies").
- `activar`: `supabase.rpc('activar_direccion_venue', { p_direccion_id: direccionId })`,
  después `refrescar()`.
- `eliminar`: bloquea client-side si `direccion.activa` (mismo mensaje que
  `libs/data/venueAddresses.js`: "No puedes borrar la dirección activa. Activa otra
  primero.") antes de llegar a Supabase — el trigger de sync no corre en `delete`, así que
  dejar borrar la activa desde acá dejaría `venues.address` apuntando a una fila muerta.
- Sin fallback a `mockVenues` (a diferencia de `VenuesContext`): una pantalla de edición
  de local ya asume sesión real y venue real; no hay "direcciones mock" que mostrar si
  Supabase falla, se muestra el error como en `useEntradasEvento`.

## Fuera de alcance

- Geocodificación (`lat`/`lng`) — igual que W-063, ese proceso es aparte (spec W-027).
- Cualquier UI — eso es el spec 067.

## Criterios de aceptación

- [ ] `DireccionVenue` en `src/types/index.ts`, espejo de `sonopolisWeb/libs/mappers.js`.
- [ ] `useVenueAddresses(venueId)` expone `direcciones`, `cargando`, `error`, `crear`,
      `activar`, `eliminar`, `refrescar`.
- [ ] `eliminar` rechaza la dirección activa antes de llamar a Supabase, mismo mensaje que
      la web.
- [ ] `npx tsc --noEmit` sin errores nuevos.

> Estado: diseñado, no implementado (2026-09-01). Ejecutar junto con el spec 067 — el
> hook solo no tiene ninguna pantalla que lo use.
