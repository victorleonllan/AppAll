# Spec 133 — Hook de direcciones del local: hasta 3, una activa

> Estado: aplicado (17-oct-2026) — `tsc --noEmit` limpio, criterios 2-4 verificados (sin `catch {}`, sin `.update(`, el `throw` de la activa va antes del `delete`), `expo export --platform web` sin error. V-candidata 1 pendiente (la verifica el spec 134).
> Capa: LÓGICA. `src/hooks/useDireccionesVenue.ts` (nuevo).
> Depende de: ninguno pendiente. Tabla, tope, RPC y trigger ya están en producción (migración `20260901140000_spec_w062_venue_addresses.sql`).
> Alimenta: spec 134 (editar local).
> Hermano en la web: `libs/data/venueAddresses.js` (W-062, W-063, W-064), `components/GestionDirecciones.js`, `libs/mappers.js:266-290`.

> **En una frase:** un hook y tres funciones sueltas para listar, crear, activar y borrar las
> direcciones de un local en `venue_addresses`, con las mismas reglas que la web y detectando
> cuando RLS ignora una escritura sin dar error.

## Contexto

Desde W-062 un local puede tener hasta 3 direcciones y **una sola activa**. La activa es la
que se ve en la ficha, el mapa y la cartelera. Todo lo importante lo hace la base
(`20260901140000_spec_w062_venue_addresses.sql`):

- Índice único parcial `venue_addresses_una_activa` (líneas 24-26): nunca dos activas.
- Trigger `venue_addresses_limite` (líneas 58-73): el cuarto `insert` falla con
  «Un local puede tener como máximo 3 direcciones».
- RPC `activar_direccion_venue(p_direccion_id)` (líneas 28-55): apaga la activa y prende la
  nueva en una sola transacción. Existe porque dos `update` sueltos desde el cliente pueden
  cortarse entre medio y dejar el local sin dirección activa.
- Trigger `venue_addresses_sync_activa` (líneas 78-102): copia la fila activa a
  `venues.address/comuna/ciudad/lat/lng`, que siguen existiendo como caché porque toda la
  cartelera las lee directo.
- RLS (líneas 107-135): lectura pública; insertar, actualizar y borrar solo el dueño del
  venue (`venues.owner_id = auth.uid()`).

La app no conoce `venue_addresses`: `grep -rn venue_addresses src` da cero. `EditarLocalScreen`
escribe `venues.address` directo (`EditarLocalScreen.tsx:84-86` vía `updateVenue`). Ese es el
bug del pendiente #21 de la web: la próxima vez que alguien active una dirección, el trigger
pisa sin aviso lo que se tecleó. El spec 134 lo corrige usando este hook.

**Dos escrituras que pueden no hacer nada sin dar error:**

1. La RPC es `security invoker`: corre con los permisos de quien llama. Si quien llama no es
   el dueño, RLS filtra los dos `update` de adentro, la RPC termina «bien» y no cambió nada.
2. Un `delete` que RLS filtra tampoco da error: borra cero filas.

La web no detecta ninguna de las dos (`venueAddresses.js:47-52` y `:62-68`). La app sí:
después de activar relee y comprueba; al borrar pide `.select('id')`.

## Diseño

### `src/hooks/useDireccionesVenue.ts` (nuevo)

Tipos en el mismo archivo (criterio de `useEntradasEvento.ts:5-15`):

```ts
export interface DireccionVenue {
  id: string;
  venueId: string;
  address: string;
  comuna: string | null;
  ciudad: string | null;
  lat: number | null;
  lng: number | null;
  activa: boolean;
  createdAt: string;
}

export interface DatosDireccion {
  address: string;
  comuna?: string | null;
  ciudad?: string | null;
}

export const MAXIMO_DIRECCIONES = 3;
```

**Funciones sueltas** (exportadas; el spec 134 usa `crearDireccion` al dar de alta un local,
cuando todavía no hay un `venueId` con el que montar el hook):

```ts
export async function getDireccionesVenue(venueId: string): Promise<DireccionVenue[]>;
export async function crearDireccion(venueId: string, datos: DatosDireccion): Promise<DireccionVenue>;
export async function activarDireccion(venueId: string, direccionId: string): Promise<void>;
export async function eliminarDireccion(direccion: { id: string; activa: boolean }): Promise<void>;
```

