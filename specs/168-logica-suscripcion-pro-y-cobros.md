# Spec 168 — Lógica de Pro en la app: el dueño lee y cancela su suscripción, el admin lee los cobros

> Estado: aplicado (13-nov-2026) — `npx tsc --noEmit` limpio; `expo export --platform web` sin error; greps de los criterios 3, 4 y 7 sin salida; script `tsx` contra `cobrosPro.ts` pasa los casos del criterio 5 (30-oct «Devuelto», `danger`, «Devuelto el 30 oct, 13:34, 8 min después del cobro», «Tarjeta de débito (debvisa)», «30 oct, 13:26»; rechazado/fondos insuficientes; aprobado con y sin registro; código desconocido; resumen «Mercado Pago cobró y lo devolvió…»); script `tsx` contra `pro.ts` con `TZ=America/Santiago` y `TZ=UTC` pasa el criterio 6. V-candidatas 168-a y 168-b sin ver (se ven con las pantallas 169/170).
> Capa: LÓGICA. `src/lib/proSuscripcion.ts` (nuevo), `src/hooks/useMiSuscripcionPro.ts` (nuevo), `src/lib/cobrosPro.ts` (nuevo), `src/hooks/useCobrosPro.ts` (nuevo), `src/lib/adminPro.ts`, `src/lib/pro.ts`.
> Depende de: spec 161 (`pro_mi_suscripcion`), spec 162 (`cancelar-suscripcion-pro`), spec 163 (`cobros-pro`), spec 153 (`adminPro.ts`, `errorLegible`), spec 148 (`src/lib/pro.ts`).
> Hermano en la web: `libs/data/proSuscripcion.js` (`getMiSuscripcionPro`, `cancelarMiSuscripcionPro`, `getCobrosPro`), `libs/cobrosPro.js`, `libs/pro.js` (`fechaLargaPro`), `components/CardSonopolisPro.js` (`finSiCancela`) (W-264, W-265, W-270).

> **En una frase:** la app aprende a leer la suscripción a Pro del dueño, a cancelarla en
> Mercado Pago y a leer, como admin, cada cobro de Pro de un local o banda traducido a qué
> pasó, para que los specs 169 y 170 sean solo pantallas.

## Contexto

La web hizo dos cadenas que la app no tiene:

- **W-264/W-265 — el dueño ve y cancela su suscripción.** `getMiSuscripcionPro`
  (`sonopolisWeb/libs/data/proSuscripcion.js:53-70`) llama al RPC `pro_mi_suscripcion`
  (spec 161). El RPC tiene `grant execute` a `authenticated`
  (`supabase/migrations/20261026200000_spec_161_cancelar_suscripcion_pro.sql:68`) y devuelve
  cero filas si quien llama no es la cuenta dueña, así que la app lo puede llamar con su
  sesión. `cancelarMiSuscripcionPro` (`proSuscripcion.js:73-79`) invoca la Edge Function
  `cancelar-suscripcion-pro` (spec 162, `verify_jwt = true`), que responde CORS `*` con
  `x-client-info` en los headers permitidos
  (`supabase/functions/cancelar-suscripcion-pro/index.ts:18-23`): sirve también al build web
  de la app. La tarjeta arma la fecha del diálogo con `finSiCancela`
  (`components/CardSonopolisPro.js:169-176`) y formatea con `fechaLargaPro`
  (`libs/pro.js:27-34`, en UTC).
- **W-270/W-271 — el admin ve los cobros de Pro.** `getCobrosPro`
  (`proSuscripcion.js:123-129`) invoca `cobros-pro` (spec 163), que valida
  `es_admin_sonopolis` con el JWT de quien llama y responde 403 `solo admin` a los demás
  (`supabase/functions/cobros-pro/index.ts:61-63`). Los campos de Mercado Pago llegan crudos y
  los traduce `libs/cobrosPro.js` (funciones puras: `fechaCobro:49`, `medioDePago:56`,
  `motivoDe:64`, `diagnosticoCobro:81`, `resumenSuscripcion:121`).

En la app ya existe `errorLegible` (`src/lib/adminPro.ts:59-78`), el port del mismo helper de
la web, pero es privado. `formatearFechaEs` (`src/lib/fecha.ts:19`) arma «26 de noviembre»
desde un `YYYY-MM-DD`.

No hace falta nada nuevo en la base ni en las Edge Functions: las tres piezas están en
producción (161 pusheado, 162 y 163 desplegados).

