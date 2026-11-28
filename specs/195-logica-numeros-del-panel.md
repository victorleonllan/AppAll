# Spec 195 — Los números del panel de local y de músico en la app

> Estado: aplicado (28-nov-2026) — `npx tsc --noEmit` limpio; greps de los criterios 2 y 4 conformes; los casos del criterio 3 pasan con `npx tsx` en `America/Santiago`, `UTC` y `Pacific/Auckland`. `usePanel` solo por lectura y `tsc`. Sin probar contra la base ni en un dispositivo (V 195-a en `PENDIENTES.md`).
> Capa: LÓGICA. `src/lib/panel.ts` (nuevo), `src/hooks/usePanel.ts` (nuevo).
> Depende de: — (usa `useSolicitudes` del spec 131 y `useContactosCrm` del spec 149, ya aplicados, sin cambiarlos).
> Alimenta: spec 204 (FRONTEND).
> Hermano en la web: `libs/panel.js` (W-326), y lo que leen `app/(private)/musico/page.js` (W-329) y `app/(private)/local/page.js` (W-330); el conteo de solicitudes por responder de la barra lateral (W-327).

> **En una frase:** las cuentas del panel —solicitudes por responder, entradas vendidas por
> evento, cobrado del mes, contactos nuevos del mes, ventas recientes— pasan a funciones
> puras en `src/lib/panel.ts`, y un hook `usePanel` lee los datos con la sesión de la app y
> acepta una solicitud con la función que ya existe.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después
de esta orquestación.»

La web rediseñó los paneles (W-326 a W-330): cada uno abre con números que dicen qué espera
respuesta y qué se vendió. La app tiene tres números sueltos (`DashboardLocalScreen.tsx`,
bloque «Resumen»: eventos publicados, entradas vendidas, recaudado) y dos filas en
`PerfilMusicoScreen.tsx` (bloque «Resumen»). Las dos pantallas repiten a mano la misma
consulta de `tickets` y suman `monto` sin separar monedas: un local con ventas en CLP y MXN
ve un solo número que es falso (W-168). La regla va a un solo lugar, como en la web, para que
las dos pantallas no digan cosas distintas.

## Decisión

Ningún dato nuevo en la base: todo sale de tablas y vistas que la app ya lee
(`tickets`, `events`, `booking_requests`, `crm_contactos`). La RLS ya deja leer lo necesario:
`tickets_select_event_team` da las ventas de los eventos donde soy parte del equipo (no solo
los que creé, el límite que anota el comentario de `DashboardLocalScreen.tsx`).

### 1. `src/lib/panel.ts` — puro, port de `sonopolisWeb/libs/panel.js`

Sin Supabase ni React: importa solo `../constants/paises` y `./precio` (los dos sin
imports), así se prueba con `npx tsx`. Ninguna función lee el reloj: reciben `ahora` (ISO).

Campos en camelCase (la web usa `evento_id`/`created_at` porque trabaja sobre filas crudas;
acá el hook mapea antes).

```ts
export interface VentaPanel {
  id: string;
  eventoId: string;
  status: TicketStatus;            // de src/types
  monto: number;
  moneda: string | null;
  cantidad: number | null;
  createdAt: string;
  compradorEmail: string | null;   // YA enmascarado (ver §2)
}

export function solicitudesPorResponder<S extends { status: string; createdBy: string }>(solicitudes: S[] | null | undefined, miUserId: string): S[];
export function vendidasPorEvento(ventas: VentaPanel[] | null | undefined): Record<string, number>;
export function claveMesEn(iso: string, pais: string | null | undefined): string;   // "2026-11" o ""
export function nombreMesEn(iso: string, pais: string | null | undefined): string;  // "noviembre" o ""
export function ventasDelMes(ventas: VentaPanel[] | null | undefined, pais: string | null | undefined, ahora: string): VentaPanel[];
export function contactosNuevosDelMes(contactos: { primerContacto: string | null }[] | null | undefined, pais: string | null | undefined, ahora: string): number;
export function porcentaje(parte: number, total: number): number;
export function ventasRecientes(ventas: VentaPanel[] | null | undefined, n?: number): VentaPanel[];   // n = 5
export function etiquetaEstadoVenta(status: string): string;
export function tonoEstadoVenta(status: string): 'success' | 'warning' | 'danger' | 'neutral';
export function textoProximoShow(comienzaAt: string | null | undefined, ahora: string, pais: string | null | undefined): string;
export function haceTiempo(iso: string | null | undefined, ahora: string): string;
export function enmascararEmail(email: string | null | undefined): string | null;
export function totalesPorMoneda(filas: { monto: number; moneda: string | null }[]): string;
export function armarNumerosPanel<S extends { status: string; createdBy: string; createdAt: string }>(e: EntradaNumeros<S>): NumerosPanel<S>;
```

