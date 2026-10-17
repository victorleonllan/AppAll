# Spec 119 — La cartelera de la app muestra los eventos externos y destaca los de Sonópolis

> Estado: propuesto (16-oct-2026)
> Capa: FRONTEND. `src/screens/CarteleraScreen.tsx`, `src/components/TarjetaEvento.tsx`, `src/components/EventoDestacado.tsx` (nuevo), `src/components/TarjetaEventoExterno.tsx` (nuevo), `src/components/PrecioEvento.tsx` (nuevo), `src/hooks/useEventosExternos.ts` (nuevo), `src/hooks/usePrecioVigente.ts` (nuevo), `src/lib/precio.ts` (lo crea el spec 116; acá se le agrega `formatearMonto`), `src/lib/fechaCartelera.ts` (nuevo), `src/context/EventosContext.tsx`, `src/types/index.ts`.
> Depende de: spec 095, spec 096, spec 115, spec 116
> Alimenta: spec 120 (usa `PrecioEvento`, `usePrecioVigente`, `formatearMonto` y los campos nuevos de `Evento`), spec 123 (usa `mapEventoFromDB` exportado y `Evento.createdAt`), spec 124 (usa `TarjetaEvento` con moneda).
> Hermano en la web: W-016 (cartelera), W-024 (externos en cartelera), W-127 (ocultar 6 h después del inicio), W-128 (destacado), W-168 (precio en la moneda del evento). Archivos: `sonopolisWeb/components/Cartelera.js`, `components/EventoDestacado.js`, `components/TarjetaEventoExterno.js`, `libs/data/externalEvents.js`, `app/(marketing)/cartelera/page.js`.

> **En una frase:** la cartelera de la app solo lista la tabla `events`, sin filtro de
> visibilidad ni moneda; la de la web suma los eventos externos (los que trae el
> scraping), destaca arriba todo lo creado en Sonópolis y agrupa el resto por día — este
> spec lleva eso a la app.

## Contexto

**Lo que hace la app hoy.** `CarteleraScreen.tsx:18` lee `eventos` de `useEventos()` y
`:24` solo filtra por género. No hay:

- **Eventos externos.** `external_events` no aparece en ningún archivo de `src/` (lo dice
  también el spec 096, Contexto). La tabla existe desde el spec 049 y la RLS deja leer las
  filas publicadas sin sesión (`supabase/migrations/20260819164643_spec_049_eventos_externos.sql:79`,
  `USING (status = 'publicado')`).
- **Filtro de visibilidad.** La app muestra borradores del propio equipo, eventos con
  `visible_en_cartelera = false` (spec 079) y eventos de hace semanas. La web los saca en
  `app/(marketing)/cartelera/page.js:97-104`: fuera `draft`, fuera
  `visibleEnCartelera === false`, y fuera lo que empezó hace más de 6 horas (W-127).
- **Moneda.** `TarjetaEvento.tsx:20` muestra `evento.precio`, el texto libre que escribió
  el músico. Con eventos de México (`paises_cobro` tiene `MX`/`MXN` desde el spec 100,
  `20260922120000_spec_100_moneda_por_pais_de_cobro.sql:20`) «$500» no dice si son pesos
  chilenos o mexicanos. La web usa `formatearMonto(monto, moneda)` (`libs/moneda.js`, W-167).
- **Campos que el mapper descarta.** `mapEventoFromDB` (`EventosContext.tsx:31-47`) no lee
  `comienza_at`, `tipo_precio`, `moneda`, `descripcion`, `visible_en_cartelera` ni
  `created_at`, aunque las columnas existen (specs 064, 079, 087, 100). Sin `comienzaAt` no
  se puede ordenar, agrupar por día ni cortar los eventos pasados. El spec 116 suma
  `comienzaAt` y `moneda`; este spec suma el resto.

