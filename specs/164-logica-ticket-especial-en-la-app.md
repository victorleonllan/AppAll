# Spec 164 — La app lee, escribe y compra el ticket especial (packs 2x1 a 5x1) con destinatarios

> Estado: aplicado (13-nov-2026) — tsc limpio, export web OK, `especiales_vigentes_de` responde 200 `[]` con la anon key, `primerDestinatarioInvalido` da 2 y -1 (criterio 6), `destinatarios` solo viaja con `especialId`; sin cambios en `src/types/index.ts`.
> Capa: LÓGICA. `src/lib/especiales.ts` (nuevo), `src/hooks/useEspeciales.ts` (nuevo), `src/hooks/useEspecialesVigentes.ts` (nuevo), `src/lib/pagoCompra.ts`.
> Depende de: spec 151 (aplicado: `crearPagoCompra`), W-252 y W-258 aplicados y pusheados (tabla `event_tickets_especiales`, `tickets.especial_id`, `tickets.destinatarios_extra`), W-253 y W-259 aplicados (`especiales_vigentes_de` en la base; `create-preference` y `create-payment-flow` desplegadas con `especialId` y `destinatarios`).
> Alimenta: spec 165 (el organizador crea packs), spec 166 (el fan compra un pack), spec 167 (píldora en la cartelera).
> Hermano en la web: `libs/data/especiales.js`, `libs/mappers.js` (`mapEspecialFromDB`) y `crearPagoCompra` / `mensajeDeError` de `libs/purchase.js` (W-254, W-255, W-259, W-260).

> **En una frase:** un módulo sin pantalla que lee y escribe los packs de un evento, lista
> los que el fan puede comprar y el pack con que se compró un ticket; dos hooks para las
> pantallas; y `crearPagoCompra` aprende a mandar `especialId` y `destinatarios`, con los
> mensajes de los errores nuevos.

## Contexto

La web vende desde el 24-oct-2026 un **ticket especial**: un pack promocional 2x1, 3x1, 4x1
o 5x1 (el fan paga un precio y entra con N personas), con cupo propio contado en packs, que se
vende **en paralelo** con la entrada normal (decisión de Victor, 23-oct-2026, W-252). Desde el
25-oct-2026 el comprador de un pack puede escribir el correo de quien recibe cada entrada extra
(W-258..W-260). La app no sabe nada de esto: compra siempre una entrada normal con
`cantidad: 1` (spec 160, Fuera de alcance).

**La base y las Edge Functions ya están listas; este spec no las toca:**

- `event_tickets_especiales` (W-252): `id, event_id, nombre, multiplicador (2..5), precio`
  (texto con formato), `monto` (entero del pack, con recargo), `cupo` (packs), `vendidos`
  (packs), `activa`, `created_at`. Lectura pública por RLS; alta, edición y baja con la
  misma policy que `event_preventas` (quien puede editar el evento). `tickets.especial_id`
  es `ON DELETE RESTRICT`: un pack con compras se cierra (`activa = false`), no se borra.
- `especiales_vigentes_de(p_event uuid)` (W-253 §1): devuelve
  `id, nombre, multiplicador, precio, monto, restantes, moneda` de los packs activos, con
  `restantes > 0` (ya descuenta los packs pendientes de pago dentro del TTL del spec 088) y
  solo mientras la venta del evento está abierta. Ejecutable por `anon` y `authenticated`.
- `create-preference` y `create-payment-flow` aceptan `especialId` opcional: con él,
  `cantidad` son **packs**, el tope de 10 se compara contra entradas (`packs × multiplicador`)
  y los errores nuevos son `especial_invalido`, `especial_cerrado` y `especial_agotado`, todos
  409 (`supabase/functions/create-preference/index.ts:117-147` y `:310-320`;
  `create-payment-flow/index.ts:105-134` y `:202-205`).
- Las dos aceptan `destinatarios` opcional (W-259 §1): se normaliza (trim, minúsculas, sin
  vacíos) y, sin `especialId`, con más correos que `entradas - 1` o con uno mal formado,
  responden 409 `destinatarios_invalidos` antes de reservar
  (`create-preference/index.ts:49-66` y `:150-154`). Si guardar la lista falla, 500
  `destinatarios_no_guardados` y cancelan el ticket (`:327-351`).
- Los correos a los destinatarios los manda la web desde `/api/entradas/enviar-confirmacion`,
  y esa ruta la llaman `webhook-mp` (`:79`), `confirm-payment` (`:54`) y `finalizarTicket`
  (`_shared/finalizarTicket.ts:39`) sin mirar desde dónde se compró. **Una compra hecha en la
  app con destinatarios ya genera los correos correctos**; la app solo tiene que mandar la
  lista.

Lo que hay hoy en la app:

