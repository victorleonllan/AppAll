# Spec 095 — La app móvil manda el país al crear local y evento

> Estado: propuesto (21-sep-2026) — **cierra una rotura viva en producción**
> Capa: FRONTEND. `src/constants/paises.ts` (nuevo), `src/context/VenuesContext.tsx`, `src/context/EventosContext.tsx`, `src/screens/EditarLocalScreen.tsx`, `src/screens/CrearEventoScreen.tsx`, `src/types/index.ts`.
> Depende de: spec 080 (`pais` en `events`/`venues`, **ya aplicado en producción**).
> Hermano en la web: `sonopolisWeb/specs/w114-frontend-crear-eligiendo-pais.md`, ya aplicado.

> **En una frase:** desde que la migración del 080 se aplicó, crear un local o un
> evento **desde la app móvil falla** con `23502`, y el W-114 no lo arregla porque
> es frontend de la web — son dos clientes distintos contra la misma tabla.

## El problema

El spec 080 dejó `events.pais` y `venues.pais` `NOT NULL` sin `DEFAULT`, a
propósito: un `INSERT` que se olvide del país debe fallar fuerte en vez de asumir
Chile en silencio. Su tercera addenda (8-sep-2026) registra que la migración se
aplicó **antes** de que existiera el frontend que manda el país, decisión explícita
de Victor, con la ventana de rotura aceptada.

La web cerró su mitad con el W-114. Esta app no: `grep -rn "pais" src/` sigue
devolviendo cero. Los dos `insert` a esas tablas —`mapVenueToDB`
(`VenuesContext.tsx:51`) y `mapEventoToDB` (`EventosContext.tsx:62`)— no mandan la
columna, así que hoy:

- `EditarLocalScreen.tsx:106` — dar de alta un local **falla**.
- `CrearEventoScreen.tsx:106` y `:130` — crear el local al vuelo **falla**, y con él
  la publicación del evento entera.
- `EventosContext.tsx:159` — crear el evento **falla**.

Editar lo ya creado, leer la cartelera, comprar y canjear no tocan la columna y
siguen funcionando.

## Decisión 1 — selector de país, igual que en la web, y no una constante

La tentación es estampar `'CL'` en los dos mappers y terminar en dos líneas. Eso
reabre exactamente el bug que el 080 vino a cerrar: Chile hardcodeado en un cuarto
lugar, ahora en el cliente móvil, donde nadie lo va a encontrar.

El W-114 ya resolvió esta pregunta para la web y su razón vale igual acá: un músico
chileno que va a tocar a Buenos Aires carga el evento **desde Chile**, y si el país
se deduce de dónde está quien carga, el bar argentino queda marcado como chileno,
contamina la cartelera de Chile y falta para siempre en la de Argentina. No hace
falta un segundo país en el catálogo para disparar esto: hace falta un músico que
cruce una frontera.

## Decisión 2 — el catálogo ISO se copia, no se comparte

`src/constants/paises.ts` replica lo que `sonopolisWeb/libs/paisesISO.js` hace:
la lista de códigos ISO 3166-1 alpha-2, más `nombrePais`, `banderaPais` y
`etiquetaPais` derivados del código con `Intl.DisplayNames` y los *regional
indicator symbols*.

**Por qué copiar y no extraer un paquete compartido:** los dos repos no comparten
build ni `node_modules`, y montar un paquete común para 250 strings y tres funciones
de una línea cuesta más que la duplicación. El dato es un estándar ISO que no cambia
por decisión nuestra, así que las dos copias no pueden divergir por descuido — lo
único que podría divergir es el orden del desplegable, que es cosmético.

Se copia el catálogo **ISO** (dónde se puede crear), no `PAISES` (dónde hay
cartelera). Ese segundo catálogo llega en el spec 096, que es el que lo necesita.

⚠️ `Intl.DisplayNames` **no está garantizado en Hermes**, el motor de JS de React
Native: con `jsc` o con un Hermes compilado sin ICU completo, `nombres.of("AR")`
puede devolver `"AR"` en vez de `"Argentina"`. Hay que verificarlo en dispositivo
antes de cerrar el spec (criterio de aceptación abajo). Si falla, la salida es
`expo-localization` (que trae ICU) o una tabla de nombres en español escrita a mano
— en ese orden. `banderaPais` no corre ese riesgo: es aritmética de code points.

