# Spec 126 — Pantalla «Mis entradas»: un talón con su QR por cada entrada

> Estado: aplicado (17-oct-2026) — `tsc --noEmit` sin errores fuera de `supabase/functions`, `expo export --platform web` limpio, `src/navigation/` sin cambios. `PerfilScreen` no se tocó: el botón «🎟️ Mis entradas» arriba de «Cerrar sesión» ya lo dejó el spec 114. Criterios 4-10 y V-126a/b quedan para prueba manual con cuenta real.
> Capa: FRONTEND. `src/screens/MisEntradasScreen.tsx` (reemplaza el placeholder del spec 114), `src/components/TalonEntrada.tsx` (nuevo), `src/screens/ConfirmacionCompraScreen.tsx`, `src/screens/PerfilScreen.tsx`.
> Depende de: spec 114, spec 125, spec 118
> Alimenta: el panel de fan (spec 124) puede enlazar a esta ruta; el canje en puerta (`EscanerQRScreen`, spec 041) lee los mismos tokens.
> Hermano en la web: W-076 / W-091 (`sonopolisWeb/app/(private)/mis-entradas/page.js`, `PollTrasCompra.js`).

> **En una frase:** la ruta `MisEntradas` muestra cada entrada como un talón con su QR de
> 200 px, folio, token y estado de puerta, se abre sola después de una compra exitosa y
> tiene un acceso fijo desde el perfil.

## Contexto

Con el spec 125 la app ya sabe leer las entradas propias, pero no hay pantalla: después de
pagar, `ConfirmacionCompraScreen` dice «éxito» y a los 8 s vuelve atrás
(`src/screens/ConfirmacionCompraScreen.tsx:127-134`), sin mostrar nunca la entrada. En la
web, la vuelta de Mercado Pago aterriza en `/mis-entradas` (W-076) y ahí está el QR.

El diseño copia el talón de W-091 y su razón, que no es estética: con QR chicos apilados y
separados por una línea de 1 px, la cámara del escáner encuadraba dos códigos a la vez y
dudaba. Un QR necesita su **zona de silencio** (el margen blanco alrededor que le permite
al lector aislarlo), y en esta pantalla el QR es el contenido principal.

`react-native-qrcode-svg` ya está instalado y en uso (`EntradasEventoScreen.tsx:6`).

### Contrato con el spec 114

El 114 registra la ruta `MisEntradas` (sin parámetros), su placeholder en
`src/screens/MisEntradasScreen.tsx`, el `linking` y los tipos de parámetros. Este spec
**reemplaza el contenido del placeholder y no toca `src/navigation/`**. Para navegar hacia
`MisEntradas` desde pantallas de otros stacks se usa el tipo de parámetros que exporta el
114 (lee el spec 114 para su nombre exacto). Si el 114 le dio parámetros distintos a
`MisEntradas`, mandan los del 114.

## Diseño

### 1. `src/components/TalonEntrada.tsx` (nuevo)

`export default function TalonEntrada({ entrada }: { entrada: EntradaPropia })`, con
`EntradaPropia` importado de `../hooks/useMisEntradas`. Todos los colores, tamaños y
espaciados salen de `src/theme` (AGENTS.md).

De arriba abajo:

1. **Cabecera** (fondo `colors.primary`, texto `colors.white`):
   - Fila superior: «Sonópolis» a la izquierda (`fontSize.sm`, negrita) y una píldora
     «ENTRADA» a la derecha (fondo `colors.accentLight`, texto `colors.primary`).
   - Artista (`fontSize.lg`, negrita). Debajo, el género si existe (opacidad 0.75).
   - `📍 {venueName}` y `📅 {fecha} · {hora}` (opacidad 0.7). Se muestran `fecha` y `hora`
     tal como están en la base, igual que el resto de la app; `comienzaAt` solo ordena.
   - Si `evento.status === 'cancelled'`: una franja «Evento cancelado» con fondo
     `colors.danger` al pie de la cabecera.
   - Si `entrada.evento` es `null`: artista «Evento» y sin las demás líneas.
