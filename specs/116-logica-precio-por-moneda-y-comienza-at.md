# Spec 116 — El precio se lee bien en cualquier moneda, y el evento guarda `comienza_at`

> Estado: aplicado (17-oct-2026) — `npx tsc --noEmit` sin errores, `expo export --platform web` OK, los 7 casos de `montoDesdePrecio` y el ida y vuelta de `armarFechaHora`/`separarFechaHora` verificados con `npx tsx` (script no commiteado). Pendientes manuales: V (116-a) y V (116-b).
> Capa: LÓGICA. `src/context/EventosContext.tsx`, `src/types/index.ts`, `src/lib/precio.ts` (nuevo), `src/lib/fecha.ts` (nuevo).
> Depende de: spec 095, spec 115.
> Alimenta: spec 120 (detalle con moneda), spec 136 (formulario de evento con fecha y hora reales).
> Hermano en la web: `sonopolisWeb/specs/w167-logica-monto-con-moneda.md` (regla de `montoDesdePrecio`), W-007 (`armarFechaHora`).

> **En una frase:** la copia móvil de `montoDesdePrecio` pasa a la regla de la web —sin
> centavos, sin rama por país y con el recargo de plataforma—, el evento trae `moneda` y
> `comienzaAt` desde la base, y el mapper escribe `comienza_at` cuando el formulario lo
> manda.

## Contexto

### El precio mexicano se cobra 100 veces más caro

`EventosContext.tsx:57-60` deriva `monto` (el entero que cobra Mercado Pago) del texto
libre `precio` quitando todo lo que no sea dígito. Sirve para `"$5.000"` (Chile, punto de
miles) y rompe con México, donde la coma es de miles y el punto de centavos:
`"$1,200.00"` → `120000`, cien veces el precio. La web lo arregló en el W-167;
`specs/PENDIENTES.md` (sección Flow / México) dejó anotado copiar la regla en la app.

La regla de la web (`sonopolisWeb/libs/mappers.js:31-36`):

```js
export function montoDesdePrecio(precio) {
  const sinCentavos = (precio ?? "").trim().replace(/[.,]\d{1,2}$/, "");
  const digitos = sinCentavos.replace(/\D/g, "");
  if (!digitos) return 0;
  return Math.round(parseInt(digitos, 10) * (1 + RECARGO_PLATAFORMA));
}
```

1 o 2 dígitos después del último separador son centavos y se descartan, sin preguntar el
país: `"$5.000"` → 5000, `"$1,200"` → 1200, `"$1,200.00"` → 1200, `"$1.200,50"` → 1200,
`"$350.50"` → 350, `"gratis"` → 0 (antes del recargo).

**Diferencia que la app tampoco tiene: el recargo.** La web cobra el precio + 10 % de
plataforma (`RECARGO_PLATAFORMA = 0.1`, commit `114b9c3` de sonopolisWeb, 29-ago-2026); el
local recibe el precio íntegro. La copia de la app no lo aplica, así que **un evento
creado o con precio editado desde la app cobra un 10 % menos** que el mismo evento
cargado en la web, y Sonópolis no cobra comisión sobre él. Paridad con la web significa
copiar las dos cosas.

### La preventa no puede cerrar por tiempo en eventos de la app

`comienza_at` (`timestamptz`, spec 045) es el instante real del show. Lo leen la preventa
que cierra «N horas antes» (spec 083, que ya lo advierte en
`specs/083-logica-preventa-cierra-por-tiempo.md:28`: «la app móvil no lo escribe»), el reclamo de pago (spec 075: `IF ev.comienza_at IS NULL … THEN` rechaza)
y el orden de la cartelera de la web. La app guarda solo `fecha` y `hora` como texto
(`mapEventoToDB`, `EventosContext.tsx:62-76`) y ni siquiera lee la columna
(`mapEventoFromDB`, `:31-49`).

El formulario de la app captura la fecha como texto libre («Ej: Sáb 28 Jun»,
`CrearEventoScreen.tsx:230-236`), sin año: **no se puede derivar `comienza_at` de lo que
hay hoy**. Por eso este spec prepara la lógica y el mapeo, y el formulario con selector de
fecha y hora real es del spec 136.

### La moneda no llega a la app

`events.moneda` existe (spec 100: copia de `paises_cobro.moneda` puesta por trigger desde
`pais`) y la web la usa para mostrar el precio (W-168). `mapEventoFromDB` no la lee, así que
ninguna pantalla de la app puede formatear un monto en su moneda.

## Diseño

### Decisión 1 — `src/lib/precio.ts`

```ts
/** Comisión de plataforma sobre el precio que pone el músico o el local. Misma
 * constante que sonopolisWeb/libs/mappers.js — si cambia en un repo, cambia en el otro. */
export const RECARGO_PLATAFORMA = 0.1;

export function montoDesdePrecio(precio: string | undefined | null): number { … }
```

Cuerpo idéntico al de la web (arriba). Se saca del contexto a `src/lib/` porque la van a
necesitar pantallas (el formulario del 136 muestra «el comprador paga X») y una pantalla
no debe importar desde un contexto lo que no es estado.

`EventosContext.tsx` borra su copia local (`:51-60`) e importa la de `../lib/precio`. Los
dos usos (`mapEventoToDB :74` y `updateEvento :204`) no cambian de forma.

