# Spec 115 — Los contextos dicen la verdad: sin `catch {}` silencioso ni datos mock de reemplazo

> Estado: aplicado (17-oct-2026) — criterios 1-5 y 7 verificados (tsc limpio, greps vacíos, mocks de eventos/venues borrados, `musicos.ts` intacto, `error` en los dos contextos, export web OK); criterio 6 verificado por lectura de código (`if (error) throw error` antes de tocar `eventos`), sin ejecutar contra la base. Falta V (115-a/b) en dispositivo
> Capa: LÓGICA. `src/context/EventosContext.tsx`, `src/context/VenuesContext.tsx`, `src/data/mock/eventos.ts` (se borra), `src/data/mock/venues.ts` (se borra), `AGENTS.md`, `CLAUDE.md`.
> Depende de: ninguno.
> Alimenta: spec 116 (mismo archivo, después de este), spec 119 (la cartelera puede mostrar `error`).

> **En una frase:** crear un evento que la base rechaza deja de devolver un evento falso
> en memoria, y una consulta que vuelve vacía (o que falla) deja de mostrar eventos y
> locales inventados: los dos contextos exponen el error real y una lista vacía cuando
> está vacía.

## Contexto

`EventosContext` y `VenuesContext` nacieron con un modo mock para desarrollar sin
Supabase (`AGENTS.md`, convención 4). Ese modo hoy hace daño en producción, por dos
caminos que el propio `CLAUDE.md` del repo ya documenta como «el que más confunde»:

1. **`createEvento` se traga el error** (`EventosContext.tsx:154-173`). Si el `insert`
   falla, el `catch {}` de `:168` no hace nada y el código sigue a `:170`, que inventa un
   evento con id `event-<timestamp>` y lo agrega a la lista. El usuario ve «publicado» y
   en la base no hay nada. Hoy **todo** insert de la app falla (`23502`, falta `pais`,
   spec 095), así que hoy todo evento publicado desde la app es falso. Además el mismo
   `if (!error && data)` (`:162`) deja pasar un `error` devuelto (no lanzado) hacia el
   evento falso.

2. **La lista vacía se reemplaza por mock** (`EventosContext.tsx:97`, `:103-118`;
   `VenuesContext.tsx:78`, `:82-97`). El estado inicial es la lista mock, y solo se
   reemplaza si la consulta trae **filas** (`data.length > 0`). Con 0 filas o con error,
   quedan los 5 eventos y los locales de muestra, cuyos ids (`"1"`, `"2"`…) dan 404 al
   comprar. Y como `useMock` sigue en `true`, **todas las escrituras** se desvían a memoria
   (`createEvento :155`, `updateEvento :192`, `deleteEvento :223`, `cancelEvento :233`,
   `createVenue :113`, `updateVenue :130`): con una tabla vacía no hay forma de sembrar el
   primer registro desde la app.

`createVenue` ya lanza su error desde el spec 031 (`VenuesContext.tsx:108-111`), pero
sigue cayendo a memoria cuando `useMock` es `true`.

El caso que el mock quería cubrir —«Supabase no está configurado»— ya no existe: sin
`EXPO_PUBLIC_SUPABASE_URL` la app no puede ni iniciar sesión (`src/lib/supabase.ts:25-26`),
y ninguna pantalla de las que importan funciona con datos de muestra.

## Diseño

### Decisión 1 — sin modo mock en los dos contextos

- Se eliminan el estado `useMock`/`setUseMock` y **todas** sus ramas en los dos contextos.
  Toda escritura va siempre a Supabase.
- Estado inicial: `eventos: []` y `allVenues: []` (no el mock), `loading: true`.
- Se borran los imports `../data/mock/eventos` y `../data/mock/venues`, y los dos
  archivos: después de este spec nadie más los importa (`grep -rn "data/mock/eventos\|data/mock/venues" src`
  solo devuelve los dos contextos hoy). Precedente del spec 032: lo que nada consume se
  borra, no se deja con nombre engañoso.
- `src/data/mock/musicos.ts` **se queda**: lo leen pantallas (`LocalesScreen`,
  `VerMusicoScreen`, `PerfilMusicoScreen`), y reemplazarlo es de los specs 121 y 122.

### Decisión 2 — el error de carga se expone, no se tapa

Los dos contextos suman `error: string | null` a su interfaz (`EventosState`,
`VenuesState`) y a su `value`.

`loadFromSupabase`, en los dos:

```ts
setError(null);
try {
  const { data, error } = await supabase.from('events').select('*');
  if (error) throw error;
  setEventos((data ?? []).map(mapEventoFromDB));   // 0 filas = lista vacía
} catch (e: any) {
  console.error('[EventosContext] no se pudo cargar events:', e);
  setError(e?.message ?? 'No se pudieron cargar los eventos');
  // La lista NO se vacía: si ya había datos de una carga anterior, siguen siendo
  // la mejor información disponible. En la primera carga, queda [].
} finally {
  setLoading(false);
}
```

(`VenuesContext` igual, con `venues`, `setAllVenues` y su mensaje.)

**Por qué no vaciar la lista ante un error de recarga:** `refresh()` puede fallar por red
con datos buenos ya en pantalla; borrarlos convierte un fallo transitorio en una cartelera
vacía. Lo que no se hace nunca más es *inventar* datos.