Reglas, iguales a W-326 salvo donde se dice:

- **`solicitudesPorResponder`**: `status === 'pending'` y `createdBy !== miUserId` (quien
  creó la fila no la responde, W-034; es el mismo criterio con que `SolicitudesScreen`
  decide entre «Aceptar/Rechazar» y «Cancelar»).
- **`vendidasPorEvento`**: suma `cantidad` (1 si falta) de las ventas `completed`, por
  `eventoId`. `pending` es una compra que no llegó.
- **`claveMesEn` / `nombreMesEn`**: en la zona del país (`PAISES[pais].zonaHoraria`, y
  `PAISES[PAIS_POR_DEFECTO]` si el país no está en el catálogo), con
  `Intl.DateTimeFormat('en-CA', { timeZone, year, month, day }).formatToParts` y
  `Intl.DateTimeFormat('es', { timeZone, month: 'long' })`. Se compara la clave, no se
  calcula el inicio del mes. Multipaís: se sigue a la web (zona del país del tenant) y no
  la hora del teléfono, porque «cobrado en noviembre» es el mes del local, no el de quien
  mira. La app ya depende de `Intl` con `timeZone` (`src/lib/redes/horario.ts`, spec 150;
  `src/lib/visitas.ts`, spec 171). Fecha ilegible → `""`.
- **`ventasDelMes`**: las `completed` con la misma `claveMesEn` que `ahora`.
- **`contactosNuevosDelMes`**: contactos con `primerContacto` en el mes de `ahora`; sin
  `primerContacto` no cuenta.
- **`porcentaje`**: entero redondeado; `0` si `total` es 0.
- **`ventasRecientes`**: las primeras `n` en el orden de llegada (el hook ordena por
  `created_at` descendente), sin filtrar estado.
- **`etiquetaEstadoVenta`**: `completed` → «Pagada», `pending` → «Pendiente», `refunded` →
  «Reembolsada», `cancelled` → «Cancelada», otro → el valor tal cual. Son estados de
  **ticket**, no de Mercado Pago (README, «Estados de ticket»).
- **`tonoEstadoVenta`**: `completed` → `success`, `pending` → `warning`,
  `refunded`/`cancelled` → `danger`, otro → `neutral`.
- **`textoProximoShow`**: «Es hoy», «Es mañana», «El siguiente es el {día de la semana}» (2 a
  6 días), «El siguiente es el {28 de noviembre}» (7 o más), `""` sin fecha. Días de
  calendario en la zona del país, con la misma resta de medianoches UTC de la web (sin el
  salto del cambio de horario).
- **`haceTiempo`** (port de `haceTiempo` de `sonopolisWeb/libs/fecha.js`, con `ahora` como
  parámetro en vez de `Date.now()`): menos de 1 h → «hace un momento»; menos de 24 h →
  «hace {h} h»; menos de 7 días → «hace {d} día|días»; si no, «hace {s} semana|semanas».
  `""` sin fecha.
- **`enmascararEmail`** (port literal de `sonopolisWeb/libs/privacidad.js`, W-187): primeros
  3 caracteres de la parte local (1 si tiene 3 o menos), asteriscos por el resto, `@` y
  dominio completos; sin `@` o con `@` al inicio, el texto tal cual; sin correo, `null`.
- **`totalesPorMoneda`**: misma regla que `formatearTotales` de `src/hooks/useAdminPagos.ts`
  (suma por moneda en el orden en que aparece, une con « + », `formatearMonto` de
  `./precio`; sin filas, `formatearMonto(0, null)`). Es una copia a propósito:
  `useAdminPagos.ts` importa el cliente de Supabase y no se puede importar desde un módulo
  que se prueba con `npx tsx` sin variables de entorno. Moverla a un solo lugar queda como
  deuda anotada en el cierre.

#### `armarNumerosPanel` — los números de una vez

