# Spec 207 — La confirmación de compra muestra la entrada con su QR

> Estado: propuesto (27-nov-2026)
> Capa: FRONTEND. `src/screens/ConfirmacionCompraScreen.tsx`.
> Depende de: spec 126 (`TalonEntrada.tsx`, `EntradaPropia`/`EventoDeEntrada` de `useMisEntradas.ts`, redirect a Mis entradas), spec 166 (`getPackDeTicket`, destinatarios del pack), spec 177 (tema en la confirmación). Todos aplicados; ninguno se modifica.
> Hermano en la web: `app/(marketing)/compra/confirmacion/Confirmacion.js` y `page.js`, `components/TalonEntrada.js` (W-322); `getEntradasDeTicket` y `fechaCortaEn` (W-320).

> **En una frase:** con la compra confirmada, la pantalla muestra en el mismo lugar el talón
> de cada entrada del comprador —QR, folio y estado, con el `TalonEntrada` que ya usa Mis
> entradas— y la fecha corta «Vie 27 nov · 21:00», en vez de mandar a Mis entradas a los
> 8 segundos.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después
de esta orquestación.»

Hoy la confirmación exitosa dice «Tu entrada ha sido confirmada» y, a los 8 s
(`REDIRECT_EXITO_MS`), reemplaza la pantalla por Mis entradas (spec 126). La entrada —lo que
hay que mostrar en la puerta— no está en la pantalla que dice que la compra salió, y quien
alcanza a leer el mensaje pierde la pantalla mientras lo lee. La web (W-322) dibuja ahí
mismo el talón con su QR, y la app ya tiene todo para hacerlo: las filas de `ticket_items`
con `folio` y `qr_token` legibles por el dueño del ticket (RLS `ti_select`) y el componente
`TalonEntrada`, que dibuja el QR en el teléfono con `react-native-qrcode-svg`.

## Decisión

### Lógica nueva: cabe en la pantalla, sin spec LÓGICA aparte

Hacen falta dos piezas que no existen en la app: leer las entradas de **un** ticket y la
fecha corta en el huso del evento. Las dos van como funciones de módulo dentro de
`ConfirmacionCompraScreen.tsx`, no en `src/lib/` ni en un hook:

- La pantalla ya tiene sus propias consultas de módulo (`pedirConfirmacion`, la resolución
  del ticket por `preference_id`): una consulta más del mismo tipo sigue el patrón.
- Ninguna otra pantalla de la app las usa: en la web la fecha corta sirve también para la
  ficha del evento rediseñada (W-321), que no aplica a la app en esta tanda. Si algún día
  se necesitan en otra pantalla, se mueven con su spec LÓGICA.
- No hay cambio de base: `ticket_items` y su RLS existen desde el spec 036.

```ts
/** Las entradas de un ticket del usuario, por folio ascendente. `[]` si no hay sesión,
 * si el ticket es de otra persona o si falla (se registra con console.error). */
async function leerEntradasDelTicket(ticketId: string, userId: string): Promise<EntradaTicket[]>;

/** «Vie 27 nov» en el huso del país del evento; `""` sin fecha. */
function fechaCortaEn(comienzaAt: string | null | undefined, zona: string): string;
```

- **`leerEntradasDelTicket`**: `supabase.from('ticket_items').select('id, ticket_id,
  evento_id, folio, qr_token, status, redeemed_at, ticket:tickets!inner(user_id)')
  .eq('ticket_id', ticketId).eq('ticket.user_id', userId).order('folio', { ascending: true })`.
  El filtro por dueño es obligatorio por la misma razón que en `useMisEntradas.ts`:
  `ti_select` es un OR con el equipo del evento, y sin él un músico que abre la
  confirmación de un ticket de su evento vería QR ajenos. Mapea a `{ id, ticketId,
  eventoId, folio, qrToken, status, redeemedAt }` (el tipo `EntradaTicket` es
  `Omit<EntradaPropia, 'evento'>`). Nunca lanza: la entrada en pantalla es un extra; el
  correo y Mis entradas siguen siendo el respaldo (mismo criterio que `getPackDeTicket`).
