# Spec 201 — Respetar el punto de la portada y «Ajustar portada» (frontend)

> Estado: aplicado (28-nov-2026) — `tsc` limpio fuera de `supabase/functions` y export web sin errores; criterios 3-7 revisados (ver addenda sobre el 3). Sin probar en navegador ni en dispositivo (V 201-a…201-e)
> Capa: FRONTEND. `src/components/PortadaEncuadrada.tsx` (nuevo), `src/components/AjustarPortada.tsx` (nuevo), `src/screens/VerMusicoScreen.tsx`, `src/screens/DirectorioMusicosScreen.tsx`, `src/screens/EditarPerfilBandaScreen.tsx`, `src/screens/EditarLocalScreen.tsx`.
> Depende de: spec 192 (`PuntoPortada`, `PUNTO_CENTRO`, `esCentro`, `encuadreCover`, `puntoTrasArrastre`, `hayQueAjustar`, `puntoDeFila`, `leerPuntoPortadaLocal`, `guardarPuntoPortadaMusico`, `guardarPuntoPortadaLocal`, `PerfilConPortada`), spec 173 (`useEstilos`, `useTema`). `VerMusicoScreen.tsx` también lo toca 202, y `EditarLocalScreen.tsx` lo tocan 200 y 206: la cadena los serializa.
> Hermano en la web: `components/perfil/EncabezadoPerfil.js`, `components/perfil/AjustarPortada.js` — W-346.

> **En una frase:** la ficha del músico y el directorio dibujan la portada con el punto que
> eligió su dueño, y el músico y el local pueden ajustarlo desde su pantalla de edición
> arrastrando la foto.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después
de esta orquestación.» En la web el dueño ya elige qué parte de su portada se ve (W-346); en
la app la foto sigue centrada (`src/screens/VerMusicoScreen.tsx:134`,
`src/screens/DirectorioMusicosScreen.tsx:125`), así que a Felio Saud la ficha de la app le
sigue cortando la cabeza aunque lo haya ajustado en la web.

## Decisión

### Cálculo a mano, no `expo-image`

`Image` de React Native no tiene `object-position`. Había dos caminos:

- **`expo-image`** con `contentFit="cover"` y `contentPosition`: el código de dibujo es más
  corto, pero es una **dependencia nativa nueva**. Obliga a un build nuevo del binario
  (un cliente de desarrollo o un binario viejo sin el módulo se cierra al abrir la ficha),
  a tocar `package.json` y `package-lock.json` en un spec de pantallas, y aun así el
  arrastre necesita el tamaño natural de la foto y el del marco.
- **Cálculo a mano** (elegido): `encuadreCover` (spec 192, función pura probada con node)
  da el tamaño y el desplazamiento; la foto se dibuja con posición absoluta dentro de una
  vista con `overflow: 'hidden'`. Sin dependencias nuevas, igual en iOS, Android y web, y la
  misma matemática que usa el arrastre (`puntoTrasArrastre` es su inversa).

El costo del cálculo a mano es pedir el tamaño natural con `Image.getSize`. Para no pagarlo
de más, con el punto en el centro se dibuja como hoy (`resizeMode="cover"`, que ya centra) y
no se llama a `getSize`: la gran mayoría de los perfiles no tiene punto propio.

### `src/components/PortadaEncuadrada.tsx` (nuevo)

```ts
interface Props {
  uri: string;
  punto: PuntoPortada;
  style?: StyleProp<ViewStyle>;     // tamaño, aspectRatio, bordes y margen del marco
  accessibilityLabel?: string;
}
```

- Un `View` con `style` y `overflow: 'hidden'`; `onLayout` guarda el marco.
- `esCentro(punto)`: un `Image` con `StyleSheet.absoluteFill` y `resizeMode="cover"`.
- Si no: `Image.getSize(uri)` (una vez por `uri`) guarda el tamaño natural; con marco y
  tamaño, el `Image` va con `position: 'absolute'` y `{ width, height, left, top }` de
  `encuadreCover`. Mientras no hay tamaño, o si `getSize` falla, se dibuja centrado con
  `cover` (lo de hoy): nunca un hueco.