Este spec **no** pinta el error en ninguna pantalla (eso es FRONTEND). Sin la UI, una carga
fallida se ve como una cartelera vacía — que es verdad — en lugar de cinco eventos
inventados. El spec 119 (cartelera) es el lugar natural para mostrar `error`.

### Decisión 3 — `createEvento` lanza

```ts
const { data, error } = await supabase
  .from('events')
  .insert(mapEventoToDB(evento))
  .select()
  .single();
if (error) throw error;
const newEvento = mapEventoFromDB(data);
setEventos((prev) => [...prev, newEvento]);
cargarMisColaboraciones(); // events_claim_owner_trg me acaba de agregar como owner
return newEvento;
```

Sin `try/catch` propio: quien llama decide qué mostrar, igual que `deleteEvento`
(`:216-228`, spec 033) y `createVenue`. `CrearEventoScreen.tsx:153-154` ya envuelve la
llamada en `try/catch` con un `Alert`, así que el error llega al usuario sin tocar la
pantalla. El mensaje de ese `Alert` es genérico («No se pudo publicar el evento»);
mostrar el detalle es de un spec FRONTEND.

`updateEvento`, `deleteEvento` y `cancelEvento` ya lanzan; solo pierden su rama mock.
`createVenue` y `updateVenue`, igual.

### Decisión 4 — `cargarMisColaboraciones` deja rastro

`EventosContext.tsx:145`: el `catch {}` pasa a `catch (e) { console.error('[EventosContext] no se pudo cargar event_collaborators:', e); setMisColaboraciones([]); }`.
El comportamiento visible no cambia (lista vacía); lo que cambia es que el fallo deja de ser
invisible al depurar. Su comentario (`:131-132`, «si la tabla todavía no existe… igual que
loadFromSupabase se degrada a mock») se corrige: la tabla existe desde el spec 033 y ya
nada se degrada a mock.

### Decisión 5 — la documentación del repo deja de describir el mock

Este spec es el «spec explícito» que `AGENTS.md` exige para tocarlo:

- `AGENTS.md`, árbol de directorios: `data/mock/` pasa a «Datos mock de músicos (hasta los
  specs 121-122)».
- `AGENTS.md`, convención 4: «Los providers intentan Supabase primero, fallback a mock si
  no hay conexión» → «Los providers leen y escriben siempre en Supabase; un error se expone
  en `error` (lectura) o se lanza (escritura). Nunca se reemplaza por datos de muestra».
- `CLAUDE.md`, sección «Providers con fallback a mock — el que más confunde»: se reescribe
  en presente con el comportamiento nuevo, y conserva en una línea el porqué («hasta el
  spec 115 los contextos caían a mock con 0 filas y las escrituras quedaban en memoria»).
  El aviso de «`createVenue` falla en silencio» se elimina porque ya no es cierto.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin errores.
2. `grep -rn "useMock\|mockEventos\|mockVenues" src` no devuelve nada.
3. `grep -n "catch {}" src/context/*.tsx` no devuelve nada.
4. `src/data/mock/eventos.ts` y `src/data/mock/venues.ts` no existen;
   `src/data/mock/musicos.ts` sigue existiendo.
5. `useEventos()` y `useVenues()` exponen `error: string | null`.
6. `createEvento` contra un insert rechazado (hoy: cualquier evento, por el `23502` del
   spec 095) lanza el error de Postgres y no agrega nada a `eventos`.
7. `npm run build:web` termina sin errores.

## Fuera de alcance

- Mandar `pais` en el insert: spec 095. Este spec no toca `mapEventoToDB` ni
  `mapVenueToDB`.
- Precio por moneda y `comienza_at`: spec 116 (mismo archivo, va después).
- Mostrar `error` en la cartelera o en «Locales», y mostrar el detalle del error al
  publicar: specs FRONTEND (119, 136).
- Los músicos de muestra en pantallas (`musicosMock`): specs 121 y 122.
- Las funciones de tickets en memoria del contexto (`tickets`, `createTicket`,
  `getTicketsByUser`, `updateTicketStatus`, `EventosContext.tsx:255-277`): no tienen
  ningún llamador en `src/screens` ni `src/components`, pero no son el fallback de una
  consulta. Candidatas a borrarse en un spec propio.
- El fallback a `created_by` de `useEventoPermisos.ts:45-58`: no inventa datos, solo
  autoriza la UI con un modelo viejo (la RLS decide igual). Su comentario («igual que
  EventosContext cae a mock») queda desactualizado; se corrige cuando alguien toque ese
  archivo.

## Verificación manual (candidatas a `V#` en `specs/PENDIENTES.md`)

- **V (115-a):** con el 095 todavía sin aplicar, publicar un evento desde la app muestra
  el `Alert` de error y el evento **no** aparece en la cartelera.
- **V (115-b):** con la red cortada al abrir la app, la cartelera queda vacía (no muestra
  eventos de muestra) y `useEventos().error` trae el mensaje.

## Bugs encontrados al aplicar

- **17-oct-2026 — el criterio 3 choca con comentarios.** `grep -n "catch {}" src/context/*.tsx`
  también encuentra el texto `catch {}` dentro de comentarios: el de `deleteEvento` (spec 033,
  «antes: `catch {}` vacío…») ya lo tenía antes de este spec. Para que el criterio dé vacío se
  reescribió ese comentario como «`catch` vacío», sin cambiar su sentido. El criterio sigue
  midiendo lo que quería (ningún `catch {}` en el código).
