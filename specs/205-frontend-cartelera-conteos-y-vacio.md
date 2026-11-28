# Spec 205 — Cartelera de la app: cuántos shows trae cada fecha, días con nombre y un vacío que sugiere

> Estado: propuesto (27-nov-2026)
> Capa: FRONTEND. `src/screens/CarteleraScreen.tsx`, `src/components/TarjetaEventoExterno.tsx`.
> Depende de: spec 196 (`contarPorFecha`, `agruparPorDia`, `horaCorta`, `mensajeVacio`, `proximosParaVacio`, `rangoFecha` con `ahora`), spec 175 (`limpiarFiltros`, `filtrosActivos`), spec 173 (`useEstilos`, `useTema`).
> Hermano en la web: `components/Cartelera.js`, `components/cartelera/SelectorFecha.js`, `EncabezadoDia.js`, `VacioCartelera.js`, `components/TarjetaEventoExterno.js` (W-313, solo la parte de comportamiento).

> **En una frase:** los botones de fecha de la Cartelera dicen cuántos shows trae cada uno,
> los días de «otras plataformas» se marcan «HOY» o «MAÑANA» con su cantidad, cada tarjeta
> externa muestra la hora, y cuando no hay nada la pantalla dice por qué, ofrece una salida
> y sugiere lo próximo de Sonópolis.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después
de esta orquestación.»

En la app, elegir «Hoy» o «Finde» es a ciegas (los botones no dicen cuántos hay), los
externos no dicen a qué hora son, y el vacío es una línea que no ofrece salida. La web lo
resolvió en W-313; este spec trae el comportamiento, no el rediseño visual (píldoras,
tipografía, colapso por día y destacados con bloque de fecha quedan fuera).

## Decisión

Textos entre comillas, literales. Colores con `useEstilos` y la paleta; ningún hex nuevo.
`ahora` se toma una vez por render (`const ahora = new Date()`) y se pasa a todas las
funciones del 196 y a `rangoFecha`, para que conteo, rango y etiquetas usen el mismo
instante.

### 1. Conteos en los botones de fecha

- Se arma la lista **filtrada por todo menos la fecha**: los internos de `visibles` que pasan
  búsqueda y género (las mismas condiciones de `destacados`, sin `enRango`) y los externos
  que pasan búsqueda, género y «Solo Sonópolis» (las de `externosFiltrados`, sin `enRango`).
  `const conteo = contarPorFecha([...internosSinFecha, ...externosSinFecha], ahora)`.
  `destacados` y `externosFiltrados` pasan a derivarse de esas dos listas más `enRango`, así
  las condiciones no quedan escritas dos veces.
- Cada botón de `FILTROS_FECHA` muestra la etiqueta de hoy y, debajo, «{n} shows» con
  `conteo[f.clave]` («1 show» si es 1), en `fontSize.xs`; en el activo, con el mismo color
  de texto que la etiqueta activa (`c.onAccent`), y en los demás, `c.muted`. Orden y
  etiquetas de los botones no cambian.
- `rangoFecha(filtroFecha, ahora)` recibe `ahora` (spec 196 §1).

### 2. Días con nombre en «otras plataformas»

- El `Map` `porDia` armado a mano y `secciones` se reemplazan por
  `agruparPorDia(externosFiltrados, ahora)`, mapeado a `{ title: grupo.titulo, etiqueta:
  grupo.etiqueta, data: grupo.items }` para el `SectionList`.
- `renderSectionHeader` dibuja una fila: a la izquierda, si hay etiqueta, una insignia
  «HOY» (fondo `c.accent`, texto `c.onAccent`, negrita, `fontSize.xs`) o «MAÑANA» (fondo
  `c.background`, borde 1 `c.border`, texto `c.primary`); al lado el título del día con el
  estilo `dia` de hoy; a la derecha, en `c.muted`, «{n} shows» («1 show» si es 1).
- Se borra el import de `claveDiaLocal` y `formatearDiaLargo` de la pantalla si quedan sin
  uso (las usa el 196 por dentro).

### 3. Hora en cada tarjeta externa — `src/components/TarjetaEventoExterno.tsx`

Una línea nueva, después del título y antes del lugar: `horaCorta(evento.comienzaAt)` en
negrita, `fontSize` 13, `c.primary` (W-313 móvil: el día ya está en el encabezado, la tarjeta
lleva solo la hora). Si `horaCorta` devuelve `""`, la línea no se dibuja. Nada más del
componente cambia (abre la fuente igual, mismo lugar, mismo «vía {fuente} ↗»).