**Lo que hace la web.** `components/Cartelera.js` envuelve internos y externos en una forma
común, filtra, y luego separa: **todos** los internos filtrados van arriba como
`EventoDestacado` (`:274`, decisión de Victor del 19-ago-2026 que supera al W-016, que
destacaba solo el más próximo) y los externos quedan abajo agrupados por día (`:280`). Un
interruptor «Eventos sólo de Sonópolis» (`:115`) oculta los externos. Los externos se leen
con `getEventosExternos` (`libs/data/externalEvents.js:28`): publicados, sin duplicado
interno, no desaparecidos, desde la medianoche de hoy y del país activo.

**Por qué depende del 096.** Los externos llegan de fuentes de Chile y de México (W-159:
México entró al catálogo de la web con 57 eventos scrapeados en Cd. Juárez, Chihuahua y
Delicias). Sin el país activo del 096, la cartelera chilena de la app mostraría esos
eventos mexicanos mezclados. Este spec consulta los externos con el `pais` de `usePais()`
(contexto que crea el 096).

## Diseño

### 1. Tipos (`src/types/index.ts`)

`comienzaAt` y `moneda` ya los agrega el spec 116 (tipo y `mapEventoFromDB`), y `pais` el
095: no se duplican. `Evento` suma además estos campos **opcionales** (opcionales para no
romper los objetos que se arman a mano, como el `Omit<Evento, 'id'>` de `createEvento`):

```ts
tipoPrecio?: 'general' | 'puerta';  // spec 064
descripcion?: string | null;        // spec 087
visibleEnCartelera?: boolean;       // spec 079
createdAt?: string;                 // fecha de publicación (no del show); la usa el feed del 123
```

Tipos nuevos:

```ts
/** Evento scrapeado de otra plataforma (spec 049). No se vende en Sonópolis. */
export interface EventoExterno {
  id: string;
  sourceSlug: string;
  fuenteNombre: string;   // event_sources.nombre; fallback al slug
  sourceUrl: string;
  titulo: string;
  comienzaAt: string;     // NOT NULL en la tabla
  venueNombre: string | null;
  comuna: string | null;
  pais: string;
  imagen: string | null;
  genero: string | null;
}

/** Respuesta del RPC precio_vigente_de (spec 100). */
export interface PrecioVigente {
  precio: string;
  monto: number;
  preventaId: string | null;
  preventaNombre: string | null;
  restantes: number | null;
  cierraAt: string | null;
  moneda: string | null;
  seVende: boolean;
}
```

### 2. Mapper (`src/context/EventosContext.tsx`)

- `mapEventoFromDB` suma: `tipoPrecio: db.tipo_precio ?? 'general'`,
  `descripcion: db.descripcion ?? null`,
  `visibleEnCartelera: db.visible_en_cartelera ?? true`, `createdAt: db.created_at`.
  Mismos respaldos que `sonopolisWeb/libs/mappers.js:38-80`.
- `mapEventoFromDB` pasa a `export function` — el feed del spec 123 consulta `events` por su
  cuenta y necesita el mismo mapeo (los providers son el único punto de mapeo, `CLAUDE.md`
  del repo). Nada más cambia en el contexto.
- La consulta de `loadFromSupabase` ordena por `comienza_at` ascendente con los nulos al
  final (`.order('comienza_at', { ascending: true, nullsFirst: false })`), igual que
  `getEventos` de la web. **Respeta lo que dejaron 096 y 115** (el filtro por país del 096 y
  el manejo de errores del 115): solo se agrega el `.order`.

### 3. `formatearMonto` en `src/lib/precio.ts`

El spec 116 crea `src/lib/precio.ts` con `montoDesdePrecio` (el equivalente de la mitad de
`sonopolisWeb/libs/moneda.js`); acá se le agrega la otra mitad, para que el dinero viva en
un solo archivo como en la web:

```ts
export function formatearMonto(monto: number | null | undefined, moneda: string | null | undefined): string
```

- `$5.000 CLP`, `$1,320 MXN`, `$5.000` sin moneda (país sin fila en `paises_cobro`).
- **Sin `toLocaleString`:** el separador de miles se arma a mano (`.` para `CLP` y moneda
  desconocida, `,` para `MXN`) con
  `String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep)`. Motivo: igual que el
  `Intl.DisplayNames` del spec 095, el soporte de locales de `Intl` en Hermes (el motor JS
  de React Native) no está garantizado en todos los builds, y un precio no puede depender
  de eso. Los montos son enteros (`events.monto integer`), no hace falta decimal.
