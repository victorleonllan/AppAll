# Spec 166 — El fan elige el pack en rojo, escribe a quién van las entradas extra y lo compra desde el detalle

> Estado: propuesto, sin aplicar (13-nov-2026)
> Capa: FRONTEND. `src/screens/DetalleEventoScreen.tsx`, `src/components/SelectorTipoEntrada.tsx` (nuevo), `src/components/DestinatariosPack.tsx` (nuevo), `src/screens/ConfirmacionCompraScreen.tsx`.
> Depende de: spec 164 (`useEspecialesVigentes`, `crearPagoCompra` con `especialId` y `destinatarios`, mensajes de error), spec 165 (sin packs creados no hay qué comprar), spec 173 (los archivos nuevos de este spec arman sus estilos con `useEstilos` y leen los colores de JSX con `useTema().colores`, según la receta §6 del 173; los archivos que ya existen siguen con `colors` hasta su spec de migración); token `especial` del 173, spec 160 (aplicado: compra por pasarela en el detalle).
> Hermano en la web: `app/(marketing)/cartelera/[id]/BotonComprar.js`, `app/(marketing)/compra/confirmacion/Confirmacion.js`, `libs/purchase.js` (W-255, W-260).

> **En una frase:** si el evento tiene packs a la venta, el detalle muestra «Entrada general»
> y una tarjeta roja por pack; al elegir un pack aparecen un contador de packs, el total, «= N
> entradas» y la lista «¿Quién recibe las otras entradas?», y la confirmación dice con qué pack
> se compró y a quién se mandó cada entrada.

## Contexto

En la web (W-255, 24-oct-2026, y W-260, 25-oct-2026):

- `page.js` pide `getEspecialesVigentes` solo si el evento no está cancelado y tiene
  `monto > 0` (`cartelera/[id]/page.js:153`).
- Con al menos un pack, `BotonComprar` muestra un selector (radio) arriba del contador:
  «Entrada general» con su precio de siempre (y «Agotada» si la preventa vigente quedó en 0) y
  una tarjeta por pack con borde y fondo suave en `--color-especial` y la píldora roja
  «{etiqueta} · {monto}», «{N} entradas por el precio de 1» y «quedan {restantes}». Sin packs,
  la pantalla es la de antes.
- Default: la general; si la general está agotada y hay packs, el primer pack.
- Con un pack, el contador cuenta **packs**, tope `min(restantes, floor(10 / N))`; total =
  `monto × packs` con «{entradas} entradas · pack {etiqueta}». Cambiar de opción vuelve la
  cantidad a 1 y vacía los destinatarios.
- W-260: con un pack, «¿Quién recibe las otras entradas?», «Entrada 1 — Tú ({correo})» y un
  campo de correo opcional por cada entrada 2..N; «Si dejas uno vacío, esa entrada llega a tu
  correo.». Subir o bajar packs agrega o quita filas al final sin borrar lo escrito. Un correo
  mal formado marca el campo y desactiva «Comprar» con «Revisa el correo de la entrada {N}».
- El enlace mágico del invitado restaura pack y cantidad; si el pack ya no está a la venta, no
  compra nada y avisa «Este pack ya no está a la venta.». Los destinatarios no van en la URL:
  quedan en `localStorage` y se borran al crear el pago.
- La confirmación agrega « · Pack {etiqueta}» bajo el monto y «Enviamos la entrada {k} a
  {correo}» por cada destinatario.

En la app:

- `DetalleEventoScreen.tsx:63` pide `usePrecioVigente`; `:65-82` las pasarelas; `:117`
  calcula `ventaCerrada`; `:424-426` muestra «Precio» y `PrecioEvento`; `:438-476` dibuja el
  botón único o un botón por pasarela, y `errorCompra` en un `Text`.
- `handleComprarLogueado(pasarela)` (`:225-302`) llama `crearPagoCompra({ eventoId, userId,
  pasarela })`, siempre con una entrada.
- La auto-compra tras el enlace mágico (`:163-193`) lee `pending_ticket` (solo existe en el
  build web: en nativo el botón manda a iniciar sesión, `:362-377`) y compra sola solo con
  una pasarela.
- `handleEnviarLink` (`:197-221`) guarda `pending_ticket` en `localStorage` (web) o
  `AsyncStorage` (nativo).
- `ConfirmacionCompraScreen.tsx:216-223` muestra artista, local, fecha y hora; no muestra
  monto ni cantidad. `idTicket` (`:98`) sale del parámetro o de la resolución por `ref`
  (`:125-140`).

