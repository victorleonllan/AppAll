# Spec 080 — `pais` en `events` y `venues`

> Estado: escrito, sin aplicar (7-sep-2026)
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_080_pais_eventos_locales.sql`.
> Depende de: spec 050 (`pais` en `event_sources`/`external_events`, ya aplicado).

> **En una frase:** la cartelera mezcla eventos internos y scrapeados; los scrapeados ya
> saben de qué país son y los internos no, así que filtrar por país hoy dejaría la mitad
> del listado sin criterio.

Pedido desde `sonopolisWeb` (cadena W-109…W-112). Vive acá por la regla de siempre: cambio
de esquema = spec de AppAll, aunque quien lo consuma primero sea la web.

## El problema

El spec 050 le puso `pais` a `event_sources` y `external_events`. Con eso, un evento
scrapeado sabe de qué país es. Pero `app/(marketing)/cartelera/page.js` arma la cartelera
con **dos** fuentes: `getEventos` (tabla `events`, lo que se vende en Sonópolis) y
`getEventosExternos` (lo scrapeado). `events` y `venues` no tienen ninguna noción de país
— `venues` tiene `comuna`, que es geografía chilena sin decirlo.

Filtrar solo los externos por país daría una cartelera incoherente: en Chile se vería todo,
y en cualquier otro país se verían los eventos internos chilenos igual, porque no habría
con qué excluirlos.

## Decisión 1 — `pais` en las dos tablas, denormalizado en `events`

- `venues.pais` — dónde está el local. Es su propiedad, no la de quien lo cargó.
- `events.pais` — copiado del venue al crear el evento, **no derivado por `join`**.

**Por qué `events.pais` propio y no `venues.pais` vía join:** `events.venue_id` es
nullable — hay eventos cargados sin local de la tabla `venues` (dirección suelta, local que
todavía no se dio de alta). Un `join` para filtrar dejaría a esos eventos fuera de toda
cartelera, sin país al cual pertenecer. Además es el mismo criterio que el spec 049/050 ya
aplicó a `external_events.comuna` y `external_events.pais`: el filtro de la cartelera no
puede depender de un `join` en cada consulta.

El costo conocido de denormalizar: un venue que corrija su país no arrastra los eventos ya
creados. Se acepta a propósito — un evento pasado ocurrió donde ocurrió, y un venue no
cambia de país en la práctica.

## Decisión 2 — `char(2)` ISO en mayúsculas, `NOT NULL`, sin `DEFAULT` al final

Idéntico al spec 050, para que las cuatro columnas de país del esquema se lean y se
comparen igual (`external_events.pais`, `event_sources.pais`, `events.pais`,
`venues.pais`).

`DEFAULT 'CL'` solo durante la migración, para no romper las filas ya existentes — todo lo
que hay hoy en producción es chileno. Después `DROP DEFAULT`: un `INSERT` que se olvide del
país debe fallar fuerte, no asumir Chile en silencio. Ese silencio es exactamente el bug
que este spec viene a cerrar.

## Trabajo

Migración `<timestamp>_spec_080_pais_eventos_locales.sql`:

- `ALTER TABLE public.venues ADD COLUMN pais char(2) NOT NULL DEFAULT 'CL'`
- `ALTER TABLE public.events ADD COLUMN pais char(2) NOT NULL DEFAULT 'CL'`
- `ALTER TABLE public.venues ALTER COLUMN pais DROP DEFAULT`
- `ALTER TABLE public.events ALTER COLUMN pais DROP DEFAULT`
- `CREATE INDEX events_pais_comienza_idx ON public.events (pais, comienza_at)` — mismo
  patrón que el `(pais, comienza_at)` de `external_events` (spec 050) y el
  `(status, comienza_at)` del 049. Es el filtro exacto que la cartelera va a hacer.
- `CREATE INDEX venues_pais_idx ON public.venues (pais)` — `getVenues` ordena por nombre
  y filtrará por país; sin `comienza_at` que agregar al índice.

**Sin cambios de RLS.** El país no es un criterio de permiso: no decide quién puede leer o
escribir una fila, solo cuál cartelera la muestra. Meterlo en una policy convertiría un
filtro de producto en una regla de seguridad, y volvería imposible que un back-office vea
los eventos de todos los países.

**Sin trigger que copie `venues.pais` a `events.pais`.** Un trigger escondería la decisión
en la base, donde nadie la lee al escribir el formulario. Lo estampa la app al crear el
evento (spec W-111 lo cablea), del mismo modo en que `pipeline.js` ya estampa
`pais: FUENTE.pais` en cada fila que inserta.

## Criterios de aceptación

- [ ] `events.pais` y `venues.pais` existen, `char(2)`, `NOT NULL`, sin `DEFAULT`
- [ ] Todas las filas existentes de las dos tablas quedaron en `'CL'`
- [ ] Índices `events_pais_comienza_idx` y `venues_pais_idx` existen
- [ ] Un `INSERT` en `events` sin `pais` falla (comprobado a mano, no asumido)
- [ ] La app sigue levantando: `events` y `venues` se leen con `select *`, así que la
      columna nueva llega sola a los mappers sin romper nada

## Fuera de alcance

- Que el formulario de crear evento/local mande el país (spec W-111 en la web)
- Filtrar la cartelera por país (specs W-109…W-112)
- `pais` en `profiles` o `artists` — un músico puede tocar en varios países; no es el
  mismo dato ni se resuelve igual, y hoy nada lo pide
- Aplicar la migración: el `supabase db push` lo decide Victor

## Addenda — 8-sep-2026: a qué spec de la web apunta cada cosa

El diseño de este spec no cambia. Se corrigen las referencias cruzadas, que estaban corridas
un número, y se anota el spec que finalmente cierra la ventana del `NOT NULL`.

- **Decisión 2, "el spec W-111 lo cablea"** y **Fuera de alcance, "que el formulario de crear
  evento/local mande el país (spec W-111)"** → el formulario nunca fue el W-111 (ese filtra
  la cartelera). Era el **W-112**, y el W-112 quedó **superado por el W-114** el 8-sep-2026.
- **Fuera de alcance, "filtrar la cartelera por país (specs W-109…W-112)"** → la cadena que
  lo hace es **W-109 → W-111 → W-113**.
- **El spec de la web que hay que desplegar junto al `supabase db push` de esta migración es
  el W-114.** Entre el push y ese deploy, crear un evento o un local falla por el `NOT NULL`
  sin default: la ventana es inevitable en cualquiera de los dos órdenes, así que va migración
  primero y deploy inmediatamente después, no separados.
- **Fuera de alcance, "`pais` en `profiles`"** — sigue fuera, y el W-114 explica por qué no
  hizo falta: el país se elige en el formulario del local, no se deduce de quién lo carga.

Verificado el 8-sep-2026 con `supabase migration list`: la migración del spec 050, de la que
este depende, está aplicada en producción, y la de este spec (`20260907150500`) es la única
pendiente contra esa base.

## Addenda — 8-sep-2026: la ventana del `NOT NULL` también rompe la app móvil

El diseño no cambia. Se corrige un supuesto del spec: que la única app que inserta en
`events` y `venues` es la web.

Al preparar el `db push` se verificó el código de esta app: `grep -rn "pais" src/` devuelve
**cero**. Los dos únicos inserts a esas tablas —`mapVenueToDB` en `VenuesContext.tsx:116` y
`mapEventoToDB` en `EventosContext.tsx:159`— no mandan la columna. Con la migración aplicada,
crear un local o un evento **desde la app móvil** falla igual que desde la web, y el W-114
(que es frontend de `sonopolisWeb`) no lo arregla: son dos frontends distintos contra la
misma tabla.

Consecuencia para el orden de aplicación: el `db push` no va junto al deploy del W-114 y
listo. Necesita, además, un spec FRONTEND de AppAll simétrico al W-114 —que los dos mappers
estampen `pais`— aplicado y en manos de quien use la app. Mientras la app móvil se distribuya
por build (no por deploy instantáneo como la web), la ventana de rotura dura lo que tarde esa
build en llegar al dispositivo, que es más que un deploy.

Nada de esto invalida el `char(2) NOT NULL` sin default: la alternativa —dejar el `DEFAULT
'CL'`— es exactamente el silencio que el spec vino a cerrar. Lo que cambia es qué hay que
tener listo antes de empujar.
