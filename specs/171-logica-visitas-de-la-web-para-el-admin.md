# Spec 171 — Lógica de Visitas en el admin de la app: visitas de la web por país y detalle de cada visitante

> Estado: aplicado (13-nov-2026) — `npx tsc --noEmit` sin salida; `npx expo export --platform web` sin error; greps del criterio 3 sin salida; criterio 4 con `npx tsx` (365→365, 180→180, abc→30 días; Instagram | WhatsApp | Directo | midominio.cl; «Evento: Santiago Samba Club · Quintal Clandesta» | «Inicio»; CL «27 oct, 21:53», MX «27 oct, 18:53»; recorrido desordenado → viejas primero). Criterio 5 sin probar en la sesión (no hay pantalla hasta el 172): queda como V-candidata 171-a.
> Capa: LÓGICA. `src/lib/visitas.ts` (nuevo), `src/hooks/useAdminVisitas.ts` (nuevo).
> Depende de: spec 152 (admin en la app), W-261 y W-267 de la web (RPCs `admin_visitas_por_pais` y `admin_visitantes`, en producción).
> Hermano en la web: `libs/data/visitas.js` (`PERIODOS_VISITAS`, `desdeDePeriodo`, `getVisitasPorPais`, `getVisitantes`, `origenDeVisita`, `etiquetaDeRuta`), `libs/fecha.js` (`formatearMomento`) (W-262, W-266, W-268).

> **En una frase:** la app aprende a leer lo mismo que `/admin/visitas` de la web —visitantes
> y visitas por cartelera de país en 7 a 365 días, y cada visitante con quién es, de dónde
> llegó, su recorrido y sus compras—, para que el spec 172 sea solo la pantalla.

## Contexto

La web mide cada página vista de su grupo `(marketing)` en la tabla `visitas_web` (W-261,
W-263) y la muestra en `/admin/visitas` (W-263, W-266, W-269). La lectura son dos RPC
`security definer` que se defienden solas con `es_admin_sonopolis()` y tienen
`grant execute` a `authenticated`:

- `admin_visitas_por_pais(p_desde)` (`supabase/migrations/20261026120000_spec_w261_visitas_web.sql:86-87`);
- `admin_visitantes(p_desde)`, máximo 500 filas
  (`supabase/migrations/20261027120000_spec_w267_detalle_de_visitantes.sql:103-104`, `:221-222`).

La web las llama con la sesión del admin desde un Server Component
(`app/(private)/admin/visitas/page.js:51-55`), **sin service role**. Por eso la app las
puede llamar con su propia sesión: no hace falta un spec DATOS ni una ruta web que acepte el
Bearer (como W-249).

Las funciones de la web a portar están en `libs/data/visitas.js`: `PERIODOS_VISITAS` y
`desdeDePeriodo` (`:9-22`), los mapeos de `getVisitasPorPais` (`:50-61`) y `getVisitantes`
(`:67-94`), `origenDeVisita` (`:118-131`) y `etiquetaDeRuta` (`:141-147`).
`formatearMomento` (`libs/fecha.js:163-165`) delega en `formatearFechaHoraCorta`, que la app
ya tiene copiada con la zona como parámetro (`src/lib/redes/horario.ts:89-99`, spec 157). La
zona de cada país está en `PAISES[pais].zonaHoraria` (`src/constants/paises.ts:35-38`).

## Decisiones

1. **La app solo lee; no registra visitas.** W-261 lo dejó explícito («La app nativa no
   registra visitas: el pedido es de la página web») y la pantalla de la web lo explica («Las
   compras hechas en la app no pasan por la web y no aparecen acá»). Registrar visitas de la
   app cambiaría qué significan los números sin que nadie lo haya pedido.
2. **Lectura directa por RPC, sin DATOS ni ruta web.** Ver Contexto: las RPC aceptan la
   sesión del admin. Era la salida más chica posible: cero migraciones, cero deploys.
3. **Puro en `src/lib/visitas.ts`, red en el hook.** Los mapeos, los períodos, el origen, la
   etiqueta de ruta, el formato de fecha y el resumen son funciones puras en la lib, sin
   importar el cliente de Supabase, para probarlas con `npx tsx`. Las dos RPC van en
   `useAdminVisitas`, como las consultas del admin de los specs 152 y 153.
4. **`formatearMomento` reusa `formatearFechaHoraCorta` de `src/lib/redes/horario.ts`.** Es
   la copia del formato que usa la web («27 oct, 21:53») y ya corre en la app desde el 157:
   una sola copia de las opciones de `Intl`. La zona es la del país de la cartelera del
   visitante, la misma regla de la web; país desconocido → la del país por defecto
   (`PAIS_POR_DEFECTO`).
5. **`Object.prototype.hasOwnProperty.call` y no `Object.hasOwn`.** La web usa `Object.hasOwn`;
   la app sigue el patrón de `esPaisActivo` (`src/constants/paises.ts:41-44`), que funciona en
   cualquier versión de Hermes.
6. **El recorrido se ordena en el mapeo.** La web lo ordena en el componente
   (`page.js:183-184`, viejas primero). Hacerlo en `mapVisitante` deja la pantalla sin lógica.
7. **Respuestas viejas se descartan.** Cambiar de período rápido dispara dos cargas; si la de
   7 días llega después de la de 365, la pantalla mostraría números de otro período con el
   botón de 365 marcado. El hook numera cada carga y solo aplica la última.

## Cambios por archivo