2. **Perforación**: una línea `borderStyle: 'dashed'`, `borderTopWidth: 2`,
   `borderColor: colors.border`, con margen horizontal `spacing.md`, y dos círculos de
   22 px con fondo `colors.background` en posición absoluta, uno a cada lado (`left: -11` y
   `right: -11`). Sin los semicírculos las dos mitades se leen como bloques apilados y no
   como un talón (W-091).
3. **Cuerpo** (fondo `colors.cardBackground`, contenido centrado):
   - `<QRCode value={qrToken} size={200} quietZone={16} backgroundColor={colors.white} color={colors.primary} />`.
     `colors.primary` (#3D2B1F) contra blanco tiene contraste de sobra para un lector.
     Con `status === 'void'` el QR va en `colors.muted`.
   - `accessibilityLabel` del QR: `QR entrada #007`.
   - El token en texto, `selectable`, `fontSize.xs`, color `colors.secondary`, fuente
     monoespaciada (`Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })`).
     Es el respaldo cuando la cámara no lee: se dicta o se tipea, y el escáner canjea por
     token (spec 040).
   - Fila inferior: a la izquierda el folio `#${String(folio).padStart(3, '0')}`
     (`fontSize.lg`, negrita); a la derecha el estado:

     | `status` | Texto | Color |
     |---|---|---|
     | `valid` | «Sin usar» | `colors.success` |
     | `used` | «Ya entró» + debajo «Ingresó a las HH:MM» | `colors.muted` |
     | `void` | «Anulada» | `colors.danger` |

     Los colores van al revés que en la vista del equipo (`EntradasEventoScreen`), y es a
     propósito (W-091): para quien controla la puerta `used` es lo bueno; para el dueño de
     la entrada, «Sin usar» es lo que todavía sirve. No unificar los dos mapeos.
   - «HH:MM» se arma a mano con `getHours()`/`getMinutes()` y `padStart(2, '0')` sobre
     `new Date(redeemedAt)`, en la hora del teléfono. No se usa `toLocaleTimeString`
     porque Hermes (el motor de JS de React Native) no garantiza el formato por locale.
4. Con `status === 'void'` el talón entero va con `opacity: 0.6`.

Borde redondeado `borderRadius.lg`, `overflow: 'hidden'`, y separación vertical entre
talones de al menos `spacing.xl`, para que la cámara nunca encuadre dos QR.

### 2. `src/screens/MisEntradasScreen.tsx` (reemplaza el placeholder)

Usa `useMisEntradas()` (spec 125) y `useAuth()`.

- **Sin sesión**: texto centrado «Inicia sesión para ver tus entradas.».
- **Cargando sin datos previos**: `ActivityIndicator` (`colors.accent`).
- **Error**: aviso arriba de la lista con el texto de `error` (`colors.danger`) y un botón
  «Reintentar» que llama `refrescar()`. Las entradas ya cargadas siguen visibles debajo
  (el hook no las borra, spec 125).
- **Compras en emisión** (`comprasEnEmision.length > 0`): una tarjeta por compra, arriba de
  los talones: «Pago confirmado. Tus {cantidad} entrada(s) para {artista} se están
  emitiendo.» (singular/plural según `cantidad`). Mientras haya alguna, la pantalla llama
  `refrescar()` cada 3 s, **máximo 6 veces por montaje** (unos 18 s, la misma ventana que
  `PollTrasCompra.js` de la web). Después deja de preguntar y la tarjeta agrega
  «Desliza hacia abajo para actualizar.». El intervalo se limpia al desmontar.
- **Vacío** (sin entradas ni compras en emisión, sin error): «Todavía no tienes entradas»
  y un botón «Ver la cartelera» que navega a la pestaña `Cartelera`.
- **Lista**: `SectionList` con la sección «Próximas» (`proximas`) y, si hay, «Pasadas»
  (`pasadas`). Cada ítem es un `TalonEntrada`. Encabezado de sección en `fontSize.md`,
  `colors.primary`. `RefreshControl` (deslizar para recargar) que llama `refrescar()`.
- `keyExtractor`: `entrada.id`. Ancho del talón: el de la pantalla menos `spacing.md` por
  lado, con tope de 420 px y centrado (en web y tablet no se estira).

### 3. Puntos de entrada

**a) Después de pagar — `ConfirmacionCompraScreen.tsx`.** Se edita sobre el archivo tal
como lo deja el spec 118 (que cambia cómo se confirma el pago):

