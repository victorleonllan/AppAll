# Spec 125 — `useMisEntradas`: las entradas propias, con su token QR, para la app

> Estado: propuesto (16-oct-2026)
> Capa: LÓGICA. `src/hooks/useMisEntradas.ts` (nuevo).
> Depende de: — (lee `tickets` y `ticket_items`, que ya están en producción con su RLS).
> Alimenta: la pantalla `MisEntradas` (spec 126) y la «próxima entrada» del panel de fan (spec 124), si la quiere reusar.
> Hermano en la web: W-076 / W-091 (`sonopolisWeb/libs/data/tickets.js` → `getMisEntradas`, `app/(private)/mis-entradas/page.js`).

> **En una frase:** un hook nuevo devuelve las entradas (`ticket_items`) de quien tiene la
> sesión, con folio, token QR, estado de puerta y los datos del evento, separadas en
> próximas y pasadas, más las compras pagadas cuyas entradas todavía no se emitieron.

## Contexto

En la web, quien compra ve sus entradas en `/mis-entradas`, un talón por entrada con su
QR (W-076, rediseño W-091). La app no tiene nada equivalente: hoy, después de pagar, el fan
no tiene dónde mostrar su entrada en la puerta. Lo único parecido es
`EventosContext.getTicketsByUser` (`src/context/EventosContext.tsx:269`), que filtra un
arreglo `tickets` que solo se llena con lo creado en memoria durante la sesión; no lee la
base.

Este spec trae los datos. La pantalla es el spec 126.

### RLS: la sesión de la app sí puede leerlas, sin cambios de datos

Verificado contra las migraciones (16-oct-2026):

- `tickets`: `tickets_select_own` (`USING (auth.uid() = user_id)`, baseline
  `20260608000000_…sql:104`) deja ver las compras propias. Además existe
  `tickets_select_event_team` (`can_edit_event(evento_id)`, spec 038).
- `ticket_items`: `ti_select` (`20260811013847_spec_036_…sql:137`) deja ver una entrada si
  quien pregunta es del equipo del evento **o** es el comprador del ticket.

Con eso, la app (cliente `anon` + JWT de la sesión) lee sus entradas sin migración nueva.

⚠️ **El filtro por dueño es obligatorio, no decorativo.** El comentario de la web
(`libs/data/tickets.js`, «el filtro es solo por claridad») vale solo para un fan. Las dos
policies son un OR: un músico o un local que está en el equipo de un evento ve **todas**
las entradas de ese evento. Sin `.eq('ticket.user_id', userId)`, la lista «mis entradas»
de un músico mostraría los QR de todos sus compradores, y cualquiera de esos QR entra por la
puerta. Por la misma razón, la consulta de `tickets` filtra `user_id`.

## Diseño

### Archivo y firma

`src/hooks/useMisEntradas.ts`, mismo patrón que `src/hooks/useEntradasEvento.ts`
(hook aparte, no función de un contexto: son datos de una pantalla, no estado global).

Las interfaces se exportan desde el hook, como `CompraSinEmitir` en
`useEntradasEvento.ts`, y **no** se agregan a `src/types/index.ts`. AGENTS.md pide los
tipos en ese archivo, pero el precedente del spec 039 ya existe y esta fase corre muchos
specs en paralelo: tocar `types/index.ts` desde cada uno los obliga a ir en fila. Reusa sin
editarlos `TicketItemStatus` y `EventoStatus` de `../types`.

```ts
export interface EventoDeEntrada {
  id: string;
  artista: string;            // events.artist_name
  venueId: string | null;
  venueName: string;
  imagen: string | null;
  fecha: string;              // texto tal como lo escribió el organizador
  hora: string;
  comienzaAt: string | null;  // ISO; null en eventos viejos sin comienza_at
  genero: string | null;
  status: EventoStatus;       // 'cancelled' se muestra en el talón
  pais: string | null;
}

export interface EntradaPropia {
  id: string;
  ticketId: string;
  eventoId: string;
  folio: number;
  qrToken: string;
  status: TicketItemStatus;   // 'valid' | 'used' | 'void'
  redeemedAt: string | null;
  evento: EventoDeEntrada | null; // null si el evento no se pudo leer
}

/** Compra pagada (`tickets.status = 'completed'`) sin ticket_items todavía. */
export interface CompraEnEmision {
  ticketId: string;
  eventoId: string;
  cantidad: number;
  evento: EventoDeEntrada | null;
}

export interface MisEntradasState {
  cargando: boolean;
  error: string | null;
  proximas: EntradaPropia[];
  pasadas: EntradaPropia[];
  comprasEnEmision: CompraEnEmision[];
  refrescar: () => Promise<void>;
}

export function useMisEntradas(): MisEntradasState;
```

`userId` sale de `useAuth().user?.id`. Sin sesión: listas vacías, `cargando: false`,
`error: null`, y **ninguna** consulta.

### Consultas

1. En paralelo (`Promise.all`):
   - Entradas:
     ```ts
     supabase.from('ticket_items')
       .select('id, ticket_id, evento_id, folio, qr_token, status, redeemed_at, ticket:tickets!inner(user_id)')
       .eq('ticket.user_id', userId)
     ```
   - Compras pagadas:
     ```ts
     supabase.from('tickets')
       .select('id, evento_id, cantidad')
       .eq('user_id', userId)
       .eq('status', 'completed')
     ```
     Se quedan solo las que no tienen ninguna fila en el resultado anterior
     (`ticket_id` no presente). Es el estado «pagada, entradas en camino» que el spec 037
     distingue de `pending`: la emisión ocurre al confirmar el pago, y entre la vuelta de
     Mercado Pago y la emisión pasan segundos. Las `pending` no se muestran: son
     reservas sin pagar que caducan solas (spec 088).