- `crearPagoCompra` (`src/lib/pagoCompra.ts:29-91`) manda
  `{ evento_id, user_id, cantidad, origen? }` y nada más.
- `mensajeErrorPago` (`src/lib/pagoCompra.ts:95-113`) no conoce los códigos del pack ni
  `destinatarios_invalidos`: hoy caerían en «No se pudo procesar la compra».
- `usePreventas` (`src/hooks/usePreventas.ts`) es el molde de lectura y escritura de una
  tabla hija del evento (mapper, insert secuencial del borrador después del evento, update
  parcial que recalcula `monto` solo si viene `precio`, cierre con `activa = false`).
- `montoDesdePrecio` y `formatearMonto` ya existen en `src/lib/precio.ts:17` y `:37`.

## Decisiones

### 1. Un módulo `src/lib/especiales.ts` con sus propios tipos

Port de `sonopolisWeb/libs/data/especiales.js` con las mismas funciones y textos. **Los tipos
viven en el módulo y no en `src/types/index.ts`:** el pack no lo usa nadie fuera de este
módulo y de sus pantallas, y `src/types/index.ts` lo tocan casi todos los specs; declararlo ahí
obligaría a serializar este spec con cualquier otro que agregue un tipo.

**Se descartó** reutilizar `usePreventas` con un parámetro de tabla: la escalera de preventas
tiene `orden`, nombre automático y regla de cierre; el pack no tiene ninguna de las tres. Es
el mismo motivo por el que W-252 hizo una tabla aparte.

### 2. Lado del fan: si falla, lista vacía

`getEspecialesVigentes` devuelve `[]` ante cualquier error, como la web
(`libs/data/especiales.js`, comentario de `getEspecialesVigentes`): un pack que no se pudo
consultar es un pack que no se ofrece, y el detalle del evento se ve como antes. Lo mismo
`getPacksMinimosDeEventos` (Map vacío) y `getPackDeTicket` (sin pack ni destinatarios): son
extras que nunca deben romper la cartelera ni la confirmación.

Lado del organizador (`listarEspeciales`, `crearEspecial`, `actualizarEspecial`): **lanzan**,
como `usePreventas`. Quien edita necesita saber que no se guardó.

### 3. `crearPagoCompra` decide qué viaja, no la pantalla

- `especialId` viaja solo si viene (no `null`).
- `destinatarios` viaja solo con `especialId` y solo los no vacíos tras `trim`; sin ninguno,
  el cuerpo no lleva el campo. **Por qué la regla va acá y no en la pantalla:** la Edge
  Function responde 409 a destinatarios sin pack (W-259 §1); igual que el `origen`
  (spec 151, Diseño), es una regla del contrato con la función, y dejarla en la pantalla
  obliga a repetirla en cada llamador (compra con un clic y auto-compra tras el enlace
  mágico).
- Sin `especialId` ni `destinatarios`, el cuerpo es byte a byte el de hoy.

### 4. Mensajes de los errores nuevos

Los mismos textos que `mensajeDeError` de la web, salvo uno:

| Código | Texto |
|---|---|
| `especial_agotado` | «Se agotaron los packs. Elige otra opción.» |
| `especial_cerrado` | «Este pack ya no está a la venta.» |
| `especial_invalido` | «Este pack ya no existe. Elige otra opción.» |
| `destinatarios_invalidos` | «Revisa los correos de las otras entradas.» |

**Por qué `especial_invalido` cambia «Recarga la página» por «Elige otra opción»:** en la app
no hay página que recargar; el spec 166 vuelve a pedir la lista de packs cuando llega uno de
estos tres códigos, así que la lista que ve el fan ya está al día. `destinatarios_no_guardados`
no tiene texto propio, como en la web: cae en «No se pudo procesar la compra».

### 5. Validación de correo en el cliente: la misma regex de la web

`CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` (BotonComprar.js de la web, W-260). Solo marca
lo que claramente no es un correo; la validación que manda es la de la Edge Function y la del
CHECK de W-258.

## Cambios por archivo

### `src/lib/especiales.ts` (nuevo)

