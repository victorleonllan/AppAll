# Spec 191 — Ubicación del local con pin: búsqueda, margen y guardado (lógica)

> Estado: propuesto (27-nov-2026)
> Capa: LÓGICA. `src/lib/ubicacion.ts` (nuevo), `src/lib/geocodificar.ts` (nuevo), `src/context/VenuesContext.tsx`, `src/hooks/useDireccionesVenue.ts`.
> Depende de: nada nuevo. Las columnas `venues.lat`/`lng` y `venue_addresses.lat`/`lng` ya existen (W-062), y `GET /api/geocodificar` ya está en producción en la web (W-339).
> Alimenta: spec 200 (FRONTEND).
> Hermano en la web: `libs/ubicacion.js`, `app/api/geocodificar/route.js`, `libs/data/venues.js` (`guardarUbicacionLocal`) — W-339.

> **En una frase:** la app puede buscar una dirección en el mapa a través de la web, decir
> si la calle que encontró es la que se escribió, limitar el ajuste del pin a 150 m y
> guardar la ubicación del local sin que el trigger de direcciones la borre después.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después
de esta orquestación.» La web ya pide confirmar el pin del local al crear un evento
(W-339/W-340). En la app, un local nuevo nace sin coordenadas: `CrearEventoScreen` crea el
local y su dirección, pero nadie geocodifica (`crearDireccion` no manda `lat`/`lng`,
`src/hooks/useDireccionesVenue.ts:56-79`), así que el local no aparece en el mapa hasta que
alguien corre a mano `scripts/geocodificar-venues.mjs` de la web (W-147). Y cuando el
geocodificador se equivoca nadie lo ve: Quintal Clandesta («calle 124 #1040», Peñalolén)
quedó en «Calle El Olivo Oriente» porque Nominatim no conoce «calle 124».

## Decisión

### 1. `src/lib/ubicacion.ts` (nuevo) — puro, sin imports

Port literal de `sonopolisWeb/libs/ubicacion.js`, con tipos. Sin imports a propósito: así se
prueba con `npx tsx` sin arrastrar el cliente de Supabase (mismo criterio que `src/lib/muro.ts`).

```ts
export interface Punto { lat: number; lng: number }

export const MARGEN_PIN_METROS = 150;

/** Distancia sobre la esfera entre dos puntos (fórmula de haversine), en metros. */
export function distanciaMetros(a: Punto, b: Punto): number;

/** `punto` si está a `metros` o menos de `centro`; si no, el punto del borde del círculo
 * en la misma dirección (rumbo) desde `centro`. */
export function limitarAlMargen(centro: Punto, punto: Punto, metros?: number): Punto;

/** ¿La calle que encontró el mapa es la que se escribió? */
export function calleCoincide(direccionEscrita: string, calleEncontrada: string | null): boolean;

/** Centro del país para «Ubicar a mano» cuando no hay ningún punto. */
export const CENTRO_PAIS: Record<string, Punto>;

/** `{ lat, lng }` de un local, o null. `Number()` porque la columna es numeric y puede
 * llegar como texto; un valor no finito cuenta como sin ubicación. */
export function puntoDeVenue(venue: { lat?: unknown; lng?: unknown }): Punto | null;

export type ResultadoBusqueda =
  | { encontrado: false }
  | { encontrado: true; punto: Punto; calle: string | null; coincide: boolean };

/** La respuesta cruda de `GET /api/geocodificar` → `ResultadoBusqueda`. Una respuesta
 * con `encontrado: true` pero sin `lat`/`lng` numéricos cuenta como no encontrada. */
export function leerRespuestaGeocodificar(cuerpo: unknown): ResultadoBusqueda;

/** Texto para una búsqueda fallida, a partir del `status` y el `codigo` de `ErrorApiWeb`
 * (o de un error de red sin status). */
export function mensajeErrorBusqueda(error: { status?: number; codigo?: string } | null): string;
```

Reglas, iguales a la web:

- `distanciaMetros` y `limitarAlMargen` comparten el radio `6371000` m, para que un punto
  puesto a `metros` del centro mida exactamente `metros`.
- `calleCoincide` normaliza las dos (NFD sin tildes, minúsculas, sin signos, sin palabras
  con números, sin prefijos `calle`/`avenida`/`av`/`pasaje`/`psje` y sin rellenos
  `el`/`la`/`los`/`las`/`de`/`del`) y dice si comparten alguna palabra. `calleEncontrada`
  nula, o que se queda sin palabras al normalizarla, devuelve `true` (no hay con qué
  contradecir). Si lo escrito no tiene nombre propio («calle 124 #1040»), devuelve `false`.
- `CENTRO_PAIS`: `CL` = `{ lat: -33.4489, lng: -70.6693 }` (Santiago) y `MX` =
  `{ lat: 31.737, lng: -106.4869 }` (Ciudad Juárez), los mismos `centro` de
  `sonopolisWeb/libs/pais.js`. Un país que no está cae en `CL` (quien llama hace
  `CENTRO_PAIS[pais] ?? CENTRO_PAIS.CL`).
- `mensajeErrorBusqueda`: `status === 401` → «Inicia sesión para ubicar el local en el
  mapa.»; cualquier otro caso → «No se pudo consultar el mapa» (el título que usa la web).

**Por qué 150 m** (de W-339): alcanza para llevar el pin de la mitad de la cuadra a la
puerta, la esquina o la entrada de atrás sin que el punto contradiga la dirección. Si el
error es mayor, el mapa se equivocó de lugar y lo resuelve «Ubicar a mano» (spec 200).

### 2. `src/lib/geocodificar.ts` (nuevo) — la llamada a la web

```ts
export async function buscarUbicacion(consulta: {
  direccion: string; comuna?: string | null; pais?: string | null;
}): Promise<ResultadoBusqueda>;
```

- Llama `llamarApiWeb('/api/geocodificar?direccion=…&comuna=…&pais=…')` (`src/lib/apiWeb.ts`,
  `GET` con el `Bearer` de la sesión). La ruta exige sesión (`sesionDeRequest` acepta el
  Bearer, W-246): sin sesión sería un proxy abierto a Nominatim.
- La query se arma a mano con `encodeURIComponent`, no con `URLSearchParams`: la
  implementación de React Native no trae todos sus métodos. `comuna` y `pais` vacíos no se
  mandan. `pais` va como código ISO (`'CL'`, `'MX'`), que es lo que espera la ruta.
- `direccion` vacía (después de `trim`) no llama a la red: devuelve `{ encontrado: false }`
  (la ruta respondería 400).
- Devuelve `leerRespuestaGeocodificar(cuerpo)`. Los errores (`ErrorApiWeb` 401/502, o el
  `TypeError` de red) se relanzan tal cual: quien llama los pasa por `mensajeErrorBusqueda`.
- Nominatim pide 1 consulta por segundo: este módulo no reintenta ni consulta solo. El
  componente busca al salir de un campo o con un botón, nunca en cada tecla (spec 200).

### 3. `src/context/VenuesContext.tsx` — `guardarUbicacionLocal`

`mapVenueToDB` **ya escribe** `lat` y `lng` (`if ('lat' in venue) out.lat = …`), así que
`createVenue({ …, lat, lng })` ya los guarda. No se toca el mapper. Se suma al contexto:

```ts
guardarUbicacionLocal: (venueId: string, punto: Punto) => Promise<Venue>;
```

1. `update({ lat, lng, updated_at })` en `venues` con `.eq('id', venueId).select().single()`.
   Si RLS filtra la fila (`venues_update` exige `auth.uid() = owner_id`), PostgREST
   responde `PGRST116` y se lanza `Error('Solo el dueño del local puede mover su
   ubicación')`, el texto de la web. Otro error se relanza tal cual.
2. Actualiza `allVenues` con la fila devuelta (como `updateVenue`).
3. Copia el pin a la dirección activa: `update({ lat, lng })` en `venue_addresses` con
   `.eq('venue_id', venueId).eq('activa', true)`. Un error de este paso **no** se lanza (el
   pin ya quedó en `venues`): va a `console.warn('[VenuesContext] pin sin copiar a la
   dirección activa', error)`.

**Por qué el paso 3 (difiere de la web a propósito).** El trigger
`venue_addresses_sync_activa` (W-062) copia `lat`/`lng` de la fila activa de
`venue_addresses` a `venues` cada vez que esa fila se inserta o cambia. La web
(W-340, «Bugs encontrados al aplicar») dejó anotado que su `guardarUbicacionLocal` solo
escribe `venues`, así que reactivar o editar la dirección activa vuelve a pisar el pin con
las coordenadas nulas de la fila. Guardar el pin también en la fila activa cierra ese hueco
en la app sin migración. El trigger corre con el `update` del paso 3 y vuelve a escribir en
`venues` los mismos valores: inocuo.

### 4. `src/hooks/useDireccionesVenue.ts` — `crearDireccion` acepta el pin

`DatosDireccion` suma `lat?: number | null` y `lng?: number | null`, y `crearDireccion` los
manda en el `insert` (los dos o ninguno: si falta uno, no se manda ninguno). Se actualiza el
comentario «No manda lat/lng» de la función.

**Por qué.** Al crear un local nuevo, `CrearEventoScreen` hace `createVenue` y después
`crearDireccion`. Esa primera dirección nace activa y el trigger copia sus `lat`/`lng`
(nulos) a `venues`: borra el pin que acababa de guardar `createVenue`. Es el mismo bug que
encontró la web al aplicar W-340 (lo resolvió volviendo a escribir el pin después). En la
app, la fila de la dirección nace con el pin y el trigger lo copia, en vez de borrarlo.

### Lo que NO cambia

- `updateVenue`, `createVenue`, `mapVenueFromDB` y `mapVenueToDB`.
- `GestionDirecciones` y `activarDireccion`: agregar o activar otra dirección sigue sin
  geocodificar. Si el dueño activa una dirección sin pin, el local queda sin pin y lo vuelve
  a ubicar con «Ajustar pin» (spec 200).
- `src/lib/mapa.ts`.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `src/lib/ubicacion.ts` no tiene ninguna línea `import`
   (`grep -c "^import" src/lib/ubicacion.ts` devuelve `0`).
3. Prueba con `npx tsx` de `src/lib/ubicacion.ts`:
   - `calleCoincide("calle 124 #1040", "Calle El Olivo Oriente") === false`;
   - `calleCoincide("Av. Matta 1020", "Avenida Matta") === true`;
   - `calleCoincide("x", null) === true`;
   - `distanciaMetros` entre dos puntos conocidos con error menor a 1 % (por ejemplo, un
     grado de latitud ≈ 111 195 m);
   - `limitarAlMargen` con un punto adentro (no cambia) y uno a 500 m (queda a 150 m ± 1 m
     del centro y en el mismo rumbo);
   - `puntoDeVenue({ lat: '-33.4', lng: '-70.6' })` da números; `{ lat: null, lng: 1 }` da `null`;
   - `leerRespuestaGeocodificar({ encontrado: true, lat: 1, lng: 2, calle: null, coincide: true })`
     da `encontrado: true`; con `lat: 'x'` da `{ encontrado: false }`;
   - `mensajeErrorBusqueda({ status: 401 })` y `mensajeErrorBusqueda(null)` dan los dos textos.
4. Lectura del código: `buscarUbicacion` no usa `URLSearchParams` y no llama a la red con
   `direccion` vacía; `guardarUbicacionLocal` traduce `PGRST116` y no lanza si falla el paso 3.
5. `git diff --stat` del commit toca solo los cuatro archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Con sesión, `buscarUbicacion` contra la web de producción devuelve un punto para una
  dirección real y `coincide: false` para «calle 124 #1040, Peñalolén».
- Crear un local nuevo con pin desde la app (spec 200): después de `crearDireccion`,
  `venues.lat`/`lng` y la fila activa de `venue_addresses` tienen el mismo pin.
- `guardarUbicacionLocal` con una cuenta que no es dueña del local devuelve «Solo el dueño
  del local puede mover su ubicación».

## Fuera de alcance

- La interfaz (spec 200).
- Geocodificar al agregar o activar direcciones desde `GestionDirecciones`.
- Corregir Quintal Clandesta en la base: lo hace su dueño con «Ubicar a mano».