### `src/lib/visitas.ts` (nuevo)

Comentario de cabecera: port de `sonopolisWeb/libs/data/visitas.js` (W-262, W-266, W-268),
solo lectura (Decisión 1).

```ts
export const PERIODOS_VISITAS = { '7': 7, '30': 30, '90': 90, '180': 180, '365': 365 } as const;
export type ClavePeriodo = keyof typeof PERIODOS_VISITAS;
export const PERIODO_POR_DEFECTO: ClavePeriodo = '30';
export const MAX_VISITANTES = 500; // tope de admin_visitantes (W-267)

export interface VisitasPais { pais: string; visitas: number; visitantes: number; visitantesConSesion: number }
export interface PasoRecorrido { ruta: string; at: string; evento: string | null }
export interface Visitante {
  visitante: string; pais: string; primera: string; ultima: string; visitas: number;
  referente: string | null; utmSource: string | null; userId: string | null;
  nombre: string | null; email: string | null; compras: number; entradas: number;
  recorrido: PasoRecorrido[];
}

export function desdeDePeriodo(clave: string, ahora?: number): Date
export function mapVisitasPais(fila: any): VisitasPais
export function mapVisitante(fila: any): Visitante
export function origenDeVisita(v: { referente?: string | null; utmSource?: string | null }): string
export function etiquetaDeRuta(p: { ruta: string; evento?: string | null }): string
export function formatearMomento(iso: string, pais: string | null | undefined): string
export function resumirVisitas(porPais: VisitasPais[], visitantes: Visitante[]):
  { total: number; compraron: number; entradas: number; primero: Visitante | null }
```

- `desdeDePeriodo`: clave desconocida → 30 días; el chequeo de la clave usa `hasOwnProperty` (Decisión 5).
- `mapVisitasPais` / `mapVisitante`: los mapeos de la web, con `Number()` en los `bigint`;
  `mapVisitante` ordena `recorrido` por `at` ascendente (Decisión 6).
- `origenDeVisita` y `etiquetaDeRuta`: copias literales de la web, con su comentario («Directo»
  no significa «escribió la dirección»: WhatsApp no manda referrer).
- `formatearMomento`: `formatearFechaHoraCorta(iso, (PAISES[pais ?? ""] ?? PAISES[PAIS_POR_DEFECTO]).zonaHoraria)`.
- `resumirVisitas` (lo que la web calcula en `page.js:56-65`): `total` = suma de
  `visitantes` por país; `compraron` = visitantes con `compras > 0`; `entradas` = suma de
  `entradas`; `primero` = el visitante con la `primera` más antigua, o `null`.

### `src/hooks/useAdminVisitas.ts` (nuevo)

`useAdminVisitas(periodo: ClavePeriodo)` →
`{ cargando: boolean; error: string | null; porPais: VisitasPais[]; visitantes: Visitante[]; recargar: () => void }`.

- Carga al montar y cuando cambia `periodo`: `desde = desdeDePeriodo(periodo)`, y en
  paralelo `rpc('admin_visitas_por_pais', { p_desde: desde.toISOString() })` y
  `rpc('admin_visitantes', { p_desde })`.
- Error de cualquiera → mensaje de Postgres en `error` (no-admin: «solo admin»), conserva las
  listas anteriores (spec 115). Sin `catch {}` vacío.
- Cada carga lleva un número (`useRef`); al volver, solo escribe estado si es la última
  (Decisión 7).

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. `grep -n "catch {}\|catch (e) {}" src/lib/visitas.ts src/hooks/useAdminVisitas.ts` y
   `grep -n "supabase\|registrar_visita" src/lib/visitas.ts` sin salida.
4. Un script con `npx tsx` contra `src/lib/visitas.ts` (carpeta temporal, no se commitea; el
   log va en el estado):
   - `desdeDePeriodo('365')` es hace 365 días, `'180'` hace 180, `'abc'` hace 30;
   - `origenDeVisita({ referente: 'l.instagram.com' })` → «Instagram»;
     `{ utmSource: 'whatsapp', referente: 'google.com' }` → «WhatsApp»; `{}` → «Directo»;
     `{ referente: 'midominio.cl' }` → «midominio.cl»;
   - `etiquetaDeRuta({ ruta: '/cartelera/<uuid>', evento: 'Santiago Samba Club · Quintal Clandesta' })`
     → «Evento: Santiago Samba Club · Quintal Clandesta»; `{ ruta: '/' }` → «Inicio»;
   - `formatearMomento('2026-10-28T00:53:00Z', 'CL')` → «27 oct, 21:53»; con `'MX'` →
     «27 oct, 18:53»;
   - `mapVisitante` con un recorrido desordenado lo devuelve viejas primero.
5. Con la cuenta admin, `useAdminVisitas('30')` devuelve los mismos países y conteos que
   `sonopolis.org/admin/visitas?periodo=30` en el mismo momento; con una cuenta de prueba,
   `error` con «solo admin» y listas vacías (V-candidata 171-a si no se puede en la sesión
   del spec).

## V-candidatas

- **V-candidata 171-a:** comparar `useAdminVisitas` (vía la pantalla del 172) con la web en
  dos períodos, y confirmar en Hermes que las horas salen en la zona de cada país.

## Fuera de alcance

- La pantalla y la entrada desde Administración: spec 172.
- Registrar visitas desde la app (Decisión 1).
- Gráfico por día, desglose por página, exportar, filtrar o paginar más allá de 500 (también
  fuera en la web).