- Si cambia `uri` antes de que llegue el `getSize` viejo, la respuesta vieja se descarta.

### `src/components/AjustarPortada.tsx` (nuevo)

`Modal` a pantalla completa (`animationType="slide"`, fondo `background`) para arrastrar la
foto. **Por qué un `Modal`:** arrastrar dentro del `ScrollView` de la pantalla de edición
pelea con el desplazamiento; en el modal el gesto es solo de la foto.

```ts
interface Props {
  visible: boolean;
  uri: string;
  puntoInicial: PuntoPortada;
  proporcion: number;                         // ancho / alto del marco de la ficha
  onGuardar: (p: PuntoPortada) => Promise<void>;
  onCerrar: () => void;
}
```

- Título «Ajustar portada». Un marco de ancho completo con `aspectRatio={proporcion}` que
  dibuja la foto con `encuadreCover` y el punto en vivo.
- Arrastre con `PanResponder` (de `react-native`, sin dependencias): al empezar guarda el
  punto; en cada movimiento, `puntoTrasArrastre({ punto: alEmpezar, delta: { dx, dy }, marco, imagen })`.
- Guía de tercios sobre la foto: dos líneas verticales y dos horizontales de 1 px en
  `colores.white` con `opacity: 0.6`, `pointerEvents="none"`.
- Instrucción bajo el marco: «Arrastra para mover la foto». Debajo, en `muted`: «En el
  computador se ve más ancho, con este mismo punto al centro.» (textos de W-346).
- Si `hayQueAjustar` es falso (la foto ya calza justo): «Esta foto ya se ve completa en la
  ficha: no hay nada que ajustar.» y solo el botón «Cerrar».
- Botones «Guardar» (fondo `accent`, texto `onAccent`; «Guardando…» y deshabilitado
  mientras guarda) y «Cancelar» (cierra sin guardar y vuelve al punto inicial).
- Guardar llama `onGuardar(punto)`; si lanza, el `message` del error se muestra en
  `dangerText` bajo los botones y el modal sigue abierto. Si sale bien, cierra.
- Mientras llega el tamaño de la foto: `ActivityIndicator`.

### Para todos: la ficha y el directorio

- `src/screens/VerMusicoScreen.tsx`: el `<Image source={{ uri: imagen }} style={styles.imagen} … />`
  pasa a `<PortadaEncuadrada uri={imagen} punto={musico.foto ? musico.portada : PUNTO_CENTRO} style={styles.imagen} />`.
  El punto es de la **foto** (`profiles.foto`): cuando la ficha cae al avatar porque no hay
  foto, va centrado.
- `src/screens/DirectorioMusicosScreen.tsx`: en `TarjetaMusico`, igual, y el tipo de su
  prop pasa de `PerfilMusico` a `PerfilConPortada` (es lo que ya devuelve `useMusicos` tras
  el spec 192).
- La ficha y la tarjeta usan el mismo marco 4:3 de hoy (`styles.imagen`): no cambia el tamaño.

### Para el dueño: «Ajustar portada»

**`src/screens/EditarPerfilBandaScreen.tsx`**

- `cargarPerfil` guarda también `fotoGuardada` (`p.foto ?? ''`) y `puntoPortada`
  (`puntoDeFila(data)`, de la fila cruda).
- Bajo el `CampoImagen` de «Foto», con `foto` no vacía:
  - si `foto === fotoGuardada`: botón secundario «Ajustar portada» que abre `AjustarPortada`
    con `uri={foto}`, `puntoInicial={puntoPortada}`, `proporcion={4 / 3}` (el marco de
    `VerMusicoScreen`) y `onGuardar` → `guardarPuntoPortadaMusico(user.id, p)`; al volver,
    `puntoPortada` = el punto guardado y el texto «Portada guardada» en `success` bajo el botón.
  - si la foto cambió y todavía no se guardó: en `muted`, «Guarda la foto nueva para ajustar
    su encuadre.» **Por qué:** el trigger de W-344 vuelve el punto al centro cuando cambia
    la foto; ajustar sobre una foto sin guardar dejaría un punto que el guardado del
    formulario borra.