## Decisiones

### 1. Mismas condiciones que la web para ofrecer packs

`useEspecialesVigentes(evento && !enVivo.cancelado && (evento.monto ?? 0) > 0 ? evento.id :
null)`, junto a `usePrecioVigente`, antes del `return` de «Evento no encontrado» (comentario
de `:55-56`). El selector se dibuja solo si además `!ventaCerrada` y la lista tiene algún pack.
`especiales_vigentes_de` ya devuelve vacío si la venta del evento cerró (W-253 §1).

### 2. El contador aparece solo con un pack; la entrada general sigue en 1

La web tiene contador también en la general (W-087). La app compra la general de a una desde
siempre, y el spec 160 lo dejó explícito fuera de alcance. Este spec trae el contador de
**packs** porque sin él no hay paridad con W-255 §3 ni con las filas de W-260 (2 packs de un
2x1 son 3 destinatarios). **Se descartó** sumar el contador a la general acá: cambia la compra
de todos los eventos y no es parte del pack; si se quiere, es un spec aparte que porta W-087.

### 3. Selector y destinatarios en componentes aparte

`DetalleEventoScreen.tsx` tiene 765 líneas. El selector y la lista de destinatarios son
presentación pura (props in, eventos out) y se sacan a `SelectorTipoEntrada` y
`DestinatariosPack`. El estado (opción, cantidad, destinatarios) se queda en la pantalla,
porque lo usan la compra y la auto-compra.

### 4. Ante un error del pack, se relee la lista

Si `crearPagoCompra` falla con `especial_agotado`, `especial_cerrado` o `especial_invalido`,
además de mostrar el mensaje (spec 164) se llama `recargar()` de `useEspecialesVigentes`: la
lista quedó vieja. Si el pack elegido ya no viene, `especialElegido` cae a `null` y la pantalla
vuelve a la general **sin comprar**: el fan tiene que tocar de nuevo. Es el mismo criterio que
`pasarela_inactiva` (`:284-288`) y que la web («Si el pack elegido ya no está… vuelve a la
general»).

### 5. Auto-compra del invitado (build web): la elección viaja en el almacenamiento, no en la URL

En el build web, la vuelta del enlace mágico ya se resuelve con `pending_ticket` en
almacenamiento local, no con parámetros de URL como la web. La elección del pack se guarda al
lado: `pending_compra` = `JSON.stringify({ eventoId, especialId, cantidad, destinatarios })`
en `handleEnviarLink`, con la misma bifurcación `localStorage` / `AsyncStorage`, dentro de
`try/catch` (si el almacenamiento no está, la compra sigue y la elección vuelve vacía, W-260
§2). Los destinatarios no salen del dispositivo hasta el pago, igual que en la web.

Al volver, el efecto de auto-compra espera también a `especiales !== null`. Lee y borra
`pending_compra` junto con `pending_ticket`. Si `especialId` no está en la lista vigente,
`setErrorCompra('Este pack ya no está a la venta.')` y no compra nada: caer en la general sería
cobrar algo que el fan no pidió (W-255, comentario del efecto de la web). Si está, fija opción,
cantidad (acotada al tope del pack) y destinatarios (recortados a `entradas - 1`), y con una
sola pasarela compra con esos valores pasados **explícitos** a `handleComprarLogueado`, porque
el `setState` recién hecho todavía no se leyó.

### 6. Apple y Google

Un pack es una entrada a un evento presencial, como las que la app ya vende con Mercado Pago
y Flow; no es contenido digital. No aplica la regla de cobro dentro de la tienda que dejó a
Pro fuera de la app (plan del 19-oct-2026).

## Cambios por archivo

### `src/components/SelectorTipoEntrada.tsx` (nuevo)

```ts
export const GENERAL = 'general';
interface Props {
  evento: Evento;
  vigente: PrecioVigente | null;
  especiales: EspecialVigente[];
  opcion: string;                 // GENERAL o el id de un pack
  onElegir: (opcion: string) => void;
  generalAgotada: boolean;
}
```

Lista vertical con `accessibilityRole="radiogroup"`; cada opción es un `TouchableOpacity`
con `accessibilityRole="radio"` y `accessibilityState={{ checked, disabled }}`, un círculo de
18 px a la izquierda (relleno si está elegida) y el contenido a la derecha:

- **Entrada general:** «Entrada general» en negrita y debajo `PrecioEvento` (el mismo de hoy)
  o, con `generalAgotada`, «Agotada» en `colors.muted`, deshabilitada. Borde `colors.border`;
  elegida, borde `colors.primary`.
