# Spec 146 — El filtro de género de la cartelera ofrece solo los géneros que hay

> Estado: propuesto (17-oct-2026)
> Capa: FRONTEND. `src/screens/CarteleraScreen.tsx`, `src/components/GeneroPicker.tsx`,
> `src/lib/generos.ts`.
> Depende de: spec 056 (aplicado), spec 119 (aplicado)
> Hermano en la web: `components/Cartelera.js:213-216` (`generos` derivado de los ítems).

> **En una frase:** en la cartelera, el selector de género lista solo los géneros de los
> eventos que se pueden mostrar, igual que la web, para que ninguna opción devuelva una
> lista vacía.

## Contexto

El addendum del spec 056 (25-ago-2026) dejó anotado que el filtro de la app es peor que el
de la web. `CarteleraScreen` abre `GeneroPicker`, que busca sobre `GENEROS_MUSICALES`
completo (`buscarGeneros`, `src/lib/generos.ts:15`): 174 géneros, aunque haya cinco eventos
cargados. Casi cualquier opción deja la cartelera vacía.

La web deriva las opciones de lo que hay:
`[...new Set(todosLosItems.map((i) => i.genero).filter(Boolean))].sort()`, donde
`todosLosItems` son los internos más los externos, salvo que «Solo Sonópolis» esté activo
(`Cartelera.js:208-216`). El addendum pedía un spec nuevo con este mismo patrón: este es.

`GeneroPicker` lo usan también los formularios (CrearEvento, EditarEvento, EditarLocal,
EditarPerfilBanda), y ahí sí debe ofrecer el listado cerrado completo. Por eso el cambio va
detrás de una prop opcional.

## Diseño

### `src/lib/generos.ts`

`buscarGeneros(query, lista = GENEROS_MUSICALES)` recibe un segundo parámetro opcional:
la lista sobre la que se filtra, con la misma normalización (sin tildes ni mayúsculas).
Sin segundo argumento hace lo mismo que hoy.

### `src/components/GeneroPicker.tsx`

Prop nueva `opciones?: string[]`. Si viene, `resultados = buscarGeneros(query, opciones)`;
si no, sigue como hoy. Si `opciones` viene vacío, la lista muestra solo «Todos los géneros»
(con `permitirTodos`) y debajo el texto «Todavía no hay géneros en la cartelera».

### `src/screens/CarteleraScreen.tsx`

- `generosDisponibles` con `useMemo`: el conjunto de `e.genero` no vacíos de `visibles`
  (internos), más el de `externos` cuando `!soloSonopolis`. Ordenado con
  `localeCompare(…, 'es')`. Se calcula **antes** de los filtros de texto, fecha y género,
  igual que la web: si se derivara de lo ya filtrado, al elegir un género desaparecerían
  los demás.
- Si `generoFiltro` está puesto y no está en `generosDisponibles` (por ejemplo, después de
  activar «Solo Sonópolis»), se agrega a la lista igual, para que la selección actual se
  vea y se pueda cambiar.
- Se pasa `opciones={generosDisponibles}` al `GeneroPicker` de `:291-298`.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. Con eventos de géneros `Rock` y `Jazz` en la cartelera, el selector muestra «Todos los
   géneros», `Jazz` y `Rock`, y nada más.
4. Escribir «roc» en la búsqueda del selector deja solo `Rock`.
5. En CrearEventoScreen, el selector sigue ofreciendo los 174 géneros.
6. Con «Solo Sonópolis» activo, los géneros que solo traen los externos dejan de aparecer.

## Fuera de alcance

- Normalizar géneros viejos en texto libre («Jazz fusión»). Es el mismo trade-off del 054:
  aparecerán como opción propia, igual que en la web.
- Filtros de local y comuna (la web los tiene y la app no). Si se quieren, es otro spec.
