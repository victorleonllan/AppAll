# Spec 196 — Cartelera de la app: conteos por fecha, días con nombre y vacío que sugiere

> Estado: aplicado (28-nov-2026) — `tsc` limpio fuera de `supabase/functions`; script `npx tsx` del criterio 4 OK con `TZ=America/Santiago`, `Pacific/Auckland` y `UTC`. Sin probar en dispositivo (la pantalla es el spec 205).
> Capa: LÓGICA. `src/lib/cartelera.ts` (nuevo), `src/lib/fechaCartelera.ts`.
> Depende de: — (spec 119, `fechaCartelera.ts`, ya aplicado).
> Alimenta: spec 205 (FRONTEND).
> Hermano en la web: `libs/cartelera.js` (W-312).

> **En una frase:** las cuentas que la Cartelera necesita para decir cuántos shows trae cada
> fecha, qué día es «hoy» o «mañana», a qué hora es cada evento externo y qué decir (y qué
> sugerir) cuando no hay nada, pasan a funciones puras en `src/lib/cartelera.ts`.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después
de esta orquestación.»

La web (W-312, W-313) muestra en la Cartelera cuántos shows trae cada fecha («Hoy 3 · Este
finde 9»), marca los días con «HOY» y «MAÑANA», pone la hora en cada tarjeta externa y,
cuando los filtros no dejan nada, dice por qué y ofrece una salida. La app hoy tiene
botones de fecha sin número, días sin etiqueta, tarjetas externas sin hora y un vacío de una
línea («Ningún evento calza con estos filtros.», `CarteleraScreen.tsx`, `ListFooterComponent`).

## Decisión

Funciones puras: no leen el reloj (reciben `ahora: Date`), no importan React ni Supabase.
Se prueban con `npx tsx`.

### Huso: hora local del teléfono, como la web

La web decide «hoy» en la hora local del navegador (W-016) y descartó en W-312 pasar la
Cartelera al huso del país («cambia qué cae en "Hoy" para todos los usuarios: es una
decisión aparte»). La app ya usa ese mismo criterio en `src/lib/fechaCartelera.ts` (hora
local del teléfono, sin `Intl`). Este spec lo sigue: **no** usa `PAISES[pais].zonaHoraria`.
Queda como está el pendiente multipaís B1 (agrupar por día en el huso del evento): es un
spec aparte, en los dos repos a la vez.

### 1. `src/lib/fechaCartelera.ts` — `rangoFecha` recibe `ahora`

```ts
export function rangoFecha(filtro: FiltroFecha, ahora: Date = new Date()): [Date, Date] | null;
```

Único cambio del archivo: el `const ahora = new Date()` de adentro pasa a ser el parámetro,
con `new Date()` por omisión. La regla no cambia (`[inicio, fin)` en hora local; «finde» es
sábado y domingo próximos, o hoy y mañana si hoy es sábado; «semana» es hoy y los 6 días
siguientes; `null` para «todos»). La única llamada actual (`CarteleraScreen.tsx`) sigue
compilando sin tocarse. Se prefiere esto a copiar la función en `cartelera.ts`: dos
`rangoFecha` terminarían decidiendo distinto qué es «este finde».

### 2. `src/lib/cartelera.ts` (nuevo)

Importa `claveDiaLocal`, `formatearDiaLargo`, `rangoFecha` y `FiltroFecha` de
`./fechaCartelera` (sin imports propios, se puede cargar con `npx tsx`).

```ts
export interface ConFecha { comienzaAt?: string | null }

export interface ConteoFechas { hoy: number; finde: number; semana: number; todos: number }

export interface GrupoDia<T> {
  clave: string;                       // "YYYY-MM-DD" local, o "sin-fecha"
  titulo: string;                      // «Sábado 18 de octubre» o «Sin fecha»
  etiqueta: 'hoy' | 'manana' | null;
  items: T[];
}

export interface MensajeVacio { titulo: string; detalle: string; salidaFecha: string | null }

export function contarPorFecha(items: ConFecha[], ahora: Date): ConteoFechas;
export function agruparPorDia<T extends ConFecha>(items: T[], ahora: Date): GrupoDia<T>[];
export function horaCorta(comienzaAt: string | null | undefined): string;
export function mensajeVacio(e: {
  fecha: FiltroFecha;
  genero: string | null;
  nombrePais: string | null;
  paisSinCartelera: boolean;
}): MensajeVacio;
export function proximosParaVacio<T extends ConFecha & { genero?: string | null }>(
  internos: T[], e: { genero: string | null; ahora: Date; max?: number },   // max = 3
): T[];
```

Reglas, iguales a W-312:

- **`contarPorFecha`**: para «hoy», «finde» y «semana», cuántos de `items` caen en
  `rangoFecha(filtro, ahora)`; `todos` es `items.length`, incluidos los sin `comienzaAt`
  (un rango nunca incluye un evento sin fecha, «Todos» sí; spec W-006 y la función `enRango`
  de la pantalla). `items` llega **ya filtrado por todo menos la fecha** (búsqueda, género,
  «Solo Sonópolis»): el número dice lo que se verá al tocar esa fecha.
