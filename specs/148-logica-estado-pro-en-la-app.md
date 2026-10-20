# Spec 148 — La app lee si un local o una banda tiene Sonópolis Pro

> Estado: propuesto (19-oct-2026)
> Capa: LÓGICA. `src/types/index.ts`, `src/context/VenuesContext.tsx`, `src/lib/profiles.ts`, `src/lib/pro.ts` (nuevo).
> Depende de: ninguno (W-048 y W-242 de la web, aplicados en la base).
> Hermano en la web: `libs/pro.js` (W-048, W-243).

> **En una frase:** `Venue` y `PerfilMusico` traen `sonopolisProHasta` desde la base, y
> `src/lib/pro.ts` porta las reglas de la web (Pro es una fecha, 9999-12-31 es «sin
> vencimiento», días que faltan) para que las pantallas solo lean, nunca vendan.

## Contexto

Sonópolis Pro es una fecha, no un booleano: `venues.sonopolis_pro_hasta` y
`profiles.sonopolis_pro_hasta` (`supabase/migrations/20260829000000_spec_w048_sonopolis_pro_gate.sql:11-12`).
Pro está vigente si la fecha es futura; nula = nunca fue Pro. W-242 agregó la fecha
centinela `9999-12-31` para Pro sin vencimiento, que sigue siendo una fecha, así que la
regla no cambia (`sonopolisWeb/libs/pro.js:15-21`).

**Por qué la app lo puede leer sin cambiar la base:** las policies de SELECT de `venues` y
`profiles` ya cubren la columna (comentario final de la migración W-048), y la app ya
lee las dos tablas con `select('*')` (`src/context/VenuesContext.tsx:105`,
`src/screens/PerfilMusicoScreen.tsx:34-37`). El dato llega; lo pierden los mappers, que
copian campo por campo y no lo nombran (`VenuesContext.tsx:21-49`, `src/lib/profiles.ts:21-46`).

**Por qué la app nunca lo escribe:** el trigger `guard_sonopolis_pro`
(`…_spec_w048_sonopolis_pro_gate.sql:34-53`) rechaza cualquier cambio de la columna que no
venga de `service_role`/`postgres`. Y la decisión de producto es que Pro no se vende en la
app (Apple y Google exigirían su compra integrada): la app lee el estado y desbloquea, nada
más.

## Diseño

### `src/types/index.ts`

En `Venue` y en `PerfilMusico`, un campo opcional de solo lectura:

```ts
// Spec 148 — Sonópolis Pro (W-048). Solo lectura: la base rechaza escribirlo
// desde el cliente (guard_sonopolis_pro). null = nunca fue Pro.
sonopolisProHasta?: string | null;
```

Opcional para no romper los objetos que se arman a mano (`Omit<Venue, 'id'>` de
`createVenue`, `musicosMock`).

### Mappers

- `mapVenueFromDB` (`VenuesContext.tsx`): `sonopolisProHasta: db.sonopolis_pro_hasta ?? null`.
- `mapProfileFromDB` (`src/lib/profiles.ts`): la misma línea.
- **`mapVenueToDB` y `mapProfileToDB` no se tocan.** Si alguno mapeara el campo, guardar
  el formulario del local o del perfil mandaría la columna y el trigger rechazaría el
  update entero.

### `src/lib/pro.ts` (nuevo)

Port de `libs/pro.js`, mismos nombres y misma semántica, más un formateador para la
tarjeta:

```ts
type ConPro = { sonopolisProHasta?: string | null } | null | undefined;

export const PRO_SIN_VENCIMIENTO_DESDE_ANIO = 9999;

/** Pro vigente: hay fecha y es futura. Sin la columna (undefined) → false, el lado seguro. */
export function esPro(tenant: ConPro): boolean;

/** Pro con la fecha centinela (año UTC ≥ 9999, W-242). */
export function esProSinVencimiento(tenant: ConPro): boolean;

/** Días que faltan, redondeado hacia arriba (Math.ceil). null si no es Pro. */
export function diasRestantesPro(tenant: ConPro): number | null;

/** «5 de noviembre de 2026» en la hora del dispositivo. null si no es Pro o si es sin vencimiento. */
export function fechaHastaPro(tenant: ConPro): string | null;
```

- `esProSinVencimiento` usa `getUTCFullYear()`, igual que la web: en la hora de Chile
  `9999-12-31T00:00Z` cae el 30 de diciembre, pero sigue siendo el año 9999 en UTC.
- `fechaHastaPro` arma el texto con lo que ya existe: `separarFechaHora(hasta).fechaISO`
  (día local del dispositivo) y `formatearFechaEs` de `src/lib/fecha.ts`, más
  `de <año>`. **Sin `toLocaleDateString`:** el soporte de locales de `Intl` en Hermes no
  está garantizado en todos los builds (la misma razón de `formatearMonto`,
  `src/lib/precio.ts:31-35`).
- Sin estado ni Supabase: funciones puras, como en la web.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. Con un local cuyo `sonopolis_pro_hasta` es una fecha futura, `allVenues` trae ese local
   con `sonopolisProHasta` igual a la columna; con la columna nula, `null`.
4. `esPro({ sonopolisProHasta: null })`, `esPro({})` y `esPro(undefined)` → `false`; con
   una fecha de ayer → `false`; con una de mañana → `true` y `diasRestantesPro` → `1`.
5. Con `'9999-12-31T00:00:00+00:00'`: `esPro` → `true`, `esProSinVencimiento` → `true`,
   `fechaHastaPro` → `null`. Con `'2026-11-05T15:00:00+00:00'` en un dispositivo en hora
   de Chile: `fechaHastaPro` → `'5 de noviembre de 2026'`.
6. Guardar `EditarLocalScreen` y `EditarPerfilBandaScreen` sigue funcionando para un
   tenant con Pro (prueba de que los mappers de escritura no mandan la columna).
7. `grep -n "sonopolis_pro_hasta" src/context/VenuesContext.tsx src/lib/profiles.ts`
   muestra solo las dos líneas de lectura.

## Fuera de alcance

- Cualquier pantalla: la tarjeta es el spec 154, contactos y correo el 155, WhatsApp el 156.
- Refrescar el estado de Pro mientras la app está abierta (si Victor activa Pro desde la
  web, la app lo ve al recargar `VenuesContext` o volver al perfil).
- Comprar, renovar o pedir Pro desde la app: decisión de producto, no se hace.

## Verificación manual

- **V-candidata 148-a:** con un local de prueba, poner `sonopolis_pro_hasta` a mañana desde
  `/admin/crm` y confirmar con un `console.log` temporal de `esPro(miVenue)` que la app lo
  ve tras reabrir; volver a dejarlo nulo.
