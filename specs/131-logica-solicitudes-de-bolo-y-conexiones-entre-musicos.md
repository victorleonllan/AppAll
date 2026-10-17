# Spec 131 — Hooks de solicitudes de bolo y conexiones entre músicos

> Estado: aplicado (17-oct-2026) — tsc sin errores en los dos hooks (los únicos errores del repo son de pantallas sin commitear de otros specs), sin `catch {}`, los 3 `.update()` seguidos de `.select('id')`, funciones puras sin `supabase`, `npx expo export --platform web` OK.
> Capa: LÓGICA. `src/hooks/useSolicitudes.ts` (nuevo), `src/hooks/useConexiones.ts` (nuevo).
> Depende de: ninguno pendiente. Las tablas y sus policies ya están en producción (migraciones `20260820183953_spec_051_disponibilidad_y_solicitudes.sql` y `20260829000003_spec_w058_collab_requests.sql`).
> Alimenta: spec 132 (pantalla de solicitudes y botón en la ficha del músico).
> Hermano en la web: `libs/data/booking.js` (W-031, W-055), `libs/data/collab.js` (W-058, W-059, W-060), `libs/mappers.js:432` (`mapSolicitudFromDB`).

> **En una frase:** dos hooks nuevos que leen y escriben `booking_requests` (músico ↔ local)
> y `collab_requests` (músico ↔ músico) con las mismas reglas que la web, y que además
> detectan el `update` que RLS ignora sin error.

## Contexto

La web tiene dos negociaciones distintas, en dos tablas distintas:

- **Solicitud de bolo** (`booking_requests`): un músico le propone tocar a un local, o un
  local le propone a un músico que toque. Siempre músico ↔ local: `musician_id` y `venue_id`
  son `NOT NULL` (spec 051, líneas 7-20). Aceptarla no crea ningún evento; es una
  negociación previa (`booking.js:3-7`).
- **Conexión** (`collab_requests`): networking entre dos músicos, sin fecha ni show
  (`collab.js:4-7`). `proposed_at` existe en la tabla pero nadie la escribe (decisión de
  Victor, 29-ago-2026).

La app no tiene ninguna de las dos: `grep -rn "booking_requests\|collab_requests" src` da cero.

Lo que deciden las policies (no se reimplementa en el cliente, solo se respeta):