- En la vista `success`, un botón principal «Ver mis entradas» que navega a
  `MisEntradas`.
- El redirect automático de éxito (hoy `navigation.getParent()?.goBack()` a los 8 s,
  `:127-134`) pasa a navegar a `MisEntradas` con `navigation.replace` si la ruta vive en
  el mismo stack, o con `navigate` si vive en otro. Así la compra termina donde termina en
  la web: mostrando la entrada. El temporizador se limpia si el usuario toca el botón antes
  (sin doble navegación).
- Las demás vistas (`failure`, `pending`, `timeout`) no cambian.

**b) Desde el perfil — `PerfilScreen.tsx`.** Un botón «🎟 Mis entradas» arriba de
«Cerrar sesión», con el mismo estilo de botón que use la pantalla en ese momento. Cambio
aditivo: no se toca el resto de la pantalla (otros specs de esta fase, como el 124 y el
128, también la editan).

**c) Desde el panel de fan** (`PanelFan`, spec 124): ese archivo es del 124. Si el 124 no
deja el enlace «Ver todas» hacia `MisEntradas`, se agrega en un spec aparte; este no toca
`PanelFanScreen.tsx`.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio.
2. `npm run build:web` (`expo export --platform web`) termina sin errores.
3. `git diff --stat` toca solo los cuatro archivos de la línea Capa; `src/navigation/` sin
   cambios.
4. Con una cuenta con entradas reales, cada `ticket_item` aparece como un talón con QR,
   folio de 3 dígitos, token en texto y estado; la cantidad de talones es igual a la de
   `/mis-entradas` en la web.
5. El QR de un talón, escaneado desde `EscanerQRScreen` con una cuenta del equipo del
   evento, canjea esa entrada; al recargar «Mis entradas», el talón dice «Ya entró» y
   «Ingresó a las HH:MM».
6. Un evento cancelado muestra la franja «Evento cancelado» en sus talones.
7. Una compra `completed` sin entradas emitidas muestra la tarjeta «Pago confirmado…» y la
   pantalla deja de recargar sola después de 6 intentos.
8. Después de una compra exitosa, la confirmación lleva sola a «Mis entradas» y el botón
   «Ver mis entradas» lleva ahí sin doble navegación.
9. Desde el perfil (`PerfilScreen`) el botón «Mis entradas» abre la pantalla.
10. Sin red, «Reintentar» muestra el error y los talones ya cargados siguen en pantalla.

## Fuera de alcance

- Subir el brillo de la pantalla al mostrar el QR (pide `expo-brightness`, dependencia
  nativa nueva).
- Ver las entradas sin conexión (pregunta abierta del spec 125).
- Enlace del talón a la ficha del evento: la forma de navegar ahí la fija cómo el 114 anide las rutas; queda
  para cuando la navegación esté aplicada.
- Acceso a «Mis entradas» desde el perfil de músico (`PerfilMusicoScreen`) y el panel de
  local (`DashboardLocalScreen`). En la web `/mis-entradas` es solo para `fan`
  (`requireRole("fan")`). La pantalla funciona con cualquier sesión, y a ella se llega
  también desde la confirmación de compra, que es igual para todos los roles.
- Cambiar cómo se confirma el pago: spec 118.

## Verificación manual (V# candidatas)

- **V-126a** — En un Android y un iPhone reales: comprar una entrada de prueba, llegar a
  «Mis entradas» desde la confirmación y escanear el QR con otro teléfono en
  `EscanerQRScreen`, de noche o con poca luz.
- **V-126b** — Con 3 entradas de la misma compra, apuntar la cámara del escáner a la lista
  y confirmar que lee un solo código por vez.
