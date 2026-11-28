# Spec 200 — Confirmar y ajustar el pin del local al crear el evento y al editar el local (frontend)

> Estado: propuesto (27-nov-2026)
> Capa: FRONTEND. `src/components/MapaPin.tsx` (nuevo), `src/components/MapaPin.web.tsx` (nuevo), `src/components/UbicacionLocal.tsx` (nuevo), `src/screens/CrearEventoScreen.tsx`, `src/screens/EditarLocalScreen.tsx`.
> Depende de: spec 191 (`buscarUbicacion`, `limitarAlMargen`, `distanciaMetros`, `calleCoincide`, `CENTRO_PAIS`, `puntoDeVenue`, `mensajeErrorBusqueda`, `guardarUbicacionLocal`, `crearDireccion` con `lat`/`lng`), spec 173 (`useEstilos`, `useTema`). `CrearEventoScreen.tsx` también lo tocan 198 y 199, y `EditarLocalScreen.tsx` lo tocan 201 y 206: la cadena los serializa.
> Hermano en la web: `components/UbicacionLocal.js`, `components/MapaPin.js`, `components/FormEvento.js`, `app/(private)/eventos/[id]/editar/page.js` — W-340.

> **En una frase:** al escribir la dirección de un local nuevo en «Nuevo Evento», la app
> muestra dónde va a quedar en el mapa y pide confirmarlo; si el pin quedó mal, se ajusta
> dentro de 150 m o se pone a mano. El dueño puede hacer lo mismo con su local desde
> «Editar local».

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después
de esta orquestación.» La web ya exige confirmar el pin al crear un local desde el evento
(W-340). En la app un local nuevo nace sin coordenadas y no aparece en el mapa; y un pin
equivocado (Quintal Clandesta) no lo puede arreglar nadie desde la app.

## Decisión

### Por qué `MapaPin` + `MapaPin.web` y no `UbicacionLocal.web.tsx`

El mapeo proponía `UbicacionLocal.tsx` con una variante `.web.tsx`, como `MapaLocales`. Se
aísla solo el mapa: `react-native-maps` no tiene implementación web y basta importarlo para
romper el bundle (spec 127), pero toda la máquina de estados (buscar, ¿es aquí?, otra calle,
ajustar, confirmar) es la misma en las tres plataformas. Con dos archivos de
`UbicacionLocal` habría que mantenerla duplicada. Además Android sin clave de Google Maps
tampoco puede montar el mapa (`mapaDisponible()` falso, `src/lib/mapa.ts`) y necesita el
mismo camino sin mapa que la web: un solo componente que pregunta `mapaDisponible()` cubre
los dos casos.

### `src/components/MapaPin.tsx` (nuevo) y `MapaPin.web.tsx` (nuevo)

```ts
export interface PropsMapaPin {
  centro: Punto;                         // encuadre inicial
  pin: Punto | null;
  tipo?: VenueType | null;               // color del pin
  circulo?: { centro: Punto; metros: number } | null;
  puntoDelMapa?: Punto | null;           // marca del punto que encontró la búsqueda
  editable?: boolean;                    // arrastrar el pin y tocar el mapa para ponerlo
  onCambiarPin?: (p: Punto) => void;
  style?: StyleProp<ViewStyle>;
}
```

- Nativo: `MapView` de `react-native-maps` con `initialRegion` en `centro` y deltas de
  `0.004` (≈ una cuadra a cada lado). El pin es un `Marker` con
  `pinColor={COLOR_TIPO_LOCAL[tipo]}` (o `paletaClara.primary` sin tipo), `draggable` si
  `editable`, y `onDragEnd` → `onCambiarPin`. Con `editable`, `onPress` del mapa también
  llama `onCambiarPin` con la coordenada tocada (así se pone el pin «a mano»). El círculo
  es un `Circle` de `circulo.metros` con `strokeColor={paletaClara.accent}`,
  `fillColor="transparent"` y `lineDashPattern={[6, 6]}`. La marca del punto del mapa es un
  `Marker` chico con `pinColor={paletaClara.muted}`. Colores de la paleta clara en los dos
  temas, como `MapaLocales` (spec 176: las teselas son claras siempre).
