# Spec 202 — Perfiles: próximos eventos, evento en cartelera sobre el muro y «Cómo llegar» (frontend)

> Estado: aplicado (28-nov-2026) — `tsc` limpio fuera de `supabase/functions`, export web sin errores y criterios 3-7 (grep y diff) cumplidos; sin probar en navegador ni en dispositivo (V 202-a a 202-d)
> Capa: FRONTEND. `src/components/Muro.tsx`, `src/screens/VerMusicoScreen.tsx`, `src/screens/DetalleLocalScreen.tsx`.
> Depende de: spec 193 (`useProximosEventos`, `bloqueFecha`, `lineaEvento`, `cuandoCorto`, `quitarEventoDelMuro`, `redesDelPerfil`, `enlacesComoLlegar`), spec 187 (`Muro`), spec 173 (`useEstilos`, `useTema`). `VerMusicoScreen.tsx` también lo toca 201: la cadena los serializa.
> Hermano en la web: `components/EventoEnCartelera.js`, `components/Muro.js` (W-309); `components/perfil/ListaProximosEventos.js`, `components/perfil/GrillaRedes.js` y la hoja «Cómo llegar» de `app/(marketing)/locales/[id]/page.js` (W-317 a W-319, que consumen W-316).

> **En una frase:** la ficha de una banda muestra sus próximos eventos y sus redes juntas,
> el muro de la banda y del local destaca arriba el evento que está en cartelera, y «Cómo
> llegar» del local deja elegir entre Google Maps, Waze y Mapas de Apple.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después
de esta orquestación.» Y el pedido de origen de W-308/W-309 (19-nov-2026): «necesito que
destaques el evento actual en el muro de local y banda. con algun mensaje de que esta
actualmente en cartelera y se viene a futuro». Hoy en la app `VerMusicoScreen` no muestra
ningún evento futuro, el muro (spec 187) solo trae lo pasado y «Cómo llegar»
(`src/screens/DetalleLocalScreen.tsx:64`, `:117`) abre siempre Google Maps.

## Decisión

### Supuesto: la app llega al punto W-309 + W-316, no al rediseño W-317..W-319

El mapeo deja fuera el rediseño de las fichas (W-317 a W-319, «no aplica»). En ese
rediseño la web movió el sello «En cartelera» al primer evento de «Próximo show» y dejó de
pasar el destacado al muro. Sin el rediseño, la app hace lo de W-309 (tarjeta destacada
arriba del muro, que es lo que pidió Victor) y usa las funciones de W-316 (próximos
eventos, redes, cómo llegar) en las pantallas que ya tiene. En la ficha de la banda el
evento más próximo aparece dos veces —en «Próximos eventos» arriba y destacado sobre el
muro abajo—: se acepta, porque la lista es la agenda y la tarjeta del muro es el aviso
«en cartelera» que se pidió para el muro.

### `src/components/Muro.tsx`

Props nuevas, opcionales (sin ellas el muro se ve como hoy):

```ts
destacado?: Evento | null;            // el próximo evento en cartelera
onVerEvento?: (eventoId: string) => void;
```

- Con `destacado`, el muro pasa sus entradas por `quitarEventoDelMuro(entradas, destacado.id)`
  antes de dibujarlas (un evento de hoy que ya empezó vuelve como pasado y saldría dos veces).
- Entre el título «Muro» y las entradas va la tarjeta destacada (W-309), que se dibuja aunque
  el muro esté cargando, haya fallado o esté vacío (el texto de «todavía no tiene
  publicaciones» se mantiene debajo):
  - Fondo `highlightBg`, borde `highlightBorder`, radio `borderRadius.lg`, para que se
    distinga de las entradas.
  - Sello «● En cartelera · {cuandoCorto(destacado.comienzaAt, new Date())}» en
    `highlightText`, negrita, `fontSize.sm`. Si `comienzaAt` es nulo, solo «● En cartelera».
  - Título: `destacado.artista` en negrita. Debajo, `destacado.venueName` solo cuando
    `tipo === 'musician'` (en el muro del local sobra: es el mismo local).
  - `lineaEvento(destacado)` en `secondary`.
  - El flyer si `destacado.imagen` existe, con el mismo estilo `flyer` de las entradas y
    `accessibilityLabel="Flyer de {artista}"`.
  - Botón «Ver evento» (fondo `accent`, texto `onAccent`) que llama `onVerEvento(destacado.id)`;
    sin `onVerEvento`, no se dibuja.
  - Sin comentarios: `muro_comentar` solo acepta eventos pasados (spec 185).

### `src/screens/VerMusicoScreen.tsx`

- `const proximos = useProximosEventos('musician', musico?.id, 3)` (el hook se llama siempre,
  antes de los `return` tempranos, con `musico?.id`).
- `verEvento(id)`: el mismo patrón de `DetalleLocalScreen`,
  `navigation.getParent<NavigationProp<RootTabParamList>>()?.navigate('Cartelera', { screen: 'DetalleEvento', params: { eventoId: id } })`
  (`VerMusico` vive en `LocalesStack` y `MiLocalStack`, los dos dentro del tab).