- **`agruparPorDia`**: conserva el orden de `items` (los externos ya llegan por
  `comienza_at`). `titulo` es `formatearDiaLargo` (ya sale con mayúscula: «Sábado 18 de
  octubre») o «Sin fecha». `etiqueta` es `'hoy'` si la clave es la de `ahora`, `'manana'`
  si es la del día siguiente (calculado con `new Date(año, mes, día + 1)`, no sumando 24 h:
  el día del cambio de horario dura 23 o 25), y `null` en otro caso.
- **`horaCorta`**: «19:00», 24 h, hora local, a mano con `getHours`/`getMinutes` (como
  `horaDe` de `TalonEntrada.tsx`, sin `toLocaleTimeString`). `""` sin `comienzaAt` o con
  fecha ilegible.
- **`mensajeVacio`**, textos literales de W-312 §6:

| Caso | `titulo` | `detalle` | `salidaFecha` |
|---|---|---|---|
| `paisSinCartelera` y hay `nombrePais` | «Todavía no hay eventos en {país}» | «Estamos sumando locales y ticketeras.» | `null` |
| fecha ≠ `todos` y género | «{Cuándo} no hay {género} en {país}» | «Ningún evento calza con estos filtros. Prueba con otra fecha o quita el género.» | «Ver {género} en otras fechas» |
| fecha ≠ `todos`, sin género | «{Cuándo} no hay shows con estos filtros» | «Prueba con otra fecha o quita algún filtro.» | «Ver todas las fechas» |
| fecha = `todos` | «Ningún evento calza con estos filtros» | «Prueba quitando algún filtro.» | `null` |

  - `{Cuándo}`: `hoy` → «Hoy», `finde` → «Este finde», `semana` → «Esta semana».
  - `{género}` en minúscula («samba»).
  - Sin `nombrePais`, la frase termina sin « en …», y `paisSinCartelera` sin país cae a las
    filas de abajo (no se afirma nada de «el país» sin nombrarlo, W-113).
- **`proximosParaVacio`**: de `internos` (eventos de Sonópolis; nunca externos, W-024), los
  con `comienzaAt >= ahora`, del `genero` si hay uno (igualdad exacta, como
  `eventoCoincideConGenero` de `src/lib/generos.ts`), en el orden recibido, hasta `max`.
  Ignora los demás filtros a propósito: es una salida del vacío, no otra vista de los
  mismos filtros.

Descartado de W-312, porque el spec 205 no lo usa en la app:

- `diaCorto` («Sáb 21»): en la web solo lo muestra el póster de escritorio; en la fila del
  celular el día ya está en el encabezado.
- `VISIBLES_POR_DIA_MOVIL` y `etiquetaVerMas`: el colapso por día es parte del rediseño
  visual de W-313, fuera de esta tanda.
- `rangoFecha` dentro de `cartelera.ts`: ya vive en `fechaCartelera.ts` (§1).

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `grep -nE "^import" src/lib/cartelera.ts` solo muestra `./fechaCartelera`.
3. `git diff src/lib/fechaCartelera.ts` cambia solo la firma y la primera línea de
   `rangoFecha` (y su comentario).
4. Un script `npx tsx` en una carpeta temporal (no se commitea), con `ahora` fijo en el
   viernes 20 de noviembre de 2026 a las 15:00 local, corrido con `TZ=America/Santiago`,
   `TZ=Pacific/Auckland` y `TZ=UTC`, comprueba como mínimo:
   - `rangoFecha('finde', ahora)` empieza el sábado 21 y termina el lunes 23; con `ahora` en
     sábado empieza ese sábado; `rangoFecha('todos', ahora)` → `null`; `rangoFecha('hoy')`
     sin `ahora` sigue funcionando.
   - `contarPorFecha`: un ítem sin `comienzaAt` cuenta solo en `todos`; uno de las 23:30 de
     hoy cuenta en `hoy`, `semana` y `todos`.
   - `agruparPorDia`: etiquetas `'hoy'`, `'manana'` y `null`; título «Sábado 21 de
     noviembre»; el grupo «Sin fecha»; el orden de entrada se conserva.
   - `horaCorta`: «19:00», «09:05», `""`.
   - `mensajeVacio`: los cuatro casos de la tabla, y sin `nombrePais`.
   - `proximosParaVacio`: excluye pasados y otros géneros, respeta `max`, no modifica el
     arreglo recibido.
5. `git diff --stat` del commit toca solo los dos archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

Llegan con la pantalla del 205.

## Fuera de alcance

- Usar estas funciones en `CarteleraScreen.tsx` y `TarjetaEventoExterno.tsx`: spec 205.
- Cambiar el huso con que la Cartelera decide «hoy» (multipaís B1): spec aparte, en la web
  y en la app a la vez.