2. Eventos de las dos listas, en una sola consulta:
   ```ts
   supabase.from('events')
     .select('id, artist_name, venue_id, venue_name, imagen, fecha, hora, comienza_at, genero, status, pais')
     .in('id', idsUnicos)
   ```
   Se omite si no hay ids. `events_select` (spec 033) deja ver todo lo que no es `draft`,
   incluidos los cancelados, que es justo lo que el talón necesita mostrar.

### Próximas y pasadas

Una entrada es **pasada** solo si su evento tiene `comienzaAt` y
`Date.parse(comienzaAt) < Date.now() - 12 h`. Todo lo demás es **próxima**: incluidos los
eventos sin `comienza_at` y las entradas cuyo evento no se pudo leer.

**Por qué 12 horas y no «ya empezó»:** el uso principal de esta lista es en la puerta.
Un show de las 21:00 no puede saltar a «Pasadas» a las 21:01, mientras la persona está en
la fila con el teléfono en la mano. 12 h cubre la noche completa. Constante nombrada:
`MARGEN_PASADA_MS = 12 * 60 * 60 * 1000`.

**Por qué los `null` van a próximas:** sin fecha confiable no se puede afirmar que ya
pasó, y esconder una entrada válida es peor que mostrar una vieja.

Orden:

- `proximas`: por `comienzaAt` ascendente (los `null` al final), y dentro del mismo evento
  por `folio` ascendente.
- `pasadas`: por `comienzaAt` descendente, luego `folio` ascendente.

### Errores y recargas

- Sin `catch {}` silencioso (mismo criterio que `useEntradasEvento`, spec 039, y que el
  spec 115): cualquier error de las tres consultas deja `error` con el mensaje de
  Supabase o `'No se pudieron cargar tus entradas'`.
- **Un error no borra lo ya cargado.** Si la recarga falla, `proximas`, `pasadas` y
  `comprasEnEmision` conservan el último resultado bueno. El motivo es la puerta: con mala
  señal, tirar para recargar no puede hacer desaparecer el QR que ya estaba en pantalla.
- Carga al montar y cada vez que cambia `userId` (`useEffect`). `refrescar` vuelve a
  correr las tres consultas.
- Respuestas fuera de orden: si `userId` cambia mientras una carga está en vuelo (cerrar
  sesión y entrar con otra cuenta), el resultado de la carga vieja se descarta. Se resuelve
  con un contador en `useRef` que se incrementa en cada carga; solo la última escribe
  estado.
- Al cerrar sesión (`userId` pasa a `undefined`) las listas se vacían en el acto: los QR de
  la cuenta anterior no pueden quedar a la vista.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio.
2. `git diff --stat` toca solo `src/hooks/useMisEntradas.ts`.
3. La consulta de `ticket_items` lleva `.eq('ticket.user_id', userId)` y la de `tickets`
   lleva `.eq('user_id', userId)` (revisión del código).
4. Con una cuenta que compró y que además está en el equipo de otro evento con ventas, el
   hook devuelve solo las entradas que compró esa cuenta (no las de sus compradores).
5. Una compra `completed` sin `ticket_items` aparece en `comprasEnEmision` y no en las
   listas de entradas; una `pending` no aparece en ningún lado.
6. Una entrada de un evento con `comienza_at` hace 3 h está en `proximas`; una de hace 2
   días, en `pasadas`.
7. Con la red cortada, `refrescar()` deja `error` con texto y conserva las entradas que ya
   estaban.
8. Sin sesión no se dispara ninguna consulta (pestaña de red o log del cliente).

## Fuera de alcance

- La pantalla, el QR y los puntos de entrada: spec 126.
- **Ver las entradas sin conexión** (guardarlas en `AsyncStorage`). Hoy, si la app se abre
  en frío sin señal, no hay entradas que mostrar. Es una mejora real para la puerta, pero
  guardar tokens de entrada en el dispositivo es una decisión de producto aparte (quién más
  usa ese teléfono). Queda como pregunta abierta.
- Compras de invitado (`tickets.guest_email`, spec 046) hechas con el correo de una cuenta
  que **ya existía**: el trigger `claim_guest_tickets` solo corre al crear la cuenta, así que
  esas compras no tienen `user_id` y no aparecen. Es una limitación de la capa de datos, no
  de este hook.
- Reenviar el correo de la entrada: spec 139 (lado del organizador).
- Mostrar el precio pagado por entrada (`tickets.monto / cantidad`, que la web calcula en
  `getEntradasEvento`): el talón de la web tampoco lo muestra.

## Verificación manual (V# candidatas)

- **V-125a** — Con una cuenta de prueba que tenga una compra real `completed`, abrir la app
  (spec 126) y comparar folio y token con `/mis-entradas` de la web: deben coincidir uno a
  uno.
- **V-125b** — Con una cuenta que sea colaboradora de un evento con ventas de terceros,
  confirmar que esas entradas ajenas no aparecen.