```ts
import { supabase } from './supabase';
import { montoDesdePrecio } from './precio';

/** Fila de `event_tickets_especiales` (W-252). `cupo` y `vendidos` cuentan packs. */
export type TicketEspecial = {
  id: string; eventId: string; nombre: string; multiplicador: number;
  precio: string; monto: number; cupo: number; vendidos: number;
  activa: boolean; createdAt: string;
};

/** Pack armado en el formulario antes de que el evento exista. */
export type BorradorEspecial = { multiplicador: number; precio: string; cupo: number; nombre: string };

/** Fila de `especiales_vigentes_de` (W-253 §1). */
export type EspecialVigente = {
  id: string; nombre: string; multiplicador: number; precio: string;
  monto: number; restantes: number; moneda: string | null;
};

export const MULTIPLICADORES = [2, 3, 4, 5] as const;
export const nombreDeEspecial = (multiplicador: number) => `${multiplicador}x1`;
/** «3x1», o «Amigos (3x1)» si el organizador le puso nombre propio. */
export function etiquetaDeEspecial(e: { nombre: string | null; multiplicador: number }): string
/** Tope de create-preference (MAX_CANTIDAD_POR_COMPRA): 10 entradas por compra. */
export const TOPE_ENTRADAS_POR_COMPRA = 10;
/** Packs que caben en una compra: 10 / 3 → 3. Mínimo 1. */
export const maxPacksPorCompra = (multiplicador: number) => Math.max(1, Math.floor(10 / multiplicador));

/** Texto del error o null. Mismos textos que `validar` de TicketsEspecialesManager.js. */
export function validarBorradorEspecial(b: { precio: string; cupo: number | null }): string | null

export const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Índice del primer correo escrito y mal formado, o -1. Los vacíos no cuentan. */
export function primerDestinatarioInvalido(valores: string[]): number

// --- Organizador (lanzan) ---
export async function listarEspeciales(eventoId: string): Promise<TicketEspecial[]>
export async function crearEspecial(eventoId: string, b: BorradorEspecial): Promise<TicketEspecial>
export async function actualizarEspecial(id: string, cambios: CambiosEspecial): Promise<TicketEspecial>
export async function cerrarEspecial(id: string): Promise<TicketEspecial>
export async function crearEspecialesDeBorrador(eventoId: string, borradores: BorradorEspecial[]): Promise<TicketEspecial[]>

// --- Fan (nunca lanzan) ---
export async function getEspecialesVigentes(eventoId: string): Promise<EspecialVigente[]>
export async function getPacksMinimosDeEventos(eventoIds: string[]): Promise<Map<string, number>>
export async function getPackDeTicket(ticketId: string): Promise<{
  especial: { nombre: string; multiplicador: number } | null;
  cantidad: number | null;
  destinatariosExtra: string[];
}>
```

Reglas de cada función, copiadas de la web:

- `validarBorradorEspecial`: `montoDesdePrecio(precio) <= 0` → «Falta el precio del pack —
  escribe un número, p. ej. $10.000»; `cupo` no entero o `<= 0` → «Faltan las unidades —
  cuántos packs vendes (un entero mayor que 0)». Se valida en el cliente porque la base lo
  rechaza recién por CHECK (`cupo > 0`, `monto > 0`), con el evento ya creado.
- `crearEspecial`: inserta `{ event_id, nombre: nombre.trim() || nombreDeEspecial(m),
  multiplicador, precio, monto: montoDesdePrecio(precio), cupo }` con `.select().single()`.
  `monto` sale de `montoDesdePrecio`, la misma fórmula de las preventas: el pack no tiene
  fórmula propia (W-254).
- `actualizarEspecial`: update parcial; `monto` se recalcula solo si viene `precio` (mismo
  cuidado que `usePreventas.actualizar`, `src/hooks/usePreventas.ts`: sin eso
  `montoDesdePrecio(undefined)` daría 0). `CambiosEspecial =
  Partial<Pick<TicketEspecial, 'precio' | 'cupo' | 'multiplicador' | 'nombre' | 'activa'>>`.
- `cerrarEspecial`: `actualizarEspecial(id, { activa: false })`. Nunca borra.
- `crearEspecialesDeBorrador`: valida **todos** los borradores con
  `validarBorradorEspecial` antes del primer insert (lanza `Error` con el primer texto), y
  después inserta de a uno, en orden. Secuencial para que un fallo deje un estado claro: los
  anteriores creados, el resto no (comentario de `FormEvento.js:338-344` de la web). Se llama
  después del insert del evento: la RLS exige poder editar un evento que tiene que existir.
- `getEspecialesVigentes`: `supabase.rpc('especiales_vigentes_de', { p_event: eventoId })`,
  mapea a `EspecialVigente` (`moneda ?? null`); error → `console.error` y `[]`.
- `getPacksMinimosDeEventos`: lee la **tabla**, no la función, por lotes de 50 ids
  (`.in('event_id', lote).eq('activa', true)`, columnas `event_id, multiplicador, cupo,
  vendidos`), descarta `vendidos >= cupo` en el cliente (PostgREST no compara dos columnas) y
  devuelve el multiplicador más chico por evento. Es más laxa que la función (no mira
  pendientes ni el cierre de la venta), y alcanza para una píldora: quien decide qué se compra
  es el detalle. Una consulta por lote, no una por tarjeta (W-255 §5).