- **Un pack por fila:** borde `colors.especial`, fondo `colors.especialSuave`; elegida, borde
  de 2 px. Dentro, una píldora con fondo `colors.especial` y texto `colors.especialContenido`
  en negrita: «{etiquetaDeEspecial(e)} · {formatearMonto(e.monto, e.moneda ?? evento.moneda)}»;
  debajo «{N} entradas por el precio de 1» y «quedan {restantes}» en `colors.muted`.

### `src/components/DestinatariosPack.tsx` (nuevo)

```ts
interface Props {
  valores: string[];              // posición 0 = entrada 2
  onCambiar: (i: number, valor: string) => void;
  correoComprador: string | null;
  error: string | null;
}
```

- Título «¿Quién recibe las otras entradas?».
- «Entrada 1» y «Tú» o «Tú ({correoComprador})».
- Por cada valor, «Entrada {i + 2}» y un `TextInput` con `keyboardType="email-address"`,
  `autoCapitalize="none"`, `autoCorrect={false}`, `textContentType="emailAddress"` y
  placeholder «correo@ejemplo.com». Con algo escrito que no pasa `CORREO_VALIDO`, borde
  `colors.danger`.
- «Si dejas uno vacío, esa entrada llega a tu correo.» en cursiva, `colors.muted`.
- `error` en `colors.danger`.

### `src/screens/DetalleEventoScreen.tsx`

**Estado nuevo** (antes del `return` temprano, junto a `:63-69`):

- `const { especiales, recargar: recargarEspeciales } = useEspecialesVigentes(...)`
  (Decisión 1).
- `opcion` (`string`, `GENERAL` por defecto), `cantidad` (1), `destinatarios` (`string[]`, []).
- Un efecto que, cuando `especiales` deja de ser `null` la primera vez, pasa `opcion` al primer
  pack si `generalAgotada && especiales.length > 0` (no se puede hacer en el `useState`
  inicial porque la lista llega después).

**Derivados** (después del `return` temprano):

- `generalAgotada = vigente?.restantes != null && vigente.restantes <= 0`.
- `especialElegido = opcion === GENERAL ? null : (especiales ?? []).find(e => e.id ===
  opcion) ?? null`.
- `entradas = cantidad × (especialElegido?.multiplicador ?? 1)`.
- `tope = especialElegido ? Math.max(1, Math.min(maxPacksPorCompra(N), restantes)) : 1`.
- `filas = especialElegido ? entradas - 1 : 0`; `visibles = Array.from({ length: filas },
  (_, i) => destinatarios[i] ?? '')`; `invalida = primerDestinatarioInvalido(visibles)`;
  `errorDestinatarios = invalida >= 0 ? \`Revisa el correo de la entrada ${invalida + 2}\` :
  null`.
- `total = (especialElegido?.monto ?? 0) × cantidad`.

**Acciones:** `elegirOpcion(o)` fija la opción, `cantidad = 1` y `destinatarios = []`.
`cambiarCantidad(n)` fija la cantidad y recorta `destinatarios` a `n × N - 1` (lo escrito en
las filas que quedan no se toca). `cambiarDestinatario(i, v)` escribe la posición `i`
rellenando con `''` si hace falta.

**Render** (`:424-476`):

- Sin selector (Decisión 1): lo de hoy, sin cambios.
- Con selector: «Precio» + `SelectorTipoEntrada` en lugar de `PrecioEvento`. Con un pack
  elegido, debajo:
  - fila «Packs» con un contador `−` / número / `+` (botones de 38 px con borde
    `colors.border`; `−` deshabilitado en 1 y `+` en `tope`, con `accessibilityLabel` «Menos»
    y «Más»);
  - `DestinatariosPack` con `correoComprador={user?.email ?? null}`, solo si `filas > 0`;
  - el total `formatearMonto(total, especialElegido.moneda ?? evento.moneda)` en negrita y
    debajo «{entradas} entradas · pack {etiquetaDeEspecial(especialElegido)}».
- Botón único (una pasarela): con un pack, el texto es «Comprar pack {nombre} — {total}» con 1
  pack o «Comprar {n} packs — {total}» con más; con la general, el texto de hoy. Botones por
  pasarela: textos de hoy. Todos los botones de compra quedan deshabilitados además con
  `errorDestinatarios`, que se muestra debajo de la lista.