## Decisiones

1. **Red y funciones puras en archivos distintos.** Las llamadas con red van en
   `src/lib/proSuscripcion.ts` (dueño) y en `src/lib/adminPro.ts` (admin, donde ya viven
   `darPro` y `generarCodigoPro`). Lo puro va en archivos **sin imports de valores con red**:
   la traducción de cobros en `src/lib/cobrosPro.ts` (solo `import type`) y las fechas de la
   suscripción (`fechaLargaPro`, `fechaFinSiCancela`) y su tipo en `src/lib/pro.ts`, que ya
   es puro desde el spec 148 («funciones puras: la app solo lee el estado») y solo importa
   `./fecha`. Así se prueban con `npx tsx` sin levantar el cliente de Supabase, que lee
   `AsyncStorage` y variables de Expo. Es el mismo criterio de la web («puro y sin imports con
   alias, para probarlo con `node`»).
   - Descartado: poner `getMiSuscripcionPro` en `src/lib/pro.ts`. Le sumaría red a un archivo
     puro y ya no se podría probar con `tsx`.
2. **`errorLegible` pasa a `export`.** `cancelar-suscripcion-pro` responde 403/409 con el
   motivo en el cuerpo («No tienes una suscripción activa»), y `functions.invoke` lo envuelve
   en un mensaje genérico. Exportar el helper existente evita una segunda copia.
3. **`fechaLargaPro` en UTC y sin `Intl`.** La web la pone en UTC para que servidor y
   navegador digan el mismo día (W-265, addenda). La app la arma con
   `formatearFechaEs(new Date(iso).toISOString().slice(0, 10))` + ` de ${año}`: el
   `toISOString` ya es UTC, y no usa `toLocaleDateString` por la misma razón que
   `fechaHastaPro` (`src/lib/pro.ts:36-38`: el soporte de locales de `Intl` en Hermes no está
   garantizado).
4. **`fechaCobro` sí usa `Intl` con `timeZone: 'America/Santiago'` y `hourCycle: 'h23'`.**
   Copia literal de la web, con el arreglo de 12 horas de la addenda de W-270. La app ya
   depende de `Intl.DateTimeFormat` con `timeZone` en las redes del CRM
   (`src/lib/redes/horario.ts:89-99`, spec 157), así que no suma un riesgo nuevo; verlo en
   dispositivo queda en la V-candidata.
5. **`finSiCancela` se parte en dos.** La lógica (qué fecha queda) es de este spec:
   `fechaFinSiCancela`. La frase («Puedes seguir usando Pro hasta el…») es de presentación y
   la escribe el 169.
6. **Los hooks no tiran.** Un error de lectura queda en `error`. `useCobrosPro` conserva la
   lista anterior (spec 115); `useMiSuscripcionPro` deja `suscripcion = null`, para que la
   tarjeta vuelva a la vista de hoy en vez de mostrar una renovación que no pudo confirmar.
   La web hace lo mismo con `cargarSuscripcionPro` (devuelve `null`) y `cargarCobros` («la
   tarjeta nunca tumba el panel»).
7. **Se mapea el contrato entero de `pro_mi_suscripcion`, incluidos `monto` y `moneda`**,
   aunque la tarjeta de la app no los muestre (decisión de producto del 154: sin precio). Así
   el tipo es el mismo que el de la web y el 169 decide qué dibujar.

## Cambios por archivo

### `src/lib/adminPro.ts`

- `async function errorLegible` → `export async function errorLegible`. Sin otro cambio.
- Nueva, después de `generarCodigoPro`:

```ts
/** Spec 168 — admin. Suscripciones del tenant con cada cobro tal como lo ve Mercado Pago
 * (Edge Function `cobros-pro`, spec 163). 403 → lanza «solo admin». */
export async function getCobrosPro(tipo: TipoTenant, id: string): Promise<SuscripcionConCobros[]>
```

`supabase.functions.invoke('cobros-pro', { body: { tenant_type: tipo, tenant_id: id } })`;
`error` → `throw await errorLegible(error)`; devuelve `data?.suscripciones ?? []`.
`SuscripcionConCobros` se importa con `import type` de `./cobrosPro`.

### `src/lib/cobrosPro.ts` (nuevo)

Port de `sonopolisWeb/libs/cobrosPro.js`, con un comentario que lo diga. Tipos exportados,
con los nombres de campo tal cual los manda `cobros-pro` (snake_case, spec 163 «Qué
devuelve»):