**Por qué copiar y no compartir:** mismo argumento que el spec 095, Decisión 2 — los repos
no comparten build. La constante lleva el comentario de sincronía, igual que
`src/constants/generos.ts` con su copia de la web.

### Decisión 2 — `src/lib/fecha.ts`

Port de `sonopolisWeb/libs/fecha.js:31-62`, mismos nombres:

```ts
/** "2026-08-15" -> "15 de agosto". Parseo manual: `new Date("2026-08-15")` es UTC
 * y al formatearlo en hora local puede correr el día hacia atrás. */
export function formatearFechaEs(fechaISO: string): string;

/** fechaISO ("YYYY-MM-DD") + horaISO ("HH:mm") -> comienzaAt (ISO con zona) y los
 * textos `fecha`/`hora` que siguen leyendo las pantallas viejas. Se interpretan en la
 * hora local del dispositivo, igual que la web en el navegador. */
export function armarFechaHora(fechaISO: string, horaISO: string):
  { comienzaAt: string; fecha: string; hora: string };

/** El sentido inverso, para precargar un formulario al editar. */
export function separarFechaHora(comienzaAt: string | null | undefined):
  { fechaISO: string; horaISO: string };
```

`armarFechaHora` arma las **tres** columnas a la vez a propósito (W-007): si un
formulario escribiera solo `comienzaAt`, las pantallas que leen `fecha`/`hora` quedarían
vacías.

**Supuesto heredado de la web:** la hora se interpreta en el huso del dispositivo, que se
asume el del evento. Es falso para quien carga un show en otro país; la web vive con el
mismo supuesto y corregirlo (calcular el instante en el huso del país del evento) es un
spec propio para los dos repos.

### Decisión 3 — el tipo y el mapeo

`src/types/index.ts`, interfaz `Evento`, dos campos opcionales:

```ts
comienzaAt?: string | null;   // Spec 116 — events.comienza_at (spec 045). null en eventos viejos
moneda?: string | null;       // Spec 116 — events.moneda (spec 100), solo lectura
```

`EventosContext.tsx`:

- `mapEventoFromDB`: `comienzaAt: db.comienza_at ?? null`, `moneda: db.moneda ?? null`.
- `mapEventoToDB`: `comienza_at: evento.comienzaAt ?? null`. **`moneda` no se escribe
  nunca**: la pone el trigger desde `pais`, y mandarla desde el cliente abriría la puerta a
  una moneda que no corresponde al país.
- `updateEvento`: el tipo de `cambios` suma `'comienzaAt'` al `Pick` (en la interfaz
  `EventosState :12` y en la firma `:188-191`), y `cambiosDB` suma
  `if (cambios.comienzaAt !== undefined) cambiosDB.comienza_at = cambios.comienzaAt;`
  con el mismo patrón `!== undefined` que el resto de esos campos.

`null` para `moneda` no se tapa con `'CLP'`: un evento de un país sin fila en
`paises_cobro` no tiene moneda, y ese es justamente el caso en que no se vende (W-167).

### Qué no cambia

- Los eventos ya guardados: su `monto` no se recalcula. Un evento de la app con precio
  `"$5.000"` sigue cobrando 5000 hasta que alguien edite su precio (en la app o en la
  web); ahí pasa a 5500. Recalcular en lote es una decisión de producto (ver Fuera de
  alcance).
- `CrearEventoScreen` y `EditarEventoScreen` no mandan `comienzaAt` todavía: siguen con
  texto libre hasta el spec 136.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin errores.
2. `montoDesdePrecio` devuelve, para cada entrada, exactamente: `"$5.000"` → 5500,
   `"$1,200"` → 1320, `"$1,200.00"` → 1320, `"$1.200,50"` → 1320, `"$350.50"` → 385,
   `"gratis"` → 0, `undefined` → 0. (Verificable con un script temporal de `npx tsx` o
   copiando la función a `node -e`; el script no se commitea — el repo no tiene tests, ver
   `CLAUDE.md`.)
3. `armarFechaHora("2026-08-15", "21:30")` devuelve `fecha: "15 de agosto"`,
   `hora: "21:30"` y un `comienzaAt` que, leído con `new Date(…)`, da 21:30 hora local del
   15 de agosto. `separarFechaHora` de ese `comienzaAt` devuelve los dos valores de vuelta.
4. `grep -n "function montoDesdePrecio" -r src` aparece solo en `src/lib/precio.ts`.
5. `mapEventoToDB` incluye `comienza_at` y no incluye `moneda`.
6. `npm run build:web` termina sin errores.

## Fuera de alcance

- El formulario con selector de fecha y hora, y que crear/editar mande `comienzaAt`:
  spec 136.
- Mostrar el precio formateado en su moneda y el precio vigente de preventa: spec 120.
- Recalcular `monto` de los eventos ya creados desde la app sin recargo: es dinero
  cobrado de menos en eventos vivos; si se hace, es un spec DATOS con su lista de filas
  afectadas y la decisión de Victor.
- El huso del país del evento en `armarFechaHora` (Decisión 2, supuesto heredado).

## Verificación manual (candidatas a `V#` en `specs/PENDIENTES.md`)

- **V (116-a):** editar desde la app el precio de un evento de prueba a `"$1,200.00"` y
  confirmar en la base `monto = 1320`.
- **V (116-b):** un evento leído desde la app trae `moneda` (`CLP` para Chile) y
  `comienzaAt` cuando la fila lo tiene (eventos cargados desde la web).
