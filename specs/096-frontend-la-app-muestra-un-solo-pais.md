# Spec 096 — La app móvil muestra la cartelera de un país

> Estado: propuesto (21-sep-2026) — **no se implementa hasta que exista un segundo país con cartelera**
> Capa: FRONTEND. `src/constants/paises.ts`, `src/context/PaisContext.tsx` (nuevo), `src/context/EventosContext.tsx`, `src/context/VenuesContext.tsx`, `src/screens/CarteleraScreen.tsx`, `src/screens/LocalesScreen.tsx`.
> Depende de: spec 095 (el catálogo ISO ya existe en la app y las filas nuevas nacen con país), spec 080 (la columna).
> Hermano en la web: `sonopolisWeb/specs/w111-logica-cartelera-por-pais.md` + `w113-frontend-selector-de-pais.md`, ambos aplicados.

> **En una frase:** la web ya muestra la cartelera del país de quien mira; la app
> muestra todos los países mezclados, y el día que entre el segundo país eso deja
> de ser invisible para pasar a ser un listado incoherente.

## Contexto

`CarteleraScreen.tsx:18` lee `eventos` del contexto, y `EventosContext.tsx:105` es
`supabase.from('events').select('*')` — sin filtro de ninguna clase.
`LocalesScreen.tsx:26` hace lo mismo con `allVenues`.

Con un solo país en producción eso no se nota: todo es chileno y el listado sale
igual con filtro o sin él. Ese es exactamente el estado en que la web estaba antes
del W-111, y por eso este spec queda **propuesto y sin implementar**: es trabajo
que no arregla nada hoy y que hay que rehacer si el diseño del multipaís cambia
mientras tanto. Se escribe ahora para que el día que entre el segundo país el
trabajo esté decidido y no haya que redescubrirlo.

A diferencia de la web, esta app **no muestra eventos externos**: `external_events`
no aparece en ningún archivo de `src/`. Así que acá son dos consultas, no tres.

## Decisión 1 — AsyncStorage es la cookie de esta app

La web resuelve el país con precedencia cookie → `x-vercel-ip-country` → default
(W-109). En la app no hay cookie ni header de geo, así que:

1. **Elección guardada en AsyncStorage** (`sonopolis_pais`, la misma clave que la
   cookie web, por simetría de nombre). Gana siempre.
2. **`PAIS_POR_DEFECTO`** del spec 095.

Sin paso intermedio de geolocalización: pedirle al usuario el permiso de ubicación
para elegir una cartelera es desproporcionado, y `expo-localization` da la región
*configurada* en el teléfono, que para un chileno de viaje sigue diciendo Chile.
Con el selector a la vista, el default acertado importa menos que en la web —acá
hay una pantalla, no un visitante anónimo que llega de un link y se va.

`PaisContext` expone `{ pais, setPais, listo }`. `listo` existe porque
AsyncStorage es asíncrono: sin él, el primer render consulta con el default y la
cartelera parpadea de un país al otro. Las consultas esperan a `listo`.

## Decisión 2 — el filtro va en el contexto, no en la pantalla

`EventosContext` y `VenuesContext` agregan `.eq('pais', pais)` a su `select`, y
vuelven a cargar cuando `pais` cambia. Las pantallas no filtran nada.

**Por qué en la consulta y no con un `.filter()` sobre lo ya traído:** los contexts
son la única puerta a esas tablas en toda la app —`VentasMusicoScreen`,
`DashboardLocalScreen`, `EquipoEventoScreen` y el resto leen de ahí—, así que
filtrar en una pantalla deja a las otras con el listado completo y la incoherencia
aparece en la pantalla que nadie miró.

⚠️ **Las pantallas privadas no deben filtrarse por país.** "Mis eventos", "mis
ventas" y "mi local" son *lo mío*, no una cartelera: un músico chileno que tocó una
vez en Buenos Aires tiene que seguir viendo ese evento y sus ventas aunque esté
mirando la cartelera de Chile. La web lo resolvió dejando el filtro solo en
`cartelera/page.js` y `locales/page.js` (W-111, Fuera de alcance), pero acá el
contexto es compartido entre las dos cosas, así que hay que separarlo
explícitamente: el contexto expone **dos listas** —`eventos` (del país activo, para
la Cartelera) y `misEventos`/`allEventos` (sin filtrar, para las pantallas
privadas)—, o bien mantiene la consulta sin filtrar y expone `eventosDelPais`
derivado. Cuál de las dos formas se elige es la decisión abierta de este spec y hay
que cerrarla al implementarlo, mirando qué pantalla usa qué.

## Decisión 3 — el mock no tiene país, y eso decide el fallback

`EventosContext.tsx` y `VenuesContext.tsx` caen a `mockEventos`/`mockVenues` cuando
Supabase falla o devuelve vacío (`useMock`). Esos objetos no tienen `pais`.

Filtrar el mock por país lo dejaría en cero y la app se vería vacía justo cuando ya
algo falló — dos problemas encima. **El filtro por país no se aplica al mock:** si
`useMock` está en `true`, se muestra tal cual. El mock ya es un estado degradado
declarado; sumarle un filtro solo lo empeora.

## Decisión 4 — el selector, igual que el chip de la web

Mismo criterio del W-113, Decisión 1: con un solo país en `PAISES` es un texto
informativo con la bandera, sin interacción; con dos o más, abre el selector. El
componente decide por el largo del catálogo, no por una prop — así el día que entre
el segundo país el selector aparece solo.

Va en `CarteleraScreen`, junto al filtro de género, y **no** en el perfil ni en una
pantalla de ajustes: el país acota lo que se está listando, igual que el género.

Esto obliga a traer `PAISES` (el catálogo de países con cartelera, con `nombre`,
`bandera` y `zonaHoraria`) a `src/constants/paises.ts`, que el 095 dejó solo con el
catálogo ISO. Los dos catálogos conviven acá por la misma razón que en la web
(W-114, Decisión 1): responden preguntas distintas.

## Decisión 5 — la lista vacía de un país nombra el país

"Todavía no hay eventos en México" y no un vacío genérico, igual que el W-113,
Decisión 4. Con varios países activos ese mensaje es la diferencia entre "la app
está rota" y "acá todavía no llegamos".

## Criterios de aceptación

- [ ] Con dos países en `PAISES`, la Cartelera muestra solo los del país elegido
- [ ] Cambiar de país en el selector recarga las dos consultas y cambia el listado
- [ ] La elección sobrevive a cerrar y volver a abrir la app
- [ ] Con un solo país en `PAISES`, el selector no es interactivo
- [ ] "Mis eventos", "mis ventas" y "mi local" siguen mostrando lo de todos los
      países (el criterio que más fácil se rompe)
- [ ] Con Supabase caído, el mock se sigue viendo completo, sin filtrar
- [ ] La lista vacía de un país sin eventos lo nombra, y no da error
- [ ] `tsc` limpio y `expo export --platform web` limpio

## Fuera de alcance

- Eventos externos: esta app no los muestra y este spec no los agrega.
- Formatear fecha y hora en el huso del país (`zonaHoraria` queda disponible en
  `PAISES` pero nadie lo consume acá todavía) — es el mismo pendiente que la web
  tiene abierto en `libs/fecha.js`.
- Traducción, moneda o formato de precio por país.
- Geolocalización por IP o por permiso de ubicación (Decisión 1).