- **`fechaCortaEn`** (port de `libs/fechaEvento.js`, W-320 §1):
  `Intl.DateTimeFormat('es-CL', { timeZone: zona, weekday: 'short', day: 'numeric', month:
  'short' }).formatToParts(...)`, tomando las partes `weekday`, `day` y `month` (no el
  texto armado, que trae coma), sin puntos (algunas versiones de ICU dan «vie.»,
  «sept.»), día de la semana con mayúscula inicial y mes en minúscula: «Vie 27 nov». La app
  ya depende de `Intl` con `timeZone` (`src/lib/redes/horario.ts`, spec 150).
  `zona = PAISES[evento.pais]?.zonaHoraria ?? PAISES[PAIS_POR_DEFECTO].zonaHoraria`
  (`src/constants/paises.ts`): la hora del afiche, no la del teléfono (W-158).

### 1. Cuándo se leen las entradas

En el efecto que hoy pide el pack al aprobarse (`packPedido`), en vez de solo
`getPackDeTicket(idTicket)`:

```ts
Promise.all([getPackDeTicket(idTicket), user ? leerEntradasDelTicket(idTicket, user.id) : Promise.resolve([])])
  .then(([p, entradas]) => { setPack(p); setEntradas(entradas); setEntradasLeidas(true); });
```

- Pack y entradas se guardan **a la vez** (addenda de W-322): si las entradas llegaran
  antes que los destinatarios, se dibujaría un instante el QR de una entrada que es de otra
  persona.
- Una sola lectura (el candado `packPedido` no cambia). No se reintenta en bucle.
- `user` sale de `useAuth()`.

### 2. Qué talones se muestran

`entradasDelComprador`, función de módulo en la misma pantalla:

```ts
function entradasDelComprador<T>(entradas: T[], destinatariosExtra: string[]): T[] {
  return entradas.filter((_, i) => i === 0 || !destinatariosExtra[i - 1]);
}
```

Con las entradas en orden de folio, la de índice 0 es siempre del comprador y la de índice
`i` es de otra persona si `destinatariosExtra[i - 1]` existe (spec W-258: el correo k recibe
el folio k+1; es la regla corregida en la addenda de W-322, contando desde 0, que coincide
con el «Enviamos la entrada {k + 2}» que la pantalla ya escribe). Esas no se dibujan: ya se
nombran en esas líneas. Sin pack, todas son del comprador. Un QR de otra persona en la
pantalla que dice «muéstrala en la puerta» invita a usarlo dos veces (W-322, Descartado).

Cada talón es `<TalonEntrada entrada={...} />` sin tocar el componente: se le pasa una
`EntradaPropia` armada con la entrada leída y `evento` mapeado desde el `Evento` del
contexto (`artista`, `venueId`, `venueName`, `imagen`, `fecha`, `hora`, `comienzaAt ??
null`, `genero || null`, `status ?? 'published'`, `pais`); sin evento en el contexto,
`evento: null` (el talón dice «Evento», como ya hace).

Varios talones van uno debajo del otro con `spacing.md` de separación: dos QR pegados
confunden a la cámara (W-091).

### 3. Disposición y textos

El contenedor pasa de `View` centrado a `ScrollView` (`contentContainerStyle` con el mismo
padding, `alignItems: 'center'` y `flexGrow: 1` + `justifyContent: 'center'` para que sin
talones se vea igual que hoy). Ancho de los bloques: `'100%'` con `maxWidth: 420` (W-322).
Orden, solo en éxito:

1. Ícono, título y mensaje, como hoy. Con al menos un talón en pantalla, el mensaje de éxito
   pasa a «Tu entrada está confirmada. Muéstrala en la puerta desde aquí o desde tu correo.»
   (o «Tus entradas están confirmadas. Muéstralas en la puerta desde aquí o desde tu
   correo.» con más de uno). Sin talones, el de siempre. Los demás estados (`failure`,
   `pending`, `timeout`) no cambian.