- `MapaPin.web.tsx`: devuelve `null`, como `MapaLocales.web.tsx`.

### `src/components/UbicacionLocal.tsx` (nuevo)

```ts
interface Props {
  direccion: string;
  comuna?: string | null;
  pais?: string | null;
  nombre: string;                     // del local, para el aviso de solo lectura
  tipo?: VenueType | null;
  valor: Punto | null;                // la ubicación confirmada (local nuevo) o guardada
  puedeMover: boolean;
  modo: 'crear' | 'editar';
  onConfirmar: (punto: Punto | null) => void | Promise<void>;  // null solo «sin pin» (ver abajo)
  buscarAl?: number;                  // local NUEVO: cada cambio de este número busca
  onCorregir?: () => void;            // en crear, lleva el foco al campo Dirección
}
```

`buscarAl` presente = local nuevo; ausente = local que ya existe (busca recién al pedir el
ajuste). Estilos con `useEstilos` y `useTema`; avisos con `highlightBg`/`highlightBorder`/
`highlightText` (pregunta), `dangerBg`/`dangerText` (error) y `successBg`/`success`
(confirmada). Nada de hex nuevos.

Estados y textos, literales de W-340 salvo donde se indica:

1. **Sin dirección** (local nuevo): «Escribe la dirección para ubicar el local».
2. **Sin buscar o desactualizada** (la dirección cambió desde la última búsqueda): «Sal del
   campo para ubicar la dirección en el mapa» y botón «Buscar en el mapa».
3. **Buscando**: `ActivityIndicator` y «Buscando la dirección en el mapa…». Una búsqueda
   vieja que llega tarde se descarta (contador de búsqueda, como el `ticketRef` de la web).
4. **¿Es aquí?** (`encontrado` y `coincide`): mapa con el pin (`MapaPin`, alto 190), aviso
   «¿Es aquí?» con «Así va a aparecer en el mapa de Sonópolis. Si el pin no quedó en la
   entrada, ajústalo.» y los botones «Sí, es aquí» (confirma `punto`) y «Ajustar pin».
5. **Otra calle** (`coincide === false`): mapa con el pin encontrado (o `valor`), aviso
   «Buscamos «{direccion}» y el mapa encontró «{calle}»» con «El mapa no conoce esa calle.
   Pon el pin tú: arrástralo hasta la entrada del local.», botón «Ubicar a mano» y, en
   crear, «Corregir» (`onCorregir`).
6. **No encontrada**: «No encontramos «{direccion}» en {comuna}» (sin « en …» si no hay
   comuna) con «Revisa la calle y el número. Escribe la calle completa (por ejemplo «Calle
   124») o una esquina cercana.», botones «Buscar de nuevo» y «Ubicar a mano».
   **Error de búsqueda**: título `mensajeErrorBusqueda(error)` con «Intenta de nuevo o
   ubica el pin a mano.» y los mismos dos botones.
7. **Ajustando** (desde «Ajustar pin»): `Modal` a pantalla completa (`animationType="slide"`)
   con `MapaPin` editable que ocupa el alto disponible, el círculo de `MARGEN_PIN_METROS`
   alrededor del punto del mapa y la marca de ese punto. Arriba, aviso «Mueve el pin a la
   entrada» con «Arrástralo dentro del círculo: hasta 150 m del punto que encontró el mapa.
   La dirección no cambia.» Al soltar, el pin pasa por `limitarAlMargen`; si quedó afuera,
   vuelve al borde y sale el aviso de error «El pin solo se mueve hasta 150 m» con «Si el
   local está más lejos, el mapa se equivocó de lugar: corrige la dirección o ubica el pin
   a mano.» (sin «corrige la dirección o» en editar) y los enlaces «Corregir dirección» (solo
   en crear; cierra el modal y llama `onCorregir`) y «Ubicar a mano». Abajo: «Pin a {N} m del
   punto del mapa · la dirección no cambia» (`Math.round(distanciaMetros)`), el enlace
   «¿Quedó muy lejos? Ubícalo a mano», y los botones «Volver al punto» y «Listo»
   («Guardando…» mientras guarda).
   **Por qué un `Modal`:** arrastrar un marcador dentro del `ScrollView` del formulario
   pelea con el gesto de desplazamiento; en el modal el mapa tiene todos los gestos (la web
   también usa una hoja a pantalla completa en el celular).