- Se **agrega** la función; lo que dejó el 116 en el archivo no se toca.

### 4. `src/lib/fechaCartelera.ts`

Funciones puras, todas en la hora local del teléfono (la misma decisión que la web toma
con la hora local del navegador, `Cartelera.js:61`):

- `claveDiaLocal(iso)` → `"YYYY-MM-DD"` en hora local (slicear el ISO, que es UTC, corre el
  día de los eventos entre 21:00 y 00:00 en Chile).
- `formatearDiaLargo(iso)` → `"Sábado 18 de octubre"`. Con arreglos propios de días y meses
  en español, **no** con `Intl.DateTimeFormat`, por el mismo motivo de Hermes del punto 3.
- `rangoFecha(filtro: 'todos' | 'hoy' | 'finde' | 'semana')` → `[inicio, fin) | null`, copia
  de `Cartelera.js:77`.
- `inicioDeHoyLocal()` → ISO de la medianoche de hoy en el teléfono. La web corta los
  externos en la medianoche **del país que se mira** (`inicioDeHoyEn(pais)`); acá se usa la
  del teléfono porque calcular otro huso pide `Intl` con `timeZone`, el mismo riesgo de
  Hermes. La diferencia solo aparece si alguien mira la cartelera de un país con otro huso
  que el suyo, y entonces el error es mostrar u ocultar unas horas de eventos de hoy.

### 5. `src/hooks/useEventosExternos.ts`

`useEventosExternos(pais: string)` → `{ externos: EventoExterno[]; loading: boolean; error: string | null; refrescar: () => Promise<void> }`.

Consulta, igual que `getEventosExternos`:

```ts
supabase.from('external_events')
  .select('*, event_sources(nombre)')
  .eq('status', 'publicado')
  .is('duplicado_de_event_id', null)
  .is('desaparecido_at', null)
  .gte('comienza_at', inicioDeHoyLocal())
  .eq('pais', pais)
  .order('comienza_at', { ascending: true })
```

- Mapeo snake_case → camelCase dentro del hook (es la única puerta a esta tabla en la app).
  `fuenteNombre: db.event_sources?.nombre ?? db.source_slug`.
- Vuelve a consultar cuando cambia `pais`.
- **Sin mock y sin `catch {}`:** si falla, `externos = []`, `error` con el mensaje, y
  `console.error('[useEventosExternos]', error)`. Degradar a lista vacía es lo mismo que hace
  la web (`page.js:44`): sin externos la cartelera se ve con menos eventos, no rota.

### 6. `src/hooks/usePrecioVigente.ts`

`usePrecioVigente(eventoId: string | null)` → `{ vigente: PrecioVigente | null; loading: boolean; error: string | null }`.

- Con `eventoId === null` no consulta nada y devuelve `vigente: null` — así quien llama
  decide cuándo vale la pena el viaje a Postgres.
- Llama `supabase.rpc('precio_vigente_de', { p_evento_id: eventoId }).single()` y mapea
  `precio, monto, preventa_id, preventa_nombre, restantes, cierra_at, moneda, se_vende`
  (forma del RPC en `20260922120000_spec_100_moneda_por_pais_de_cobro.sql:97-100`).
- Error → `vigente: null`, `error` con mensaje y `console.error`. Una preventa que no se pudo
  cotizar degrada al precio base, mismo criterio que `page.js` de la web.

### 7. `src/components/PrecioEvento.tsx` (nuevo)

Equivalente de `PrecioTarjeta` (`sonopolisWeb/components/TarjetaEvento.js:89`).
Props: `{ evento: Evento; vigente: PrecioVigente | null; alinear?: 'inicio' | 'fin' }`.

- Sin preventa vigente (`!vigente?.preventaId`): si `evento.monto > 0`,
  `formatearMonto(evento.monto, evento.moneda)`; si no, `evento.precio` si tiene texto; si
  tampoco, nada.
