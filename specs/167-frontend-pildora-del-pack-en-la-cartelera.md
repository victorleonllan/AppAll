# Spec 167 — La cartelera marca con una píldora roja los eventos que tienen un pack a la venta

> Estado: aplicado (13-nov-2026) — criterios 1, 2 y 7 verificados (`tsc --noEmit` limpio, `expo export --platform web` sin error, solo cambian los dos archivos de `> Capa:`); 3-6 pendientes de prueba en dispositivo/red
> Capa: FRONTEND. `src/screens/CarteleraScreen.tsx`, `src/components/EventoDestacado.tsx`.
> Depende de: spec 164 (`getPacksMinimosDeEventos`, `nombreDeEspecial`), spec 173 (token `especial`), spec 175 (mismo archivo `CarteleraScreen.tsx`: este va después).
> Hermano en la web: `components/TarjetaEvento.js` y `app/(marketing)/cartelera/page.js` (W-255 §5).

> **En una frase:** cada tarjeta destacada de la cartelera con un pack activo muestra, junto a
> «Destacado», una píldora roja con el pack de menor multiplicador («2x1»), y la cartelera lo
> averigua con una consulta por lote, no una por tarjeta.

## Contexto

En la web, `TarjetaEvento` muestra una píldora sólida en `--color-especial` con el pack de
menor multiplicador cuando el evento tiene alguno a la venta (`TarjetaEvento.js:91-119`), y
`cartelera/page.js` trae los packs de todos los eventos listados en una sola consulta por
`event_id IN (…)` (`getPacksMinimosDeEventos`, `libs/data/especiales.js`).

En la app, los eventos de Sonópolis de la cartelera se dibujan con `EventoDestacado`
(`CarteleraScreen.tsx:284-290`), sobre la lista `destacados` (`:153-158`). La tarjeta tiene
una fila de chips («Destacado» y, si corresponde, «Cancelado»; `EventoDestacado.tsx:35-44`).
`TarjetaEvento` (`src/components/TarjetaEvento.tsx`) no aparece en la cartelera: la usan el
panel del local y el perfil del músico, y a propósito no hace consultas por tarjeta (comentario
de `:21-23`).

## Decisiones

### 1. Solo en `EventoDestacado`

Es la tarjeta de los eventos de Sonópolis en la cartelera, el equivalente de la tarjeta de la
web. `TarjetaEvento` queda igual: el panel del local y el perfil del músico no son donde el fan
decide qué comprar, y sumarle la consulta contradice su comentario del spec 119. Los eventos
externos (`TarjetaEventoExterno`) no tienen packs.

### 2. La pantalla consulta, la tarjeta solo dibuja

`CarteleraScreen` llama `getPacksMinimosDeEventos(ids de destacados)` y le pasa a cada tarjeta
`packEspecial: string | null` («2x1»). **Por qué no un hook dentro de `EventoDestacado`:** serían
N consultas para N tarjetas, que es justo lo que W-255 §5 descarta. La consulta lee la tabla y
no `especiales_vigentes_de` (spec 164): es más laxa, y el detalle es quien decide qué se compra.

### 3. Sin píldora en un evento cancelado

La tarjeta ya oculta el precio de un evento cancelado (`EventoDestacado.tsx:55`); ofrecer un 2x1
de un evento que no ocurre sería contradictorio.

## Cambios por archivo

### `src/screens/CarteleraScreen.tsx`

- Estado `packsPorEvento: Map<string, number>` (vacío al inicio).
- Efecto con dependencia `idsDestacados = destacados.map((e) => e.id).join(',')` (un string,
  para que el efecto no corra en cada render por un arreglo nuevo): si está vacío, Map vacío;
  si no, `getPacksMinimosDeEventos(ids)` y guarda el resultado si el efecto sigue activo (patrón
  `let activo = true` de la app). La función nunca lanza (spec 164).
- En el `map` de `:284-290`: `packEspecial={packsPorEvento.has(e.id) ?
  nombreDeEspecial(packsPorEvento.get(e.id)!) : null}`.

Los hooks nuevos van junto a los demás hooks de la pantalla, antes de cualquier `return`.

### `src/components/EventoDestacado.tsx`

- Prop nueva opcional `packEspecial?: string | null`.
- En la fila de chips (`:35-44`), después de «Destacado» y solo si `packEspecial && !cancelado`:
  un chip con fondo `colors.especial`, texto `colors.especialContenido`, `fontWeight: '600'`, el
  mismo tamaño y radio que `chipDestacado`, con el texto `packEspecial`.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. Un evento con un 3x1 y un 2x1 activos y con cupo muestra la píldora roja «2x1»; con el 2x1
   cerrado o con `vendidos = cupo`, muestra «3x1»; sin packs, la tarjeta es igual a antes.
4. Un evento cancelado con un pack activo no muestra la píldora.
5. Con 3 eventos destacados en pantalla, la pestaña de red del build web muestra **una**
   consulta a `event_tickets_especiales` (no tres) al cargar la cartelera.
6. Si la consulta falla (por ejemplo, sin red), la cartelera se ve completa y sin píldoras.
7. Solo cambian los dos archivos de `> Capa:`.

## Fuera de alcance

- Píldora en `TarjetaEvento` (panel del local, perfil del músico): Decisión 1.
- El 🔥 de preventa en la cartelera: `EventoDestacado` ya lo muestra con `PrecioEvento` y no
  cambia.

## Verificación manual (candidatas a `V#` en `specs/PENDIENTES.md`)

- **V-candidata 167-a:** en un teléfono, la cartelera con un evento de prueba que tiene un 2x1
  muestra la píldora roja junto a «Destacado» y no se corta en una tarjeta con flyer.