- **`getDireccionesVenue`:** `select('*').eq('venue_id', venueId).order('created_at', { ascending: true })`,
  mapeo como `mapDireccionVenueFromDB` (`mappers.js:266-278`), con `lat`/`lng` pasados a
  `number` (`numeric` llega como texto o número según el driver). Error → `throw`.
- **`crearDireccion`:** `address.trim()` vacío → `throw new Error('Escribe la dirección.')`.
  Lee las existentes; la nueva nace `activa: existentes.length === 0` (la primera queda activa
  sola; desde la segunda, activar es un paso aparte, `venueAddresses.js:17-22`). Inserta
  `{ venue_id, address, comuna: ?? null, ciudad: ?? null, activa }` con `.select().single()`.
  El error del trigger de tope llega con su mensaje en español y se relanza tal cual.
  **No** manda `lat`/`lng`: los llena la geocodificación aparte (W-027), igual que en la web.
- **`activarDireccion`:** `supabase.rpc('activar_direccion_venue', { p_direccion_id: direccionId })`.
  Error → `throw`. Después relee con `getDireccionesVenue(venueId)`; si la fila `direccionId`
  no quedó `activa` → `throw new Error('No se pudo activar la dirección. Solo el dueño del local puede cambiarla.')`.
- **`eliminarDireccion`:** si `activa` → `throw new Error('No puedes borrar la dirección activa. Activa otra primero.')`
  sin tocar la red (el trigger de sync no corre en `delete`, así que `venues.address` quedaría
  apuntando a una fila borrada, `venueAddresses.js:56-61`). Si no:
  `delete().eq('id', id).select('id')`; vacío → `throw new Error('No se pudo borrar la dirección.')`.

**Hook:**

```ts
export function useDireccionesVenue(venueId: string | undefined): {
  direcciones: DireccionVenue[];
  cargando: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
  crear: (datos: DatosDireccion) => Promise<void>;
  activar: (direccionId: string) => Promise<void>;
  eliminar: (direccion: DireccionVenue) => Promise<void>;
  puedeAgregar: boolean;   // direcciones.length < MAXIMO_DIRECCIONES
};
```

- Carga al montar y cuando cambia `venueId`; sin `venueId` → lista vacía, `cargando = false`.
- `crear`/`activar`/`eliminar` llaman a la función suelta y después `refrescar()`. Lanzan los
  errores; el hook no muestra alertas.
- **El hook no refresca `VenuesContext`.** Crear la primera dirección o activar otra cambia
  `venues.address` por el trigger, y la copia en memoria de `useVenues().allVenues` queda
  vieja. Quien usa el hook llama `useVenues().refresh()` después de `crear` o `activar`
  (lo hace el spec 134). Se deja afuera para no acoplar este hook al contexto que los specs
  095 y 115 están modificando.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio.
2. `rg -n "catch\s*\{\s*\}" src/hooks/useDireccionesVenue.ts` devuelve cero.
3. `rg -n "\.update\(" src/hooks/useDireccionesVenue.ts` devuelve cero: cambiar la activa pasa solo por la RPC.
4. `eliminarDireccion` con `activa: true` lanza sin hacer ninguna llamada a Supabase (se ve leyendo el código: el `throw` va antes del `delete`).
5. `npx expo export --platform web` termina sin error.

## Fuera de alcance

- La interfaz: spec 134.
- Editar el texto de una dirección existente (la web tampoco: se borra y se crea otra).
- Geocodificar `lat`/`lng`. Una dirección nueva queda sin coordenadas hasta que corra la
  geocodificación de la web, así que el local puede no aparecer en el mapa del spec 127
  mientras tanto.
- El nombre de la división administrativa por país («comuna» en Chile): el selector de
  términos por país (`terminoDivision` de la web) no existe en la app.

## Verificación manual

La verifica el spec 134. Candidata propia:

- **V-candidata 1:** con la sesión de un usuario que **no** es dueño, llamar `activarDireccion` sobre una dirección ajena → lanza «No se pudo activar la dirección…» y la base no cambió.
