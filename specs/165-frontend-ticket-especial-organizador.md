# Spec 165 — El organizador activa Preventa y Ticket especial con dos interruptores y crea packs 2x1 a 5x1

> Estado: propuesto, sin aplicar (13-nov-2026)
> Capa: FRONTEND. `src/components/TicketsEspecialesEvento.tsx` (nuevo), `src/screens/CrearEventoScreen.tsx`, `src/screens/EditarEventoScreen.tsx`.
> Depende de: spec 164 (`src/lib/especiales.ts`, `useEspeciales`), spec 136 (aplicado: formulario y `PreventasEvento`), spec 173 (los archivos nuevos de este spec arman sus estilos con `useEstilos` y leen los colores de JSX con `useTema().colores`, según la receta §6 del 173; los archivos que ya existen siguen con `colors` hasta su spec de migración).
> Alimenta: spec 166 y spec 167 .
> Hermano en la web: `components/TicketsEspecialesManager.js`, `components/FormEvento.js`, `app/globals.css` (W-254, W-256, W-257).

> **En una frase:** debajo del precio, que pasa a llamarse «Precio puerta/General», aparecen
> siempre dos interruptores apagados, «Preventa» y «🎟 Ticket especial»; encender el segundo
> abre el bloque rojo donde se elige 2x1 a 5x1, el precio del pack y cuántos packs se venden.

## Contexto

En la web, desde el 24-oct-2026:

- **W-254:** el bloque rojo «🎟 Ticket especial» (`TicketsEspecialesManager.js`) con alta
  de packs (selector 2x1·3x1·4x1·5x1, precio del pack, unidades, nombre opcional y botón
  «✓ Confirmar ticket especial»), en modo borrador al crear (se guardan después de
  `createEvento`) y en vivo al editar (precio y cupo editables, multiplicador solo con 0
  vendidos, «Cerrar»).
- **W-256** (pedido de Victor: «necesitamos dejar a la vista preventa y ticket especial…
  la idea es que no estén activados a menos que uno lo haga a mano»): el selector «General /
  Puerta» desaparece; lo reemplazan dos interruptores apagados por defecto. Preventa
  encendida = `tipo_precio = 'puerta'`, apagada = `'general'`. Al editar, el de Ticket
  especial arranca encendido si el evento tiene algún pack, y queda **bloqueado** encendido
  si alguno está activo («Cierra los packs para apagarlo»). Supera la sección 4 de W-254.
- **W-257:** la etiqueta del precio dice «Precio puerta/General», fija.

En la app, el formulario del spec 136 sigue con el selector viejo:

- `CrearEventoScreen.tsx:416` dice «Precio \*»; `:424-438` son los chips «General» /
  «Puerta»; `:442-447` monta `PreventasEvento` en modo `borrador` solo con «Puerta».
- `CrearEventoScreen.tsx:197-214`: después de `createEvento` guarda datos de pago y
  preventas, y junta los fallos en `fallos[]` con el texto «El evento se publicó, pero no se
  guardaron …: <mensaje>. Complétalo desde Editar.».
- `EditarEventoScreen.tsx:228`, `:236-250` y `:254-259`: lo mismo en edición, con
  `PreventasEvento` en modo `enVivo`. `tipoPrecio` se guarda en `updateEvento`
  (`:130-142`).
- `src/theme/index.ts:1-17` no tiene un color para el pack.
- `PreventasEvento.tsx` es el molde de componente con dos modos (`:15-17`, `:26-29`), fila
  en vivo con `confirmar` para cerrar (`:67-120`) y formulario de alta con botón
  «✓ Confirmar preventa» (`:160` en adelante).
- La app ya usa `Switch` de React Native con `trackColor` (`CarteleraScreen.tsx:276-280`).

## Decisiones

### 1. Token `colors.especial`, no `colors.danger`

`especial: '#DC2626'`, `especialContenido: '#FFFFFF'` y `especialSuave: '#FDECEC'` (los agrega el spec 173 en las dos paletas, para que un solo spec edite `src/theme/index.ts`; este spec solo los usa) (fondo
claro de las tarjetas del fan, spec 166). **Por qué no `danger`:** es casi el mismo rojo, pero
significa «algo falló» (comentario del spec 041 en `theme/index.ts:10-13`); si el pack usa
`danger`, cualquier ajuste futuro al color de error recolorea la promoción, y quien lee el
código ve un error donde hay una oferta. Es la misma razón de W-254 §1. `#DC2626` es el valor
de `--color-especial` de la web.