### 4. Vacío que sugiere

Cuando `total === 0`, el `ListFooterComponent` deja de ser una línea y pasa a ser un bloque
centrado, con padding `spacing.lg`:

- `const vacio = mensajeVacio({ fecha: filtroFecha, genero: generoFiltro, nombrePais:
  PAISES[pais]?.nombre ?? null, paisSinCartelera: sinDatos })`. `sinDatos` es el mismo de
  hoy (`visibles.length === 0 && externos.length === 0`), así se conserva la diferencia del
  spec 096 entre «el país no tiene cartelera» y «los filtros no dejan nada».
- Un círculo de 64 con fondo `c.highlightBg`, borde 1 `c.highlightBorder` y el ícono
  `Ionicons` `calendar-outline` en `c.highlightText` (`@expo/vector-icons` ya está en la app:
  lo usa `ConfirmacionCompraScreen.tsx`).
- `vacio.titulo` en `fontSize.lg`, negrita, `c.primary`, centrado; `vacio.detalle` en
  `fontSize.md`, `c.secondary`, centrado.
- Si `vacio.salidaFecha`: botón a todo el ancho (fondo `c.accent`, texto `c.onAccent`,
  negrita) con ese texto; pone `filtroFecha` en `'todos'` sin tocar los demás filtros.
- Si `filtrosActivos.length > 0`: botón secundario a todo el ancho (fondo
  `c.cardBackground`, borde 1 `c.border`, texto `c.primary`) «Limpiar filtros», que llama a
  `limpiarFiltros()` del spec 175. El «Limpiar filtros ({n})» de la fila de filtros no
  cambia.
- Debajo, `const sugeridos = proximosParaVacio(visibles, { genero: generoFiltro, ahora })`.
  Si trae algo: título de sección «Lo próximo de {género}» (con el género tal cual lo
  muestra el filtro) o «Lo próximo en Sonópolis» sin género, con el estilo `dia`, y cada
  sugerido con `EventoDestacado` (`packEspecial={null}`, mismo `onPress` que los destacados:
  navega a `DetalleEvento`).
- Con `paisSinCartelera`, la sugerencia no se busca (no hay internos).

### Lo que NO cambia

La carga, el error con «Reintentar», el selector de país, el picker de género, el
interruptor «Solo Sonópolis», el refresco, la auto-navegación por `pending_ticket` y los
packs de los destacados.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `npx expo export --platform web` termina sin errores.
3. Ningún hex nuevo en los archivos tocados (`git diff` sin `#[0-9a-fA-F]{3,6}` agregado).
4. `grep -n "contarPorFecha\|agruparPorDia\|mensajeVacio\|proximosParaVacio" src/screens/CarteleraScreen.tsx`
   devuelve las cuatro, y `grep -n "new Map<string, EventoExterno" src/screens/CarteleraScreen.tsx`
   no devuelve nada.
5. `grep -n "Ningún evento calza con estos filtros\.'" src/screens/CarteleraScreen.tsx` no
   devuelve nada (el texto viene del 196).
6. `grep -n "horaCorta" src/components/TarjetaEventoExterno.tsx` devuelve el import y la
   llamada.
7. `git diff --stat` del commit toca solo los dos archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Con eventos hoy y el finde: los números de «Hoy», «Finde» y «Esta semana» coinciden con lo
  que se ve al tocar cada uno, también con un género elegido.
- Un externo de hoy y uno de mañana: insignias «HOY» y «MAÑANA», cantidad por día y hora en
  cada tarjeta.
- «Hoy» + un género sin eventos hoy: «Hoy no hay {género} en Chile», «Ver {género} en otras
  fechas» lleva a «Todos» con el género puesto, y aparece «Lo próximo de {género}».
- Las dos vistas en tema claro y oscuro.

## Fuera de alcance

- El rediseño visual de W-313: píldoras de filtros, encabezado «Cartelera» con contador de
  locales, «Compra aquí» / «Más en la ciudad», colapso por día con «Ver los N del sábado»,
  póster de escritorio y «Ver en mapa».
- Cambiar el orden de los botones de fecha (W-313 pasa a Hoy, Finde, Semana, Todos): es
  parte del rediseño visual.
- Cambiar el huso con que se decide «hoy» (multipaís B1, ver spec 196).