**`src/screens/EditarLocalScreen.tsx`**

- Solo con `miVenue`. Al montar (y cuando cambia `miVenue.id`),
  `leerPuntoPortadaLocal(miVenue.id)`; si falla, `PUNTO_CENTRO` y el botón igual se ofrece.
- Bajo el `CampoImagen` de «Foto del local», con `image` no vacía y `image === miVenue.image`:
  el mismo botón «Ajustar portada» con `proporcion={390 / 250}` y `onGuardar` →
  `guardarPuntoPortadaLocal(miVenue.id, p)`, más «Portada guardada». Con la foto cambiada
  sin guardar, el mismo aviso «Guarda la foto nueva para ajustar su encuadre.».
  **Por qué 390 / 250:** la app no muestra la foto del local en ninguna ficha pública
  (`DetalleLocalScreen` no la dibuja); donde se ve es la franja de la ficha web en el
  celular, 390 × 250 (W-344).
- Supuesto: «Ajustar portada» del local tiene sentido en la app aunque el resultado se vea en
  la web, porque hay dueños de local que solo usan la app.

Estilos con `useEstilos` y la paleta (spec 173). Nada de hex nuevos (los blancos de la guía
salen de `colores.white`).

### Lo que NO cambia

- Avatares, tarjetas de evento, `DashboardLocalScreen` (miniatura del local).
- El guardado del formulario de las dos pantallas de edición: el punto se guarda aparte,
  al tocar «Guardar» en el modal.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `npx expo export --platform web` termina sin errores.
3. `git diff package.json package-lock.json` vacío (sin dependencias nuevas) y
   `grep -rn "expo-image" src` no devuelve nada.
4. `grep -n "PortadaEncuadrada" src/screens/VerMusicoScreen.tsx src/screens/DirectorioMusicosScreen.tsx`
   devuelve una línea de uso en cada archivo.
5. `grep -n "Guarda la foto nueva para ajustar su encuadre" src/screens/EditarPerfilBandaScreen.tsx src/screens/EditarLocalScreen.tsx`
   devuelve una línea en cada archivo.
6. Ningún hex nuevo en los archivos tocados (`git diff` sin `#[0-9a-fA-F]{3,6}` agregado).
7. `git diff --stat` del commit toca solo los seis archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Ficha de un músico con portada ajustada en la web (Felio Saud): la app muestra el mismo
  encuadre que la web; el directorio también.
- Con la cuenta del músico: «Ajustar portada», arrastrar la foto hacia abajo → se ve más de
  arriba; «Guardar» → la ficha muestra el nuevo encuadre al volver.
- Cambiar la foto sin guardar → sale «Guarda la foto nueva para ajustar su encuadre.»;
  guardar el formulario → la ficha vuelve a centrar la foto nueva.
- Con el dueño de un local: ajustar y guardar; la ficha web en el celular muestra ese punto.

## Fuera de alcance

- «Ajustar portada» sobre la ficha pública (la web lo pone ahí; en la app vive en las
  pantallas de edición, donde el dueño ya cambia su foto).
- Zoom o recorte. Teclado (las flechas de la web): la app no tiene foco de teclado en el modal.

## Bugs encontrados al aplicar (28-nov-2026)

1. **Criterio 3.** `grep -rn "expo-image" src` ya devolvía líneas antes de este spec: coincide con
   `expo-image-picker` y `expo-image-manipulator`. Lo que se comprobó es la intención:
   `grep -rnE "from ['\"]expo-image['\"]" src` no devuelve nada y `package.json` no cambió.
2. **Foto que no carga en el modal.** El diseño no decía qué pasa si `getSize` falla dentro de
   `AjustarPortada` (quedaría el indicador para siempre). Muestra «No se pudo cargar la foto.» y
   solo «Cerrar».
3. **Punto del local que llega tarde.** Si `leerPuntoPortadaLocal` responde con el modal ya
   abierto, el modal toma el punto leído; sin eso, «Guardar» escribiría el centro encima.