2. Resumen del evento (`eventoInfo`): la línea `{evento.venueName} · {evento.fecha} ·
   {evento.hora}` pasa a `{fechaCortaEn(evento.comienzaAt, zona)} · {evento.hora} ·
   {evento.venueName}` («Vie 27 nov · 21:00 · Bar X»). Si `comienzaAt` es nulo (eventos
   viejos), queda la línea de hoy. Pack y «Enviamos la entrada {k + 2} a {correo}» no
   cambian. Este cambio de fecha vale en todos los estados, no solo en éxito.
3. Talones (§2).
4. Aviso de correo, si hay talones y `user?.email`: recuadro con fondo `c.highlightBg`,
   borde 1 `c.highlightBorder`, `borderRadius.md`, ícono `Ionicons` `mail-outline` y el
   texto «También te la mandamos a {correo}. Si cierras esta pantalla, la encuentras en Mis
   entradas.» (W-322 §3, con «pantalla» en vez de «página»; en la app Mis entradas está en
   el mismo stack para cualquier rol, spec 114, así que no hace falta la variante «la
   encuentras en ese correo»).
5. Botones: «🎟️ Ver mis entradas» (primario) y «Volver a cartelera» (secundario), como hoy.

### 4. El redirect del spec 126

- **Con talones en pantalla**: no hay redirect automático. La entrada ya está a la vista; el
  botón «Ver mis entradas» sigue.
- **Sin talones** (sin sesión —compra como invitado, spec 046—, emisión que no terminó o
  lectura fallida): se conserva el redirect a los `REDIRECT_EXITO_MS` del spec 126, pero se
  arma recién cuando `entradasLeidas` es `true` y la lista del comprador quedó vacía, para
  no cortar una lectura en curso. `irAMisEntradas` no cambia (sigue siendo `replace`).
- El spec 126 no se reescribe: este spec deja su redirect como respaldo para el caso sin
  talones. Al cerrar, el 126 recibe la nota de estado «redirect acotado por el spec 207».

### Lo que NO cambia

`TICKET_A_VISTA`, `pedirConfirmacion`, `consultarTicket`, el polling (`VENTANA_POLLING_MS`,
`INTERVALO_POLLING_MS`), la resolución por `ref`, `estadosCompra` salvo el mensaje
condicional del §3, y `TalonEntrada.tsx`.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `npx expo export --platform web` termina sin errores.
3. Ningún hex nuevo en el archivo tocado (`git diff` sin `#[0-9a-fA-F]{3,6}` agregado).
4. `git diff` de las líneas de `TICKET_A_VISTA`, `pedirConfirmacion`, `consultarTicket` y
   el efecto de polling vacío.
5. `grep -n "eq('ticket.user_id'" src/screens/ConfirmacionCompraScreen.tsx` devuelve la
   consulta de `leerEntradasDelTicket` (filtro por dueño presente).
6. `grep -n "<TalonEntrada" src/screens/ConfirmacionCompraScreen.tsx` devuelve una línea y
   `git diff --stat` no incluye `src/components/TalonEntrada.tsx`.
7. `grep -n "Muéstrala en la puerta" src/screens/ConfirmacionCompraScreen.tsx` devuelve al
   menos una línea.
8. `git diff --stat` del commit toca solo el archivo de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Compra de 1 entrada con sesión (pago de prueba): la confirmación muestra el talón con QR,
  folio «#001» y «Sin usar», y no salta a Mis entradas; el escáner (spec 041) lee ese QR.
- Compra de un pack con un destinatario: se ve solo el talón del comprador y la línea
  «Enviamos la entrada 2 a …».
- Compra como invitado (sin sesión): sin talones, mensaje de siempre y redirect a los 8 s
  como antes.
- Evento de México comprado desde un teléfono en Chile: la fecha corta es la del afiche.
- Tema claro y oscuro: el QR sigue oscuro sobre blanco.

## Fuera de alcance

- «Cómo llegar» y «Compartir» de W-322 §4: «Cómo llegar» con varias apps es del spec 202
  (W-316) y la app no tiene un botón de compartir evento.
- El rediseño visual de la confirmación (disco de 52, Fraunces, tarjeta de resumen con
  flyer).
- `MisEntradasScreen.tsx` y `TalonEntrada.tsx`.
- Mover `fechaCortaEn` o `leerEntradasDelTicket` a `src/lib/`: solo con un segundo uso.