- **«Próximos eventos»**, nueva tarjeta entre la tarjeta del perfil y el muro, con el estilo
  de título de sección del muro:
  - Cargando: `ActivityIndicator`. Error (`eventos === null` sin cargar): no se dibuja la
    sección (W-308 §3: un destacado faltante no engaña; un «sin eventos» falso sí).
  - Lista vacía: no se dibuja la sección.
  - Cada evento es una fila tocable → `verEvento(e.id)`: a la izquierda el bloque de fecha
    (`bloqueFecha(e.comienzaAt)`: `dia` arriba en `fontSize.xs`, `num` grande en negrita,
    `mes` abajo; fondo `highlightBg`, borde `highlightBorder`, texto `highlightText`); sin
    bloque si es `null`. A la derecha `e.artista` en negrita, `e.venueName` en `secondary`
    y `lineaEvento(e)` en `muted`; al final «›» en `muted`.
- **Redes juntas**: los cinco enlaces sueltos (Instagram, Spotify, YouTube, TikTok, sitio
  web) pasan a una fila «Redes» con una píldora por cada `redesDelPerfil(musico, 'musician')`
  (borde `border`, texto `accent`, `Linking.openURL(red.href)`). Teléfono y correo siguen
  como hoy. Arregla de paso un Instagram cargado como URL completa, que hoy arma
  `instagram.com/https://…`.
- `Muro` recibe `destacado={proximos.eventos?.[0] ?? null}` y `onVerEvento={verEvento}`.

### `src/screens/DetalleLocalScreen.tsx`

- `const destacado = useProximosEventos('venue', venue?.id, 1)` (antes de los `return`
  tempranos). `Muro` recibe `destacado={destacado.eventos?.[0] ?? null}` y
  `onVerEvento={verEvento}` (la función que ya existe). «Próximas fechas» no cambia.
- **«Cómo llegar»**: `urlComoLlegar` se reemplaza por `enlacesComoLlegar(venue)`. Con
  `null`, no hay botón (como hoy). El botón «Cómo llegar» (mismo estilo `boton`) abre una
  hoja inferior: `Modal` transparente con `animationType="slide"`, fondo de pantalla
  atenuado con `colores.block` y `opacity: 0.5` (sin hex), y la hoja en `cardBackground`
  anclada abajo, radio superior `borderRadius.lg`. Textos de W-319:
  - Título «Cómo llegar a {venue.name}».
  - `enlaces.direccion` en `secondary`, con `selectable` (sustituye a «Copiar dirección»,
    que necesitaría `expo-clipboard`, dependencia nativa nueva).
  - Filas tocables, cada una con nombre en negrita, detalle en `muted` y «↗» al final:
    «Google Maps» — «Ruta desde donde estás» → `enlaces.google`; «Waze» — «Si lo tienes
    instalado» → `enlaces.waze`; «Mapas de Apple» — «Solo en iPhone» → `enlaces.apple`,
    solo si `Platform.OS === 'ios'`.
  - Tocar una fila abre el enlace con `Linking.openURL` y cierra la hoja. Botón «Cancelar»
    y tocar el fondo atenuado también la cierran.
  - Sin los cuadrados de color de marca de la web (`#34A853`, `#33CCFF`): en la app no se
    agregan hex.
- El import de `urlComoLlegar` sale de esta pantalla; `src/lib/mapa.ts` no se toca.

### Lo que NO cambia

- `useMuro`, los comentarios y la moderación del muro; `useEventosDelLocal` y «Próximas
  fechas»; el mapa de la ficha del local; el resto de las dos pantallas.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `npx expo export --platform web` termina sin errores.
3. `grep -n "En cartelera" src/components/Muro.tsx` y `grep -n "Próximos eventos" src/screens/VerMusicoScreen.tsx`
   devuelven al menos una línea cada uno.
4. `grep -n "urlComoLlegar" src/screens/DetalleLocalScreen.tsx` no devuelve nada y
   `grep -n "Si lo tienes instalado" src/screens/DetalleLocalScreen.tsx` devuelve una línea.
5. `grep -n "quitarEventoDelMuro" src/components/Muro.tsx` devuelve al menos una línea.
6. Ningún hex nuevo en los archivos tocados (`git diff` sin `#[0-9a-fA-F]{3,6}` agregado).
7. `git diff --stat` del commit toca solo los tres archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Ficha de una banda con eventos futuros (también uno donde es banda adicional): se ven en
  «Próximos eventos» con el bloque de fecha y el más próximo destacado sobre el muro con
  «● En cartelera · …»; tocar «Ver evento» abre la ficha del evento.
- Ficha de un local con un evento hoy que ya empezó: aparece destacado y no se repite como
  flyer en el muro.
- iPhone: «Cómo llegar» muestra las tres opciones; Android y web, sin «Mapas de Apple»; Waze
  abre la app si está instalada.
- Una banda sin eventos futuros: no aparecen ni la sección ni la tarjeta destacada.

## Fuera de alcance

- El rediseño de las fichas (W-317 a W-319): portada y avatar, tarjetas por sección,
  «Comprar entrada» en el primer evento.
- «Copiar dirección» (necesita `expo-clipboard`).