```ts
export interface EventoPanel {
  id: string;
  comienzaAt?: string | null;
  status?: string;          // 'cancelled' no es un próximo show
  pais: string;
  monto?: number;           // 0 o ausente = sin venta de entradas
}

export interface EntradaNumeros<S> {
  eventos: EventoPanel[];                 // «mis eventos» de la pantalla
  cerrados: ReadonlySet<string>;          // ids con closed_at
  ventas: VentaPanel[] | null;            // null = no se pudo leer
  solicitudes: S[] | null;                // null = no se pudo leer
  contactos: { primerContacto: string | null }[] | null;   // null = no se pudo leer
  miUserId: string;
  pais: string;                           // país del tenant
  ahora: string;                          // ISO
}

export interface NumerosPanel<S> {
  activos: EventoPanel[];                 // sin closed_at, en el orden recibido
  proximosShows: number;                  // activos no cancelados
  notaProximoShow: string;                // textoProximoShow del próximo, o ""
  vendidasPorEvento: Record<string, number> | null;
  vendidasActivas: number | null;         // suma de vendidasPorEvento sobre activos
  nombreMes: string;                      // nombreMesEn(ahora, pais)
  cobradoMes: string | null;              // totalesPorMoneda(ventasDelMes(...))
  entradasPagadasMes: number | null;      // suma de cantidad (1 si falta) de ventasDelMes
  porResponder: S[] | null;               // solicitudesPorResponder
  masAntiguaPorResponder: string | null;  // createdAt más viejo de porResponder
  contactos: number | null;
  contactosNuevosMes: number | null;
  ventasRecientes: VentaPanel[] | null;   // ventasRecientes(ventas, 5)
}
```

- Un dato que no se pudo leer deja su número en `null` (la pantalla escribe «—»), nunca en
  0: un panel que dice «0 vendidas» cuando no pudo leer es peor que uno que dice que no sabe
  (misma regla que `useContactosCrm`, W-100).
- **Activos**: los eventos sin `closed_at`, como la web (W-173, `!e.cerradoAt`).
- **Próximo show** (desviación de la web, marcada): la web toma `activos[0]`; acá se toma el
  activo no cancelado con el `comienzaAt` más cercano que sea `>= ahora − 6 h` (el margen
  de la cartelera, spec 119). Así un evento ya pasado que nadie cerró no da «Es hoy» al día
  siguiente, y el orden en que llegan los eventos no importa. `proximosShows` cuenta los
  activos no cancelados con ese mismo corte (o sin fecha).
- `notaProximoShow` usa el `pais` del evento (el show es en su país), no el del tenant.

### 2. `src/hooks/usePanel.ts`

```ts
export function usePanel(
  tenant: { tipo: TipoTenant; id: string } | null,   // TipoTenant de useTenantCrm
  eventoIds: string[],
): {
  cargando: boolean;                   // true solo hasta la primera respuesta completa
  ventas: VentaPanel[] | null;         // null = error de lectura
  cerrados: ReadonlySet<string>;
  solicitudes: SolicitudBolo[] | null; // null = error de lectura
  contactos: ContactoCrm[] | null;     // null = error de lectura o sin tenant
  aceptarSolicitud: (id: string) => Promise<{ ok: true } | { ok: false; mensaje: string }>;
  recargar: () => Promise<void>;
};
```

- **Ventas y cierres**, en paralelo, con el cliente de `src/lib/supabase`, solo si
  `eventoIds` no está vacío (vacío → `ventas: []`, `cerrados` vacío, sin consultar):
  - `tickets.select('id, evento_id, status, monto, moneda, cantidad, created_at, comprador_email').in('evento_id', eventoIds).order('created_at', { ascending: false })`
    (las mismas columnas que `getVentasDeMisEventos`, W-326). El correo se enmascara con
    `enmascararEmail` **al mapear**: el correo completo nunca queda en el estado del
    componente.
  - `events.select('id, closed_at').in('id', eventoIds)`: el contexto de eventos no mapea
    `closed_at` (mismo motivo que `useAdminEventos.ts`), y sumarlo a `EventosContext.tsx`
    choca con el spec 188, único dueño de ese archivo en esta tanda. Si esta lectura falla,
    `cerrados` queda vacío y se registra con `console.error` (es un filtro, no un número:
    cuenta de más un evento cerrado en vez de ocultar el panel).
  - La dependencia del efecto es `eventoIds.join(',')`, no el arreglo (se recrea en cada
    render, mismo patrón que hoy en las dos pantallas).