**Compra:** `handleComprarLogueado(pasarela, compra?)` con
`compra = { especialId: string | null; cantidad: number; destinatarios: string[] }`, por
defecto los del estado (`especialElegido?.id ?? null`, `cantidad`, `visibles`). Pasa los tres
a `crearPagoCompra` (que decide qué viaja, spec 164). En el `catch`, además de lo de hoy, la
Decisión 4. Tras crear el pago, borra `pending_compra` (web o nativo, en `try/catch`).

**Enlace mágico** (`:197-221`): junto a `pending_ticket`, guarda `pending_compra` solo si hay
un pack elegido; si no, lo borra (Decisión 5).

**Auto-compra** (`:163-193`): la Decisión 5. La condición de salida suma `especiales ===
null` antes del candado, y `especiales` entra en las dependencias.

### `src/screens/ConfirmacionCompraScreen.tsx`

- Estado `pack` (`{ especial, cantidad, destinatariosExtra } | null`).
- Efecto: cuando `actualStatus === 'success'` e `idTicket` existe, una sola llamada a
  `getPackDeTicket(idTicket)`. Una sola vez porque el pack no cambia mientras se espera el pago
  (mismo criterio que `Confirmacion.js:162-165` de la web).
- Dentro de `eventoInfo` (`:216-223`), debajo del detalle:
  - con `pack.especial`: «{cantidad} entradas · Pack {etiquetaDeEspecial(pack.especial)}»;
  - por cada correo `k`: «Enviamos la entrada {k + 2} a {correo}», con el correo en negrita.
- Sin pack ni destinatarios, la pantalla queda igual que hoy.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. Evento sin packs: el detalle y la compra son iguales a antes (mismo botón «Comprar entrada —
   $X», sin selector ni contador).
4. Evento con un 3x1 de `$10.000` y cupo 4: aparece la tarjeta roja con «3x1 · <monto>», «3
   entradas por el precio de 1» y «quedan 4». Al elegirla, el contador no pasa de 3 (10 / 3);
   con 2 packs el total es `monto × 2` y dice «6 entradas · pack 3x1», y hay 5 filas de
   destinatarios (entradas 2 a 6).
5. Escribo en la fila «Entrada 2», subo a 2 packs y bajo a 1: lo escrito sigue. Vuelvo a
   «Entrada general»: la lista desaparece y, al elegir otra vez el pack, vuelve vacía y con
   cantidad 1.
6. `ana@` en una fila marca el campo, muestra «Revisa el correo de la entrada 2» y deshabilita
   el botón de compra.
7. Compra de prueba de un 2x1 con Mercado Pago sandbox y `ana@mail.com` en la entrada 2: el
   ticket queda con `especial_id`, `cantidad = 2` y `destinatarios_extra = {ana@mail.com}`; la
   confirmación muestra «2 entradas · Pack 2x1» y «Enviamos la entrada 2 a ana@mail.com».
8. Con el pack cerrado (`activa = false`) entre abrir el detalle y comprar: se ve «Este pack ya
   no está a la venta.», la tarjeta desaparece, queda elegida la general y no se navega.
9. Build web, sin sesión: elijo un 2x1, escribo un destinatario, pido el enlace, vuelvo con la
   sesión abierta: con una pasarela la compra arranca sola con el pack y el destinatario; si en
   el medio cerré el pack, se ve «Este pack ya no está a la venta.» y no se crea ticket.
10. `rg "pending_compra" src/screens/DetalleEventoScreen.tsx` muestra lectura, escritura y
    borrado envueltos en `try/catch`.
11. Solo cambian o se crean los cuatro archivos de `> Capa:`.

## Fuera de alcance

- Contador de entradas en la general (W-087): Decisión 2.
- Píldora del pack en la cartelera: spec 167.
- Mencionar el pack en «Mis entradas»: la web tampoco lo hace (W-255 §6).
- Listado de destinatarios para el organizador o en «Mis entradas» (W-260, Fuera de alcance).
- Correos al comprador y a los destinatarios: los manda la web (W-259), ya desplegado.

## Verificación manual (candidatas a `V#` en `specs/PENDIENTES.md`)

- **V-candidata 166-a:** en Android y en iOS, comprar 1 pack 2x1 con un destinatario real
  (Mercado Pago de prueba): la app vuelve a la confirmación con el pack y el destinatario; el
  comprador recibe 2 entradas y el listado; el destinatario recibe 1, sin monto.
- **V-candidata 166-b:** en un teléfono de 360-390 px de ancho, el selector con dos packs, el
  contador y 4 filas de correo entran sin cortarse y el teclado de correo no tapa el botón de
  compra al escribir en la última fila.