8. **A mano**: el mismo modal sin círculo, con «Toca el mapa para poner el pin y arrástralo
   hasta la entrada. Aquí no hay margen. La dirección no cambia.» y «Ubicado a mano · la
   dirección no cambia» (o «Todavía no hay pin»). Centro: `valor`, si no el punto
   encontrado, si no el centro de la comuna (una `buscarUbicacion({ direccion: comuna, pais })`;
   si falla, se queda el del país) y si no `CENTRO_PAIS[pais] ?? CENTRO_PAIS.CL`.
   «Listo» deshabilitado sin pin.
9. **Confirmada**: «✓ Ubicación confirmada» y el enlace «Cambiar» (vuelve al estado 4 o al 2).
   En editar, tras guardar: «Ubicación guardada».
10. **Sin permiso para mover** (`puedeMover` falso): el mapa con `valor` (o «Sin ubicación
    todavía») y el aviso «La ubicación la confirma el local» con «Si el pin está mal,
    avísale a {nombre}: lo puede mover desde la edición del evento o su perfil.»
11. **Local que ya existe, sin pedir ajuste** (`buscarAl` ausente): el mapa con `valor` (o
    «Sin ubicación todavía») y el botón «Ajustar pin», que busca la dirección actual: si se
    encuentra y la calle coincide, pasa a «Ajustando» alrededor de ese punto; si no, muestra
    el estado 5 o 6 con «Ubicar a mano» (así se arregla Quintal Clandesta).

**Sin mapa** (`mapaDisponible()` falso: build web o Android sin clave), desviación de la web:
no hay mapa que arrastrar, así que los estados 4–8 no muestran mapa ni ofrecen «Ajustar pin»
ni «Ubicar a mano». El estado 4 dice «El mapa ubicó «{calle}». Así va a aparecer en el mapa
de Sonópolis.» con «Sí, es aquí». En 5 y 6 (y en el error), en vez de «Ubicar a mano» hay un
botón «Continuar sin ubicación» (`onConfirmar(null)`) con el texto «El local se crea sin
pin. Su dueño lo puede ubicar después desde Editar local en el celular.» Así crear un local
nuevo no queda bloqueado donde el mapa no se puede dibujar. En editar sin mapa, el bloque
muestra solo «Para mover el pin, abre Sonópolis en el celular.»

### `src/screens/CrearEventoScreen.tsx`

**Local nuevo** (subformulario de `creandoLocal`):

- Estado nuevo: `ubicacion: Punto | null`, `ubicacionResuelta: boolean` (confirmada, o
  «Continuar sin ubicación» sin mapa) y `buscarUbicacionAl: number`.
- `UbicacionLocal` va al final del subformulario del local nuevo, después de «Instagram
  (opcional)» (si el spec 199 ya sumó el correo del local, va **antes** de ese campo, como
  en la web). Props: `direccion={nuevaDireccion}`, `comuna={nuevaComuna}`,
  `pais={paisNuevoVenue}`, `nombre={nuevoNombre}`, `tipo={nuevoTipo}`, `valor={ubicacion}`,
  `puedeMover`, `modo="crear"`, `buscarAl={buscarUbicacionAl}`, `onCorregir` (foco al
  `TextInput` de Dirección con un `ref`) y `onConfirmar={(p) => { setUbicacion(p); setUbicacionResuelta(true); }}`.
- Los `TextInput` de Dirección y Comuna suman `onBlur={() => setBuscarUbicacionAl((n) => n + 1)}`.
  Nunca se busca en cada tecla (Nominatim pide 1 consulta por segundo).
- Cambiar Dirección, Comuna o País borra la confirmación (`ubicacion = null`,
  `ubicacionResuelta = false`). Cancelar el local nuevo también.
- `validar()` suma, para el local nuevo y antes de la fecha: sin `ubicacionResuelta` →
  «Confirma la ubicación del local para crear el evento». Bajo el botón «Publicar», con el
  local nuevo sin confirmar, el mismo texto en `muted` (el botón no se deshabilita: el error
  ya sale en el `Text` rojo de `validar`, que es el patrón de la pantalla).