- Con preventa: badge `🔥 {preventaNombre}`, `formatearMonto(vigente.monto, evento.moneda)`
  más `· quedan {restantes}` si `restantes != null`, y debajo, chico,
  `puerta {formatearMonto(evento.monto, evento.moneda)}`.
- Estilos con tokens de `src/theme` (`colors.success` para el monto, `colors.accentLight` /
  `colors.accent` para el badge).

### 8. `src/components/TarjetaEvento.tsx`

Solo cambia el precio: `<Text style={styles.precio}>{evento.precio}</Text>` pasa a
`<PrecioEvento evento={evento} vigente={null} />`. Sin consulta de preventa: esta tarjeta la
usan `DashboardLocalScreen` y `PerfilMusicoScreen`, donde N llamadas al RPC no aportan.

### 9. `src/components/EventoDestacado.tsx` (nuevo)

Props: `{ evento: Evento; onPress: () => void }`. Tarjeta grande con fondo
`colors.primary` y texto `colors.white` (la superficie oscura del W-016, con los tokens de
esta app):

- Flyer (`evento.imagen`) a la izquierda, `width: 112`, alto según su proporción
  (`aspectRatio` desde `Image.getSize`, o `resizeMode="contain"` con alto máximo de 160 si
  es más simple). Sin imagen no se reserva espacio.
- Chip «Destacado» (`colors.accentLight` / `colors.accent`), artista (`fontSize.lg`, negrita),
  género, `📍 {venueName} · {fecha} · {hora}`, y la descripción en 2 líneas
  (`numberOfLines={2}`) si existe.
- Precio: `usePrecioVigente(evento.tipoPrecio === 'puerta' && evento.status !== 'cancelled' ? evento.id : null)`
  + `<PrecioEvento>`.
- Si `status === 'cancelled'`: chip «Cancelado» en `colors.danger`, flyer con `opacity: 0.5`,
  y no se muestra precio.

### 10. `src/components/TarjetaEventoExterno.tsx` (nuevo)

Props: `{ evento: EventoExterno }`. Hermana de `TarjetaEvento`, no un modo de ella (W-024,
Decisión 2): un externo no se vende acá, así que **no tiene precio ni botón de compra**.

- Toca → `Linking.openURL(evento.sourceUrl)`. No hay pantalla de detalle propia: una
  ficha para contenido de otra plataforma sería republicarlo (misma razón que la web).
- Flyer 72×96 si hay `imagen`; título en 2 líneas; `📍 {venueNombre} · {comuna}` si hay
  local; `vía {fuenteNombre} ↗` en `colors.muted`; «Entradas en la fuente» chico.

### 11. `src/screens/CarteleraScreen.tsx`

- Lee `pais` de `usePais()` (096), `eventos`, `loading` y `refresh` de `useEventos()`, y
  `useEventosExternos(pais)`.
- **Visibles** (antes de cualquier filtro), igual que `page.js:97-104`:
  `e.status !== 'draft' && e.visibleEnCartelera !== false && (e.comienzaAt == null || Date.parse(e.comienzaAt) >= Date.now() - 6 * 3600 * 1000)`.
  Constante `HORAS_VISIBLE_TRAS_INICIO = 6` con comentario del porqué (W-127: un show de
  madrugada no se corta por fecha de calendario).
- **Filtros** (estado local de la pantalla):
  - búsqueda de texto (`TextInput`, «Buscar por artista, género o local…»): internos por
    `artista + genero + venueName`, externos por `titulo + venueNombre`, en minúsculas;
  - fecha: chips `Todos · Hoy · Finde · Esta semana` con `rangoFecha`; un rango nunca
    incluye eventos con `comienzaAt` nulo;
  - género: el `GeneroPicker` que ya existe, sin cambios. Los externos tienen `genero` nulo
    casi siempre: con un género elegido quedan fuera (correcto, no se afirma un dato que no
    se tiene);
  - «Solo Sonópolis»: `Switch`, apagado por defecto, visible solo si `externos.length > 0`.
