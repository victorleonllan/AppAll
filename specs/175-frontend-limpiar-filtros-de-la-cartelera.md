# Spec 175 — Cartelera: botón «Limpiar filtros (n)» en píldora de acento

> Estado: aplicado (13-nov-2026) — criterios 1-2 verificados (`tsc --noEmit` limpio, `expo export --platform web` sin error); 3-7 pendientes de prueba en dispositivo
> Capa: FRONTEND. `src/screens/CarteleraScreen.tsx`.
> Depende de: spec 119 (aplicado), spec 146 (aplicado)
> Hermano en la web: W-156 (el botón, `components/Cartelera.js:28-45,144-163,399-414`) y
> W-275 (el botón en píldora de acento).

> **En una frase:** la cartelera de la app gana el botón «✕ Limpiar filtros (n)» que la
> web tiene desde W-156: aparece solo con filtros puestos, dice cuántos son, los suelta
> todos menos el país, y se dibuja como píldora del color de acento con texto en
> contraste, como lo dejó W-275.

## Contexto

W-275 cambió el estilo del «Limpiar filtros» de la cartelera web a `btn-accent
rounded-full`: el mismo tratamiento que la píldora activa «Todos» de la misma fila, porque
el acento ya significa «esto está activo» en la cartelera. El botón que W-275 restyla lo
creó W-156, y **la app nunca lo tuvo**: `CarteleraScreen.tsx` no tiene ningún «limpiar»
(`rg -n -i limpiar src/screens/CarteleraScreen.tsx` no encuentra nada). Llevar W-275 a la
app es, entonces, llevar el botón de W-156 con el estilo de W-275.

Lo que define W-156, leído del código de la web:

- `FILTROS_VACIOS` declara una vez qué es «sin filtrar» para cada filtro; de ahí salen el
  contador y la limpieza, para que no puedan discrepar (Decisión 4, `Cartelera.js:28-45`).
- **El país no se limpia** (Decisión 1): no tiene estado «sin filtrar», y limpiarlo
  obligaría a elegir a qué país volver.
- El botón existe solo si hay algo que limpiar (Decisión 2) y dice cuántos filtros hay
  puestos (Decisión 3): «Limpiar filtros ({filtrosActivos.length})».

Los filtros de la app son cuatro, todos en estado local de `CarteleraScreen`
(`:116-123`): `busqueda` (`''`), `filtroFecha` (`'todos'`), `generoFiltro` (`null`) y
`soloSonopolis` (`false`). El país vive en `PaisContext` y se elige con `SelectorPais` en
la segunda fila de filtros (`:264-272`), junto a «Género». La web tiene además local,
comuna y tipo; la app no (spec 146, «Fuera de alcance»).

En la app el acento es el marrón `colors.accent` y la píldora activa de fecha usa
`filtroActivo` (fondo `colors.accent`) con `filtroTextoActivo` (texto `colors.white`)
(`:352-353`).

## Decisiones

1. **Mismas reglas que W-156:** `FILTROS_VACIOS` a nivel de módulo con los cuatro filtros
   de la app; `filtrosActivos` se deriva comparando cada valor con su vacío; el botón se
   dibuja solo si `filtrosActivos.length > 0`; el país no está en la lista.
2. **Va en la segunda fila de filtros, después de «Género»**, igual que en la web va al
   final de la fila de selects. Si no entra, `flexWrap` (`:341`) lo baja de línea.
3. **Estilo de W-275 con los tokens de la app:** fondo `colors.accent`, sin borde visible,
   radio de píldora (`999`), texto semibold en el color de texto de la píldora activa
   (`colors.white` hoy; `onAccent` después de la migración de 176), «✕» delante. Es el
   mismo tratamiento que la píldora activa de la fila de fechas, que es la razón que da
   W-275. El amarillo literal de la web no existe en la paleta de la app: su acento es el
   marrón (ver «Fuera de alcance»).
4. **Este spec no migra la pantalla al tema** (173): usa `colors` como el resto del
   archivo. Lo migra 176, que depende de este para no editar el mismo archivo a la vez.

## Cambios por archivo

### `src/screens/CarteleraScreen.tsx`

- A nivel de módulo, con comentario que cite W-156 Decisión 4:

  ```ts
  const FILTROS_VACIOS = {
    busqueda: '',
    filtroFecha: 'todos' as FiltroFecha,
    generoFiltro: null as string | null,
    soloSonopolis: false,
  };
  ```

- En el componente:
  - `filtrosActivos = Object.entries({ busqueda, filtroFecha, generoFiltro, soloSonopolis })
    .filter(([clave, valor]) => valor !== FILTROS_VACIOS[clave as keyof typeof FILTROS_VACIOS])`.
    `busqueda` se compara tal cual, sin `trim`, igual que la web.
  - `limpiarFiltros()` pone los cuatro estados en su valor de `FILTROS_VACIOS`. No toca
    `pais`.
- En la segunda `filaFiltros` (`:264-272`), después del `TouchableOpacity` de «Género»:
  `{filtrosActivos.length > 0 && <TouchableOpacity style={styles.limpiar}
  onPress={limpiarFiltros} accessibilityRole="button"><Text
  style={styles.limpiarTexto}>✕ Limpiar filtros ({filtrosActivos.length})</Text></TouchableOpacity>}`.
- Estilos nuevos: `limpiar` (fondo `colors.accent`, `borderRadius: 999`,
  `paddingVertical: spacing.xs`, `paddingHorizontal: spacing.md`, `alignSelf:
  'flex-start'`) y `limpiarTexto` (`fontSize.sm`, `fontWeight: '600'`, color
  `colors.white`).

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. Sin filtros puestos, el botón no existe.
4. Con búsqueda «rock» y fecha «Hoy», el botón dice «✕ Limpiar filtros (2)»; al tocarlo,
   la búsqueda queda vacía, la píldora activa vuelve a «Todos» y el botón desaparece.
5. Con un género elegido y «Solo Sonópolis» encendido, dice «(2)» y al tocarlo vuelven
   «Género: Todos» y el interruptor apagado.
6. El país elegido no cambia al limpiar.
7. El botón es una píldora del color de acento con texto blanco semibold, igual que la
   píldora activa de fechas.

## V-candidatas

- **175-a** — En un teléfono de 360 px, con un nombre de país largo en `SelectorPais`, el
  botón baja a una segunda línea sin cortar el texto.

## Fuera de alcance

- Amarillo `#FFE900` literal: la app usa su acento marrón (spec 173, Decisión 1). Si la
  app adopta la paleta de la web, el botón sigue al acento sin cambios.
- El «Limpiar filtros» del directorio de músicos de la web: W-275 lo deja afuera y la app
  no lo tiene.
- Filtros de local, comuna y tipo: la app no los tiene (spec 146).
- Migrar la pantalla al tema: 176.