- **Solicitudes**: `useSolicitudes()` sin cambiarlo; `solicitudes = error ? null :
  solicitudes`.
- **Contactos**: `useContactosCrm(tenant)` sin cambiarlo.
- **`aceptarSolicitud(id)`**: llama a `responder(id, 'accepted')` de `useSolicitudes` —la
  misma función que usa `SolicitudesScreen`, sin copia—. Con éxito `{ ok: true }` (el
  hook ya recarga la lista). Con error `{ ok: false, mensaje: err.message || 'No se pudo
  aceptar la solicitud. Intenta de nuevo.' }` (así llega «La solicitud ya no está
  pendiente.» cuando otra persona respondió antes). No rechaza: rechazar sigue en
  `SolicitudesScreen`, con la propuesta completa a la vista (W-330, Descartado).
- **`recargar`**: vuelve a pedir ventas y cierres, `refrescar` de solicitudes y de contactos.
- Sin `tenant`, no consulta contactos y `contactos` queda `null`.

### Lo que NO cambia

`useSolicitudes.ts`, `useContactosCrm.ts`, `useAdminPagos.ts`, `EventosContext.tsx` y las
pantallas (eso es el spec 204).

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `grep -nE "^import" src/lib/panel.ts` solo muestra `../constants/paises`, `./precio` y
   `../types` (tipos); nada de `supabase`, `react` ni `hooks/`.
3. Un script `npx tsx` en una carpeta temporal (no se commitea) contra `src/lib/panel.ts`,
   corrido con `TZ=America/Santiago`, `TZ=UTC` y `TZ=Pacific/Auckland` (el resultado no
   depende del huso del teléfono), comprueba como mínimo:
   - `solicitudesPorResponder` excluye las creadas por mí y las no pendientes.
   - `vendidasPorEvento` ignora `pending`/`refunded` y cuenta 1 si falta `cantidad`.
   - `claveMesEn('2026-12-01T01:30:00Z', 'CL')` → `'2026-11'`; con `'MX'` → `'2026-11'`;
     con `'XX'` usa Chile.
   - `ventasDelMes` y `contactosNuevosDelMes` con datos de dos meses.
   - `porcentaje(131, 248)` → 53; `porcentaje(1, 0)` → 0.
   - `etiquetaEstadoVenta` y `tonoEstadoVenta` para los cuatro estados y uno desconocido.
   - `textoProximoShow`: hoy, mañana, en 3 días, en 10 días, sin fecha.
   - `haceTiempo`: 30 min, 5 h, 1 día, 3 días, 2 semanas.
   - `enmascararEmail('maria@x.cl')` → `'mar**@x.cl'`, `('ab@x.cl')` → `'a*@x.cl'`, `(null)` → `null`.
   - `totalesPorMoneda` con CLP y MXN mezclados da dos totales unidos por « + ».
   - `armarNumerosPanel`: con `ventas: null` deja `vendidasActivas`, `cobradoMes`,
     `entradasPagadasMes` y `ventasRecientes` en `null` y el resto calculado; un evento en
     `cerrados` no cuenta en `activos`; un evento pasado hace 2 días sin cerrar no es el
     próximo show; los argumentos no se modifican.
4. Lectura del código: `usePanel` usa solo el cliente de `src/lib/supabase` y `aceptarSolicitud`
   llama a `responder` de `useSolicitudes` (`grep -n "responder(" src/hooks/usePanel.ts`).
5. `git diff --stat` del commit toca solo los dos archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

Llegan con las pantallas del 204; desde este spec solo hay una que se puede mirar sin ellas:

- Con la sesión de un local con eventos de colaboración (creados por una banda en su local),
  las ventas de esos eventos sí aparecen (lo da `tickets_select_event_team`), contra la
  base real.

## Fuera de alcance

- Dibujar los números: spec 204.
- Contar en la base (vista o RPC): sería un spec DATOS por números que ya salen de
  consultas existentes (W-326, Descartado).
- «Compradores · {n} % de tu público», «Con WhatsApp» y «Último correo» de la pantalla de
  contactos (W-329 §2, W-330 §2): la pantalla `ContactosScreen` no está en esta tanda.
  `porcentaje` queda exportada porque es parte del port, pero el 204 no la usa.