## Decisión 3 — el valor inicial es el país por defecto, sin dependencia nueva

En la web el selector se presugiere con `getPaisActivo()`, que lee la cookie y el
header `x-vercel-ip-country`. En la app no existe ninguno de los dos.

El equivalente móvil sería `expo-localization` (`getLocales()[0].regionCode`, la
región configurada en el dispositivo). **Se descarta por ahora:** es un módulo
nativo, así que agregarlo obliga a un build nuevo y a que ese build llegue al
dispositivo —el mismo costo de distribución que hace urgente este spec— a cambio de
un valor presugerido que el selector ya deja corregir en un toque. Queda anotado
como la mejora natural el día que haya otro motivo para rebuildear.

Entonces: `PAIS_POR_DEFECTO = 'CL'`, exportado desde `src/constants/paises.ts`, como
valor inicial del selector. Es Chile hardcodeado, sí, pero **en un solo lugar,
nombrado y visible en pantalla** — que es la diferencia con el problema de arriba.

## Decisión 4 — el evento copia el país de su local

Igual que el W-114, Decisión 3. `CrearEventoScreen` siempre termina con un venue
—si no hay elegido, crea uno (`:130`)— así que el país del evento sale de
`venue.pais` y la pantalla de evento **no** suma un campo propio.

Los dos puntos donde la pantalla crea un venue al vuelo (`:106` y `:130`) mandan el
país elegido en el selector. El `:130` es el más delicado: crea un local llamado
`"Sin nombre"` sin que el músico lo note, y hoy es el que revienta la publicación.

## Decisión 5 — equivocarse es reversible

Como en el W-114, Decisión 5:

- `mapVenueToDB` suma `if ('pais' in venue) out.pais = venue.pais;` — entra al
  insert y también al update, porque `updateVenue` (`VenuesContext.tsx:133`) usa el
  mismo mapper. `pais` es propiedad del venue, no de su dirección.
- `EditarLocalScreen` muestra el selector con el país actual al editar.
- `mapEventoToDB` suma `pais: evento.pais`. El `mapEventoCambiosToDB` de esta app
  —el objeto `cambiosDB` de `EventosContext.tsx:207`— suma `pais` con el mismo
  patrón que el resto de sus campos, para que `EditarEventoScreen` pueda corregir un
  evento mal marcado: `events.pais` es una copia denormalizada (spec 080), así que
  arreglar el local no arrastra los eventos ya creados.
- `Venue` y `Evento` en `src/types/index.ts` suman `pais: string`.

## Criterios de aceptación

- [ ] Crear un local desde `EditarLocalScreen` guarda el país elegido, sin `23502`
- [ ] Crear un evento con local existente hereda el `pais` de ese local
- [ ] Crear un evento que crea su local al vuelo (los dos caminos, `:106` y `:130`)
      deja los dos con el país elegido
- [ ] Editar un local y cambiarle el país lo guarda; editar otro campo no lo toca
- [ ] Editar un evento y cambiarle el país lo guarda
- [ ] **En dispositivo real** (no en web), `nombrePais("AR")` devuelve `"Argentina"`
      y no `"AR"` — si devuelve el código, aplica la salida de la Decisión 2
- [ ] `banderaPais("CL")` devuelve 🇨🇱
- [ ] `tsc` limpio y `expo export --platform web` limpio

## Fuera de alcance

- **Filtrar por país lo que la app muestra** — spec 096. Este spec solo cierra la
  rotura de escritura; hasta el 096, la app sigue mostrando todos los países juntos,
  que es lo que hace hoy y no empeora con esto.
- `PAISES` (el catálogo de países con cartelera) y cualquier noción de "país activo"
  en la app: los trae el 096, que es quien los usa.
- `expo-localization` para presugerir el país del dispositivo (Decisión 3).
- Corregir el país de las filas creadas antes de este spec — todo lo que hay hoy en
  producción es chileno y quedó en `'CL'` por el backfill del 080.
- `comuna`/`ciudad` siguen siendo campos de texto libre con placeholder chileno
  ("Santiago", "Ñuñoa"). Normalizar la división administrativa por país es su propio
  spec y necesita ver dos países reales antes de decidirse.