### 2. Interruptores con `Switch` nativo, en el mismo lugar que la web

Debajo del aviso «Sin un número en el precio…», dos filas, cada una con `Switch`, título y
ayuda, con los textos de W-256:

- **Preventa** — «Entradas más baratas antes del día, por tramos. El precio de arriba pasa a
  ser el de puerta.» `trackColor={{ true: colors.accent, false: colors.border }}`.
- **🎟 Ticket especial** — título en `colors.especial` — «Packs 2x1 a 5x1 con unidades
  limitadas, en rojo junto a la entrada normal.» `trackColor={{ true: colors.especial,
  false: colors.border }}`.

`tipoPrecio` deja de ser estado propio: se deriva, `const tipoPrecio = preventaOn ? 'puerta'
: 'general'`. Es exactamente lo que significaba el chip, así que `updateEvento`,
`createEvento`, la base y `precio_vigente_de` no cambian.

**Se descartó** dejar los chips y sumar solo el interruptor de pack: el pedido de W-256 es que
las dos opciones se vean igual y arranquen apagadas, y la app tiene el mismo problema que
motivó el pedido (quien no sabe que «Puerta» habilita preventas no las encuentra).

### 3. Bloque del pack: `TicketsEspecialesEvento`, molde de `PreventasEvento`

Dos modos por la misma razón que las preventas: la RLS exige poder editar un evento que, al
crear, todavía no existe. Textos, validaciones y reglas iguales a la web (W-254 §3). La
selección de multiplicador va con cuatro chips (el estilo `chip`/`chipActivo` del formulario)
en vez del `<select>` de la web: en un teléfono un selector desplegable de cuatro opciones
cuesta dos toques y los chips uno.

El aviso «Cada pack se cobrará <monto> (incluye 10% de recargo de la plataforma)» sale solo si
el componente recibe `moneda`, igual que la web (`monto > 0 && moneda`). Al crear, el
formulario de la app no conoce la moneda del país (no lee `paises_cobro`), así que no se
muestra; al editar se pasa `evento.moneda`.

### 4. Errores en un `Text`, no en `Alert.alert`

`Alert.alert` no hace nada en el build web (`src/lib/confirm.ts:11-15`). Los errores de
validación y de guardado del bloque van en un `Text` en `colors.danger` dentro del bloque, como
el formulario del spec 136. El cierre de un pack pide `confirmar` (que sí funciona en web).

### 5. Guardado al crear: después de las preventas y con el mismo manejo de fallos

Con el interruptor apagado **no se guarda** el borrador, aunque haya packs confirmados antes de
apagarlo (W-256 §4). Encendido y con borradores:
`crearEspecialesDeBorrador(creado.id, especiales)` después de las preventas; si falla, se suma a
`fallos[]` «El evento se publicó, pero no se guardaron los packs del ticket especial:
<mensaje>. Complétalo desde Editar.». Mismo criterio que preventas: el evento ya existe y un
fallo acá no lo deshace.

## Cambios por archivo

### `src/components/TicketsEspecialesEvento.tsx` (nuevo)

```ts
type Props =
  | { modo: 'borrador'; value: BorradorEspecial[]; onChange: (v: BorradorEspecial[]) => void; moneda?: string | null }
  | { modo: 'enVivo'; eventoId: string; moneda?: string | null; onCambio?: (lista: TicketEspecial[]) => void };
```

**Marco común:** borde de 2 px en `colors.especial`, `borderRadius.md`, título
«🎟 Ticket especial» en `colors.especial` y ayuda «Packs promocionales: el fan paga 1 y entra
con N. Se venden junto a la entrada normal.».

**Formulario de alta** (los dos modos):

- **Pack:** cuatro chips `2x1 · 3x1 · 4x1 · 5x1` (`MULTIPLICADORES`, `nombreDeEspecial`),
  2x1 elegido por defecto.