| Acción | `booking_requests` (spec 051) | `collab_requests` (W-058) |
|---|---|---|
| Ver | `is_booking_party(id)`: soy el músico o el dueño del local (líneas 50-51) | `from_musician = yo or to_musician = yo` (líneas 41-42) |
| Crear | `created_by = yo` y (`musician_id = yo` o soy dueño de `venue_id`) (líneas 53-59) | `from_musician = yo` y las dos puntas con `role = 'musician'` (líneas 47-52) |
| Responder | solo la contraparte (`is_booking_recipient`), solo si `pending`, a `accepted`/`declined` (líneas 60-62) | solo `to_musician`, solo si `pending` (líneas 55-57) |
| Cancelar | solo quien la creó, solo si `pending`, a `cancelled` (líneas 64-66) | solo `from_musician`, solo si `pending` (líneas 63-65) |
| Duplicados | **sin índice único** (W-PENDIENTES #18): dos toques crean dos filas | índice único parcial `collab_requests_una_viva` sobre `pending` (líneas 35-37) |

**La trampa del `update` silencioso.** Cuando la cláusula `USING` de una policy de UPDATE no
deja pasar la fila (p. ej. ya no está `pending` porque la otra punta la canceló en otra
pantalla), PostgREST no devuelve error: devuelve **cero filas actualizadas**. La web no lo
detecta (`booking.js:63-72`); la app sí lo detecta, pidiendo `.select('id')` en cada
`update` y fallando si vuelve vacío. Es el mismo tipo de error que costó el spec 030: algo
que parece guardado y no lo está.

## Diseño

Los dos hooks siguen el molde de `src/hooks/useEntradasEvento.ts`: estado propio, carga al
montar, `refrescar()`, tipos exportados desde el mismo archivo (criterio de
`useEntradasEvento.ts:5-15`). Toman el usuario de `useAuth()`. Ninguno tiene `catch {}`: los
errores de carga van a `error`, y los de escritura se **lanzan** para que la pantalla los
muestre.

### 1. `src/hooks/useSolicitudes.ts` (nuevo)

```ts
export type EstadoSolicitud = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface SolicitudBolo {
  id: string;
  createdBy: string;
  musicianId: string;
  venueId: string;
  venueNombre: string | null;
  musicoNombre: string | null;
  proposedAt: string | null;
  genre: string | null;
  note: string | null;
  status: EstadoSolicitud;
  respondedAt: string | null;
  createdAt: string;
  propuseYo: boolean;      // createdBy === yo: decide qué botones ve cada punta
}

export function useSolicitudes(): {
  solicitudes: SolicitudBolo[];
  cargando: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
  crear: (datos: { musicianId: string; venueId: string; proposedAt?: string | null; genre?: string | null; note?: string | null }) => Promise<void>;
  responder: (id: string, status: 'accepted' | 'declined') => Promise<void>;
  cancelar: (id: string) => Promise<void>;
};

export function contrapartesConSolicitudViva(solicitudes: SolicitudBolo[], lado: 'venue' | 'musician'): Set<string>;
```

- **Carga:** `supabase.from('booking_requests').select('*, venues(name), profiles(nombre)').order('created_at', { ascending: false })`.
  Sin filtro: RLS ya trae solo las filas donde soy parte. El embed `profiles(nombre)` no es
  ambiguo porque `created_by` apunta a `auth.users`, no a `profiles`. Sin sesión → lista
  vacía sin consultar.
- **Mapeo** igual que `mapSolicitudFromDB` (`mappers.js:432-447`) más `propuseYo`.
- **`crear`:** inserta `{ created_by: user.id, musician_id, venue_id, proposed_at: ?? null, genre: ?? null, note: ?? null }`
  y luego `refrescar()`. Quién va en cada columna lo decide quien llama: el músico se pone
  a sí mismo como `musicianId`; el local pone su propio `venueId` (`PanelConexiones.js:85-89`).
- **`responder`:** valida `status ∈ {accepted, declined}` (si no, `throw new Error('Respuesta inválida')`);
  `update({ status }).eq('id', id).select('id')`; si vuelve vacío →
  `throw new Error('La solicitud ya no está pendiente.')`. Luego `refrescar()`.
- **`cancelar`:** igual, con `{ status: 'cancelled' }` y el mismo mensaje si vuelve vacío.
- **`contrapartesConSolicitudViva`:** pura, copia de `booking.js:16-42`. Devuelve los ids de
  la contraparte con solicitud `pending`. Solo `pending` bloquea: una rechazada no es un veto
  permanente y una aceptada tampoco (un local que ya te programó es el más probable de volver
  a hacerlo).

### 2. `src/hooks/useConexiones.ts` (nuevo)

```ts
export interface Conexion {
  id: string;
  fromMusician: string;
  toMusician: string;
  propuseYo: boolean;
  otroId: string;
  otroNombre: string | null;
  note: string | null;
  status: EstadoSolicitud;   // importado de useSolicitudes.ts: mismo CHECK en las dos tablas
  createdAt: string;
  respondedAt: string | null;
}

export function useConexiones(): {
  conexiones: Conexion[];
  cargando: boolean;
  error: string | null;
  refrescar: () => Promise<void>;
  crear: (datos: { toMusician: string; note?: string | null }) => Promise<void>;
  responder: (id: string, status: 'accepted' | 'declined') => Promise<void>;
};

export function musicosYaConectados(conexiones: Conexion[]): Map<string, 'pending' | 'accepted'>;
```

- **Carga:** `select('*')` de `collab_requests` ordenado por `created_at desc`; después un
  segundo `select('id, nombre')` de `profiles` con `.in('id', otros)` para los nombres
  (`collab.js:34-75`). Join manual y no embed porque las dos columnas apuntan a `profiles` y
  PostgREST necesitaría desambiguar el FK. Si la consulta de nombres falla, `otroNombre = null`
  (el nombre es cosmético; la conexión sí se muestra).
- **`crear`:** inserta `{ from_musician: user.id, to_musician, note: ?? null }`. Si el error
  trae `code === '23505'` (violación de `collab_requests_una_viva`) →
  `throw new Error('Ya tienes una solicitud de conexión pendiente con este músico.')`. Si la
  policy lo rechaza (otra punta no es músico o yo no soy músico) → se relanza con el mensaje
  de Supabase. Luego `refrescar()`.
- **`responder`:** igual que en `useSolicitudes`, con `.select('id')` y
  «La solicitud ya no está pendiente.» si vuelve vacío.
- **`musicosYaConectados`:** pura, copia de `collab.js:103-111`. Bloquean `pending` **y**
  `accepted` (a diferencia de los bolos): volver a conectar con alguien con quien ya estás
  conectado no tiene sentido, y el índice único solo cubre `pending`.
- **Sin `cancelar`**: la policy existe pero la web no ofrece cancelar una conexión; no se agrega
  API que nadie usa.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio.
2. `rg -n "catch\s*\{\s*\}" src/hooks/useSolicitudes.ts src/hooks/useConexiones.ts` devuelve cero.
3. Cada `update` de los dos hooks pide `.select('id')` y falla si la respuesta viene vacía (`rg -n "\.update\(" src/hooks/useSolicitudes.ts src/hooks/useConexiones.ts` muestra tres llamadas, todas seguidas de `.select('id')`).
4. `contrapartesConSolicitudViva` y `musicosYaConectados` son funciones puras exportadas (sin `supabase` adentro).
5. `npx expo export --platform web` termina sin error.

## Fuera de alcance

- La interfaz (pestañas, modal, botones): spec 132.
- Un índice único para `booking_requests` (W-PENDIENTES #18): sería un spec DATOS. Mientras
  tanto la guarda es de pantalla (`contrapartesConSolicitudViva`).
- Notificar a la otra punta (correo o push): ni la web lo hace.
- Que aceptar una solicitud cree el evento.

## Verificación manual

Las verifica el spec 132 a través de la pantalla. Candidata propia:

- **V-candidata 1:** con dos sesiones (músico y local), el local cancela una solicitud mientras el músico tiene la lista abierta; el músico toca «Aceptar» → ve «La solicitud ya no está pendiente.» y la fila sigue `cancelled` en la base.