- `getPackDeTicket`: `tickets.select('especial_id, cantidad, destinatarios_extra')` del
  ticket; si hay `especial_id`, lee `nombre, multiplicador` de `event_tickets_especiales`.
  `destinatariosExtra` es `[]` si la columna viene `null`. Cualquier error → los tres campos
  vacíos y `console.error`. RLS: el dueño del ticket ya lo lee con su sesión (la
  confirmación lee `tickets.status` así, `src/screens/ConfirmacionCompraScreen.tsx:150-155`).

### `src/hooks/useEspeciales.ts` (nuevo)

Equivale a `usePreventas` para los packs, para el modo en vivo del formulario (spec 165):

```ts
export function useEspeciales(eventoId: string | null | undefined): {
  especiales: TicketEspecial[];
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  crear: (b: BorradorEspecial) => Promise<TicketEspecial>;
  actualizar: (id: string, cambios: CambiosEspecial) => Promise<TicketEspecial>;
  cerrar: (id: string) => Promise<TicketEspecial>;
}
```

Sin `eventoId` no consulta (lista vacía, `cargando: false`). Lista ordenada por
`created_at` ascendente, como la web. `crear`, `actualizar` y `cerrar` actualizan el estado
local con la fila que devuelve la base y relanzan el error.

### `src/hooks/useEspecialesVigentes.ts` (nuevo)

```ts
/** `null` mientras carga; `[]` sin packs, si falló o con `eventoId` null (no consulta). */
export function useEspecialesVigentes(eventoId: string | null): {
  especiales: EspecialVigente[] | null;
  recargar: () => void;
}
```

`null` mientras carga, y no `[]`, porque la auto-compra tras el enlace mágico (spec 166) tiene
que esperar a saber si el pack pedido sigue a la venta, igual que hoy espera a las pasarelas
(`src/screens/DetalleEventoScreen.tsx:178`). Patrón de cancelación del efecto igual que
`usePrecioVigente` (`src/hooks/usePrecioVigente.ts:20-60`). `recargar` sube un contador que
vuelve a correr el efecto.

### `src/lib/pagoCompra.ts`

- `crearPagoCompra` suma dos argumentos opcionales:
  `especialId?: string | null` y `destinatarios?: string[]`. Con `especialId`, `cantidad` son
  packs (contrato de W-253). El cuerpo agrega
  `...(especialId ? { especialId } : {})` y, solo con `especialId` y al menos un correo no
  vacío tras `trim`, `destinatarios: <esos correos, en orden>`. El resto de la función no
  cambia. Comentario arriba: `// Spec 164 — W-253 / W-259`.
- `mensajeErrorPago` suma los cuatro `case` de la Decisión 4.
- La cabecera del archivo deja de decir «Sin llamadores hasta el spec 160» (ya los tiene).

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. Con la anon key de producción, `curl -X POST
   "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/rpc/especiales_vigentes_de" -d '{"p_event":"<uuid de un
   evento sin packs>"}'` responde `200` con `[]`: la función que llama
   `getEspecialesVigentes` existe con ese nombre de argumento.
4. `rg "especialId|destinatarios" src/lib/pagoCompra.ts` muestra que `destinatarios` solo se
   agrega dentro de la rama con `especialId`, y que sin los dos argumentos el `JSON.stringify`
   produce las mismas claves que antes (`evento_id`, `user_id`, `cantidad`, `origen?`).
5. `mensajeErrorPago(new ErrorPago('especial_cerrado', 409, ''))` devuelve «Este pack ya no
   está a la venta.», y con `'destinatarios_invalidos'` «Revisa los correos de las otras
   entradas.» (verificable con un script `npx tsx` de una línea o leyendo el `switch`).
6. `primerDestinatarioInvalido(['', 'ana@mail.com', 'ana@'])` devuelve `2`;
   `primerDestinatarioInvalido(['', 'ana@mail.com'])` devuelve `-1`.
7. Solo cambian o se crean los cuatro archivos de `> Capa:`; `rg "especial" src/types/index.ts`
   sin resultados nuevos.

## Fuera de alcance

- Pantallas: formulario del organizador (165), detalle y confirmación (166), cartelera
  (167).
- Base de datos y Edge Functions: ya desplegadas con W-252, W-253, W-258 y W-259. No hay
  `db push` ni `functions deploy` en este spec.
- Elegir cantidad en la entrada general (stepper de W-087): sigue en 1, como dejó el spec 160.
- El texto con el detalle de `sin_cupo` («quedan 2 de 40») que la web repite: no es parte del
  pack.

## Verificación manual (candidatas a `V#` en `specs/PENDIENTES.md`)

- Ninguna propia: este spec no tiene pantalla. Su prueba real es la compra de 166.