- **Precio del pack:** `TextInput`, placeholder «Precio del pack, p. ej. $10.000».
- **Unidades \*:** `TextInput` con `keyboardType="number-pad"`, placeholder «Unidades \*».
  Con un número válido, la ayuda «= {cupo × multiplicador} entradas ({cupo} pack|packs de
  {multiplicador})».
- Con `moneda` y `montoDesdePrecio(precio) > 0`: «Cada pack se cobrará
  {formatearMonto(monto, moneda)} (incluye 10% de recargo de la plataforma)».
- **Nombre:** `TextInput` opcional, placeholder «Nombre (opcional) — {N}x1».
- Botón **«✓ Confirmar ticket especial»** con fondo `colors.especial` y texto
  `colors.especialContenido`. Sin apretarlo, el pack no existe (patrón W-240). Antes de
  agregar, `validarBorradorEspecial`; si da texto, se muestra en rojo y no se agrega. Al
  agregar, el formulario vuelve a 2x1 y vacío.

**Modo `borrador`:** con la lista vacía, «Sin ticket especial todavía.». Cada borrador es una
fila con el nombre (o `{N}x1`) en `colors.especial`, «{precio} · {cupo} packs = {cupo × N}
entradas» y «Quitar». No se editan en línea: para cambiar uno se quita y se vuelve a
confirmar. **Por qué no se copia la edición en línea de la web:** `PreventasEvento` en
borrador tampoco la tiene en la app (`PreventasEvento.tsx:31-45`), y mantener los dos bloques
iguales pesa más que ahorrar un toque.

**Modo `enVivo`:** `useEspeciales(eventoId)`. Cada vez que la lista cambia (carga, alta,
edición, cierre) llama `onCambio?.(especiales)`. Una fila por pack:

- Nombre en `colors.especial` y «(cerrado)» si `activa` es `false`.
- Multiplicador: chips editables solo si `activa && vendidos === 0`; si no, el texto `{N}x1`.
  **Por qué:** cambiarlo después de vender cambiaría cuántas entradas vale una compra ya hecha
  (`tickets.cantidad` guarda entradas, W-252 §2).
- Precio editable mientras `activa`, guardado en `onEndEditing`; sin número, vuelve al valor
  anterior con «El precio del pack necesita un número».
- «{vendidos} vend. /» y cupo editable mientras `activa`, guardado en `onEndEditing`; vacío,
  `<= 0` o menor que `vendidos` vuelve al anterior con «El cupo no puede quedar vacío» o «El
  cupo no puede bajar de {vendidos}: ya se vendieron».
- «Cerrar» (solo `activa`): `confirmar({ title: '¿Cerrar "{nombre}"?', message: 'Deja de
  venderse aunque le queden packs — no se puede reabrir desde acá.', destructive: true })` y
  `cerrar(id)`.
- Debajo, el formulario de alta, que llama `crear`.
- Mientras una escritura está en curso, todo el bloque queda deshabilitado (estado `ocupado`,
  como la web).

### `src/screens/CrearEventoScreen.tsx`

- Etiqueta del precio (`:416`): «Precio puerta/General \*». El asterisco se mantiene porque
  al crear el precio es obligatorio en la app (spec 136); el texto es el literal de W-257.
- Se borran los chips «General» / «Puerta» (`:424-438`) y el estado `tipoPrecio` (`:74`).
  Nuevos estados: `preventaOn` (false), `especialOn` (false), `especiales:
  BorradorEspecial[]` ([]). `tipoPrecio` se deriva (Decisión 2).
- Debajo del aviso `sinMonto` (`:439-441`), los dos interruptores (Decisión 2). Con
  `preventaOn`, `PreventasEvento` en `borrador` (lo de `:442-447`, sin la etiqueta
  «Preventas» suelta: el título lo da la fila del interruptor). Con `especialOn`,
  `TicketsEspecialesEvento` en `borrador`.
- Guardado (`:207-214`): la condición de preventas pasa a `preventaOn && preventas.length >
  0`; después, el bloque de packs de la Decisión 5.

### `src/screens/EditarEventoScreen.tsx`