```ts
export interface DevolucionMP { id: string; date_created: string | null; amount: number | null }
export interface CobroMP {
  id: string; date_created: string | null; date_approved: string | null;
  status: string | null; status_detail: string | null;
  payment_type_id: string | null; payment_method_id: string | null;
  transaction_amount: number | null; currency_id: string | null;
  refunds: DevolucionMP[]; registrado: boolean;
}
export interface SuscripcionMP {
  id: string; status: string | null; date_created: string | null; last_modified: string | null;
  next_payment_date: string | null; payment_method_id: string | null;
}
export interface PagoSonopolis { mp_pago_id: string; pagado_at: string; hasta_despues: string; monto: number }
export interface SuscripcionConCobros {
  id: string; codigo: string; estado: string; monto: number; moneda: string;
  created_at: string; link_pedido_at: string | null; mp_plan_id: string | null;
  mp_preapproval_id: string | null; mp_error: string | null;
  suscripciones_mp: SuscripcionMP[]; cobros: CobroMP[]; pagos_sonopolis: PagoSonopolis[];
}
export type TonoCobro = 'success' | 'danger' | 'neutral';
```

Funciones exportadas, con las mismas tablas y textos literales de la web (`MEDIOS`,
`MOTIVOS`, `ESTADO_EN_MP`):

- `fechaCobro(iso: string | null | undefined): string` — «30 oct, 13:26» en
  `America/Santiago`; sin fecha o inválida → «—».
- `medioDePago(cobro): string` — «Tarjeta de débito (debvisa)»; código desconocido → el
  código; sin dato → «—».
- `motivoDe(statusDetail): string` — desconocido → el código; vacío → «—».
- `diagnosticoCobro(cobro): { texto: string; tone: TonoCobro; detalle: string }` — la tabla
  de W-270 completa, incluido «Contracargo del banco. …» para `charged_back` y «Devuelto el
  {fecha}, {N} min después del cobro».
- `resumenSuscripcion(s): { texto: string; tone: TonoCobro }` — las cinco reglas de W-270 en
  el mismo orden.

### `src/hooks/useCobrosPro.ts` (nuevo)

`useCobrosPro(tipo: TipoTenant, id: string)` →
`{ suscripciones: SuscripcionConCobros[]; cargando: boolean; error: string | null; recargar: () => void }`.

Carga al montar y cuando cambian `tipo` o `id`. Error → mensaje en `error`, conserva la lista
anterior. Sin caché: cada apertura de la ficha pregunta a Mercado Pago, como la web («Leído en
vivo de Mercado Pago al abrir esta página»).

### `src/lib/pro.ts`

Se agregan al final, sin tocar lo existente:

```ts
export type EstadoSuscripcionPro = 'activa' | 'pausada' | 'cancelada';
export interface MiSuscripcionPro {
  estado: EstadoSuscripcionPro; monto: number; moneda: string;
  ultimoPagoAt: string | null; proximoCobroAt: string | null;
  proHasta: string | null; canceladaAt: string | null;
}
/** Los 3 días que `pro_cerrar_suscripcion` quita al cancelar (spec 161). */
export const GRACIA_MS = 3 * 86_400_000;
export function fechaLargaPro(iso: string): string
export function fechaFinSiCancela(s: MiSuscripcionPro, ahora?: Date): string | null
```

- `fechaLargaPro`: «26 de noviembre de 2026» en UTC (Decisión 3).
- `fechaFinSiCancela`: port de `finSiCancela` sin el texto. `activa` con `proximoCobroAt` →
  `proximoCobroAt`. Si no: sin `proHasta` → `null`; `fin = proHasta − GRACIA_MS`; si
  `fin <= ahora` → `null` (Pro termina hoy); si no, `fin` en ISO.

### `src/lib/proSuscripcion.ts` (nuevo)

```ts
export async function getMiSuscripcionPro(tipo: TipoTenant, id: string): Promise<MiSuscripcionPro | null>
export async function cancelarMiSuscripcionPro(tipo: TipoTenant, id: string): Promise<{ proHasta: string }>
```

- `getMiSuscripcionPro`: `rpc('pro_mi_suscripcion', { p_tenant_type, p_tenant_id })`;
  `error` → tira; `data?.[0]` → mapeo camelCase igual a `proSuscripcion.js:61-69`
  (`monto` con `Number`); sin fila → `null`.