- **Orden y reparto:**
  - destacados = internos visibles que pasan los filtros, en el orden del contexto (por
    `comienzaAt`). Todos, no solo el primero.
  - secciones = externos que pasan los filtros, agrupados por `claveDiaLocal`, título
    `formatearDiaLargo`.
- **Render:** `SectionList`. `ListHeaderComponent` = título + contador
  (`{n} shows`), búsqueda, chips de fecha, filtro de género, interruptor, y la lista de
  `EventoDestacado` (toca → `DetalleEvento` como hoy). Cada sección es un día con sus
  `TarjetaEventoExterno`. `RefreshControl` llama a `refresh()` y `refrescar()` juntos.
- **Vacíos** (W-113, Decisión 4): si `eventos` del país y `externos` están los dos vacíos,
  `Todavía no hay eventos en {PAISES[pais].nombre}.`; si hay datos pero los filtros no dejan
  pasar nada, `Ningún evento calza con estos filtros.`.
- Si `useEventosExternos` trae `error`, una línea en `colors.muted` arriba de las secciones:
  «No se pudieron cargar los eventos de otras plataformas.» La cartelera propia se sigue
  viendo.
- Si `useEventos().error` (lo agrega el spec 115) no es nulo, en lugar de la lista:
  «No se pudo cargar la cartelera.» y un botón «Reintentar» que llama a `refresh()`. Sin
  mock: el 115 los borra.
- El efecto de `pending_ticket` (`:28-44`) queda igual.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin errores.
2. Con un evento externo publicado del país activo y fecha futura, la cartelera lo muestra
   bajo el título de su día, con «vía {fuente}», y tocarlo abre `source_url` en el
   navegador.
3. Un externo de otro país, con `status` distinto de `publicado`, con
   `duplicado_de_event_id` o con `desaparecido_at` no aparece.
4. Todos los eventos internos visibles aparecen arriba como destacados, antes de cualquier
   día de externos, y ningún interno aparece dos veces.
5. Un evento `draft`, uno con `visible_en_cartelera = false` y uno que empezó hace más de 6
   horas no aparecen. Uno que empezó hace 2 horas sí.
6. «Solo Sonópolis» encendido oculta todos los externos y deja los destacados.
7. «Hoy», «Finde» y «Esta semana» acotan internos y externos; «Todos» vuelve a mostrar
   también los internos sin `comienzaAt`.
8. Un evento de `CLP` muestra `$5.000 CLP`; uno de `MXN` con monto 1320 muestra
   `$1,320 MXN`; uno con preventa abierta muestra el badge, el monto de preventa y
   «puerta …».
9. `DashboardLocalScreen` y `PerfilMusicoScreen` siguen mostrando sus tarjetas, ahora con
   moneda.
10. `rg -n "external_events" src/` solo aparece en `src/hooks/useEventosExternos.ts`.
11. `npx expo export --platform web` termina sin errores.

## Fuera de alcance

- Filtros por local, comuna y tipo de evento de la web (`Cartelera.js`): la búsqueda de
  texto cubre el caso del local, y el de comuna necesita resolver la división
  administrativa por país (pendiente del spec 095).
- Chip del local que abre el mapa (W-150): llega con el mapa del spec 127.
- Aviso de colaboraciones (`AvisoColaboraciones`, W-091) arriba de la cartelera.
- Formatear fecha y hora en el huso del país del evento (W-158).
- Cambiar `EventoExterno` o el pipeline de scraping.
- El aviso de cancelación en vivo: es del detalle (spec 120).

## Verificación manual (candidatas a `V#`)

- V-a: en un teléfono real, la cartelera con el país `CL` muestra externos de fuentes
  chilenas agrupados por día, y con `MX` (selector del 096) los de Cd. Juárez.
- V-b: un evento creado hoy a las 23:30 aparece bajo el día correcto, no bajo mañana.
- V-c: los precios en `MXN` se leen con coma de miles en el dispositivo (prueba de que no se
  depende de `Intl`).