- `handlePublicar`: `createVenue({ …, lat: ubicacion?.lat, lng: ubicacion?.lng })` solo si
  hay `ubicacion`, y `crearDireccion(venue.id, { address, comuna, lat, lng })` con el mismo
  pin (spec 191: la fila nace con el pin y el trigger lo copia a `venues`).

**Local elegido de la lista** (`selectedVenue`):

- Con `puntoDeVenue(selectedVenue)` o siendo su dueño, bajo el «✅ {local}» se ve
  `UbicacionLocal` sin `buscarAl` (`modo="crear"`, `valor={puntoDeVenue(selectedVenue)}`).
- `puedeMover = selectedVenue.ownerId === user?.id`. Al confirmar llama
  `guardarUbicacionLocal(selectedVenue.id, p)`; un error se muestra en `dangerText` dentro
  del bloque (el `message` del error).
- No es el dueño y el local no tiene pin: no se muestra el bloque (no hay nada que ver).
- Un local de la lista no exige confirmar ubicación para publicar.

### `src/screens/EditarLocalScreen.tsx`

- Solo con `miVenue` (local que ya existe), en la tarjeta «Dirección», debajo de
  `GestionDirecciones`: subtítulo «Ubicación en el mapa» (estilo `label`) y
  `UbicacionLocal` con `direccion={miVenue.address ?? ''}`, `comuna={miVenue.comuna}`,
  `pais={miVenue.pais}`, `nombre={miVenue.name}`, `tipo={miVenue.type}`,
  `valor={puntoDeVenue(miVenue)}`, `puedeMover={miVenue.ownerId === user?.id}`,
  `modo="editar"` y `onConfirmar` → `guardarUbicacionLocal(miVenue.id, p)`.
- Guardar el pin es independiente del botón «Guardar» del formulario: queda guardado al
  tocar «Listo» o «Sí, es aquí».
- Al registrar un local nuevo desde esta pantalla (sin `miVenue`) no se pide pin: se ubica
  después, ya creado. La exigencia de confirmar es solo de «Nuevo Evento», como en la web.

### Lo que NO cambia

- `MapaLocales`, `DetalleLocalScreen` y el resto de los dos formularios.
- La dirección escrita no se edita desde el bloque del pin.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `npx expo export --platform web` termina sin errores (prueba que `react-native-maps` no
   entró al bundle web).
3. `grep -n "react-native-maps" src/components/UbicacionLocal.tsx src/screens/CrearEventoScreen.tsx src/screens/EditarLocalScreen.tsx`
   no devuelve nada (solo `MapaPin.tsx` lo importa).
4. `grep -n "Confirma la ubicación del local para crear el evento" src/screens/CrearEventoScreen.tsx`
   devuelve al menos una línea.
5. Ningún hex nuevo en los archivos tocados (`git diff` sin `#[0-9a-fA-F]{3,6}` agregado).
6. Lectura del código: ningún `onChangeText` llama a `buscarUbicacion`.
7. `git diff --stat` del commit toca solo los cinco archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- iPhone: crear un evento con local nuevo, «¿Es aquí?», «Sí, es aquí»; el local aparece en
  el mapa de Locales en ese punto.
- Android con clave: «Ajustar pin», arrastrar fuera del círculo → vuelve al borde y sale
  «El pin solo se mueve hasta 150 m»; «Ubicar a mano» y tocar el mapa pone el pin.
- «calle 124 #1040», Peñalolén → «Buscamos «calle 124 #1040» y el mapa encontró «…»».
- Dueño de Quintal Clandesta en «Editar local» → «Ajustar pin» → «Ubicar a mano» → guardar;
  activar después la misma dirección no borra el pin.
- Build web: crear con «Continuar sin ubicación» funciona y el local queda sin pin.

## Fuera de alcance

- El bloque «Dónde» en `EditarEventoScreen` de la web (lo tocan 199 y 206; el dueño ajusta
  desde «Editar local» o al elegir su local en «Nuevo Evento»).
- Geocodificar al agregar o activar direcciones en `GestionDirecciones`.