- `cancelarMiSuscripcionPro`: `functions.invoke('cancelar-suscripcion-pro', { body: { tenant_type, tenant_id } })`;
  `error` → `throw await errorLegible(error)` (importado de `./adminPro`); devuelve
  `{ proHasta: data.pro_hasta }`.

`TipoTenant` se importa de `./adminPro` y `MiSuscripcionPro` de `./pro` (no se redefinen).

### `src/hooks/useMiSuscripcionPro.ts` (nuevo)

`useMiSuscripcionPro(tipo: TipoTenant, id: string | null)` →
`{ suscripcion: MiSuscripcionPro | null; cargando: boolean; error: string | null; recargar: () => void }`.

- `id` nulo (sin local, perfil de muestra) → `suscripcion = null`, `cargando = false`, sin
  consulta. Recibe `null` en vez de no llamarse porque un hook no puede ir dentro de un `if`
  ni después de un `return` temprano de la pantalla.
- Carga al montar y cuando cambian `tipo`, `id` o `useAuth().user?.id` (otra sesión puede no
  ser la dueña).
- Error → `suscripcion = null` y el mensaje en `error` (la tarjeta cae a la vista de hoy).

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. `grep -n "catch {}\|catch (e) {}" src/lib/proSuscripcion.ts src/lib/cobrosPro.ts src/hooks/useMiSuscripcionPro.ts src/hooks/useCobrosPro.ts`
   sin salida.
4. `grep -n "^import [^t]" src/lib/cobrosPro.ts` sin salida (solo `import type`).
5. Un script con `npx tsx` contra `src/lib/cobrosPro.ts` (en una carpeta temporal, no se
   commitea; el log va en el estado) pasa los casos del criterio 2 de W-270:
   - cobro del 30-oct (`refunded`, `date_approved 2026-10-30T16:26:00Z`, refund
     `2026-10-30T16:34:00Z`, `debit_card`/`debvisa`) → «Devuelto», `danger`, detalle con
     «8 min»; medio «Tarjeta de débito (debvisa)»; `fechaCobro` del aprobado → «30 oct, 13:26»;
   - `rejected` + `cc_rejected_insufficient_amount` → «Rechazado», «Fondos insuficientes»;
   - `approved` con y sin `registrado` → «Recibido y registrado» / «Cobrado, pero Sonópolis
     no lo registró»;
   - `cc_rejected_algo_nuevo` → detalle `cc_rejected_algo_nuevo`;
   - `resumenSuscripcion` del caso 30-oct con `suscripciones_mp: []` → «Mercado Pago cobró y
     lo devolvió; la suscripción no quedó creada», `danger`.
6. Un script con `npx tsx` contra `src/lib/pro.ts`, con `TZ=America/Santiago` y con `TZ=UTC`:
   `fechaLargaPro('2026-11-26T02:00:00Z')` → «26 de noviembre de 2026» en los dos (en Chile
   esa hora todavía es el 25 local); `fechaFinSiCancela` de una `activa` con
   `proximoCobroAt` devuelve ese valor; de una `pausada` con `proHasta` a 2 días → `null`; a
   10 días → `proHasta − 3 días`.
7. `grep -n "supabase" src/lib/pro.ts src/lib/cobrosPro.ts` sin salida.

## V-candidatas

- **V-candidata 168-a:** con la cuenta admin en la app, `getCobrosPro('venue', '6a5f2a25-b086-4f3f-943f-8be57dda90ba')`
  (Quintal) devuelve `W5Q3DXJN` con 1 cobro `refunded`; con una cuenta de prueba no admin,
  lanza «solo admin». Se ve de verdad en la pantalla del 170.
- **V-candidata 168-b:** con la sesión de la cuenta dueña de Quintal,
  `getMiSuscripcionPro('venue', <id de Quintal>)` devuelve la misma fila que la web; con otra
  cuenta, `null`. Cancelar de verdad es V40 (ver 169).

## Fuera de alcance

- Las pantallas: 169 (tarjeta del dueño) y 170 (ficha del admin).
- Suscribirse o volver a suscribirse desde la app (`suscribirmeAPro`): Pro no se vende en la
  app (spec 154).
- Que el dueño vea sus cobros: `cobros-pro` es solo del admin (spec 163).
- Guardar el id del pago en `pro_pagos` para un cruce exacto (Abierto del spec 163).