- Etiqueta (`:228`): «Precio puerta/General \*».
- Se borran los chips (`:236-250`) y el estado `tipoPrecio` (`:68`). `preventaOn` arranca en
  `evento?.tipoPrecio === 'puerta'`; `tipoPrecio` se deriva.
- Estado del pack: `especialOn` (false), `especialesCargados` (false),
  `hayEspecialesActivos` (false). Al montar, `listarEspeciales(evento.id)` una vez:
  `especialOn = lista.length > 0`, `hayEspecialesActivos = lista.some(e => e.activa)`; error
  → `console.error`; siempre `especialesCargados = true`. El `Switch` de pack queda
  `disabled` mientras `!especialesCargados || hayEspecialesActivos`, y con
  `hayEspecialesActivos` muestra «Cierra los packs para apagarlo» en `colors.especial`.
  **Por qué bloqueado:** apagar el interruptor no debe cerrar packs que ya se venden; cerrar
  es una acción explícita por pack (W-256 §3).
- Con `preventaOn`, `PreventasEvento` en `enVivo` (lo de `:254-259`). Con `especialOn`,
  `TicketsEspecialesEvento` en `enVivo` con `moneda={evento.moneda}` y
  `onCambio={(l) => setHayEspecialesActivos(l.some((e) => e.activa))}`.
- `handleGuardar` (`:105-150`) no cambia: manda el `tipoPrecio` derivado. Los packs en vivo se
  guardan solos, fila por fila, como las preventas.

Los hooks y estados nuevos van antes de cualquier `return` temprano de las dos pantallas.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. `rg "'General'|'Puerta'" src/screens/CrearEventoScreen.tsx src/screens/EditarEventoScreen.tsx`
   sin resultados, y `rg "Precio puerta/General"` encuentra una línea en cada pantalla.
4. Crear con los dos interruptores apagados deja `tipo_precio = 'general'` y ninguna fila en
   `event_preventas` ni en `event_tickets_especiales` para ese evento.
5. Encender «Preventa», confirmar una preventa y publicar deja `tipo_precio = 'puerta'` y la
   preventa en `event_preventas`.
6. Encender «Ticket especial», elegir 3x1, precio `$10.000`, unidades `5`: la ayuda dice
   «= 15 entradas (5 packs de 3)». Confirmar y publicar deja una fila con
   `multiplicador = 3`, `cupo = 5`, `nombre = '3x1'` y `monto = montoDesdePrecio('$10.000')`.
7. Confirmar un 2x1 y apagar el interruptor antes de publicar: no se crea ninguna fila en
   `event_tickets_especiales`.
8. Confirmar sin unidades muestra «Faltan las unidades — cuántos packs vendes (un entero mayor
   que 0)» y no agrega el pack.
9. Editar un evento `puerta` con un pack activo: los dos interruptores encendidos, el de pack
   deshabilitado con «Cierra los packs para apagarlo»; el pack muestra «0 vend. /» y su cupo;
   «Cerrar» lo deja `activa = false` y el interruptor se habilita.
10. Con un pack de `vendidos > 0`, el multiplicador se ve como texto, no como chips.
11. Solo cambian o se crean los cuatro archivos de `> Capa:`.

## Fuera de alcance

- Lo que ve y compra el fan: spec 166. La píldora de la cartelera: spec 167.
- Leer `paises_cobro` en el formulario de crear para mostrar el monto cobrado: la app no lo
  hace tampoco para el precio general ni las preventas (W-168 no se portó; spec 136, Fuera de
  alcance).
- Editar en línea los borradores de packs y de preventas.
- Reabrir un pack cerrado: la web tampoco lo permite.

## Verificación manual (candidatas a `V#` en `specs/PENDIENTES.md`)

- **V-candidata 165-a:** en un teléfono, crear un evento con preventa y un 2x1 de 3 unidades,
  abrir `sonopolis.org/eventos/<id>/editar` y ver los dos interruptores encendidos y el pack
  con «0 vend. / 3». Borrar el evento al terminar.
- **V-candidata 165-b:** en el build web de la app, cerrar un pack desde Editar: el
  `window.confirm` aparece, el pack pasa a «(cerrado)» y el interruptor se desbloquea.
