# Spec 151 — La app sabe con qué pasarelas cobra cada país y sabe cobrar con cualquiera

> Estado: aplicado (29-oct-2026) — `tsc` limpio, `expo export --platform web` sin error, consulta a `pasarelas_cobro` en producción: CL → `mercadopago`, MX y AR → vacío (criterio 3), llamada de Mercado Pago cotejada con `pedirPreferencia` (criterio 4). Criterio 5 (Flow → `pasarela_inactiva` con sesión real) y V-candidata 151-a quedan para el spec 160.
> Capa: LÓGICA. `src/lib/pasarelas.ts` (nuevo), `src/lib/pagoCompra.ts` (nuevo).
> Depende de: spec 104 (aplicado), spec 117 (aplicado), spec 147
> Hermano en la web: `libs/data/pasarelas.js` y `crearPagoCompra` de `libs/purchase.js` (W-189).
> Alimenta: spec 160 (pagar con Flow en el detalle).

> **En una frase:** dos módulos sin pantalla: uno lee las pasarelas activas del país del
> evento en el orden de la base, y otro crea el cobro con la Edge Function de la pasarela
> elegida (mandando `origen: 'app'` en nativo) y devuelve siempre la misma forma: link de
> pago, `ticketId` y `ticketRef`.

## Contexto

La app cobra solo con Mercado Pago, y la llamada vive dentro de la pantalla:
`pedirPreferencia` de `src/screens/DetalleEventoScreen.tsx:176-210` llama a
`create-preference` a mano, y `handleComprarLogueado` (`:214-273`) lee `init_point`. La
web ya separó las dos piezas que hacen falta para Flow (W-189):

- `getPasarelas(supabase, pais)` (`sonopolisWeb/libs/data/pasarelas.js:12-29`): lee
  `pasarelas_cobro` con `activo = true`, ordenadas por `orden`.
- `crearPagoCompra` (`sonopolisWeb/libs/purchase.js:153-199`): un mapa
  `pasarela → Edge Function` (`mercadopago → create-preference`,
  `flow → create-payment-flow`) y una respuesta unificada (`checkout_url` de Flow o
  `init_point` de Mercado Pago).

`pasarelas_cobro` (spec 104, `supabase/migrations/20261003120000_spec_104_pasarelas_por_pais.sql:14-35`)
es el interruptor que comparten la web y la app: `(pais, pasarela, activo, orden)`, con
`CL/mercadopago` encendido, `CL/flow` y `MX/flow` apagados, y lectura pública por RLS para
`anon` y `authenticated`. **No hace falta un interruptor nuevo ni un spec DATOS:** encender
Flow en la base lo enciende en las dos a la vez.

Las dos Edge Functions ya hablan el mismo idioma para la app: aceptan `origen: 'app'`
(spec 117 en `create-preference`, spec 147 en `create-payment-flow`), devuelven
`ticket_ref` y responden los errores como `{ error: <código>, detail? }`.

**Por qué en `src/lib/` y no dentro de la pantalla:** con dos pasarelas, la elección de la
función, el `origen` y la normalización de la respuesta son reglas, no presentación. Si
quedan en `DetalleEventoScreen`, el spec 160 tendría que duplicarlas por botón. Es el mismo
corte que hizo la web.

## Diseño

### `src/lib/pasarelas.ts` (nuevo)

```ts
import { supabase } from './supabase';

/** Valores del CHECK de `pasarelas_cobro.pasarela` (spec 104). */
export type Pasarela = 'mercadopago' | 'flow';

/** Nombre visible de cada pasarela, igual que `NOMBRE_PASARELA` de la web. */
export const NOMBRE_PASARELA: Record<Pasarela, string> = {
  mercadopago: 'Mercado Pago',
  flow: 'Flow',
};

/**
 * Pasarelas activas del país, en el orden en que se muestran
 * (`['mercadopago', 'flow']`). Sin filas devuelve `[]`: el país no vende.
 * Lanza si la consulta falla; quien llama decide qué mostrar.
 */
export async function getPasarelas(pais: string): Promise<Pasarela[]>
```

La consulta es la de la web, sin cambios: `.from('pasarelas_cobro').select('pasarela')
.eq('pais', pais).eq('activo', true).order('orden')`. El resultado se filtra a los valores
de `Pasarela`: si un día la base suma una pasarela que esta versión de la app no sabe
cobrar, la app no muestra un botón que solo puede fallar. La web no filtra porque se
despliega junto con la base; una app instalada puede tener meses.

**Lanza en vez de tragarse el error**, como la web después de la addenda de W-189: con
`[]` silencioso, un error de red se vería igual que «este país no vende». Qué hacer ante
el error lo decide la pantalla (spec 160).

**Sobrescritura solo en desarrollo**, igual que `PASARELAS_LOCAL` de la web
(`libs/data/pasarelas.js:13-20`): si `__DEV__` y `EXPO_PUBLIC_PASARELAS_LOCAL` está
definida (`mercadopago,flow`), se devuelve esa lista (filtrada igual) sin consultar. Sirve
para ver el selector del spec 160 mientras Flow está apagado en la base, que es la de
producción; tocar «Pagar con Flow» igual responde `pasarela_inactiva`. `__DEV__` es
`false` en un build de tienda, así que esa rama no puede llegar a producción aunque la
variable quede definida.

### `src/lib/pagoCompra.ts` (nuevo)

```ts
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { Pasarela } from './pasarelas';

export type PagoCreado = {
  checkoutUrl: string;
  ticketId: string | null;
  ticketRef: string | null;
};

/** Error de la Edge Function con su código (`pasarela_inactiva`, `sin_cupo`...). */
export class ErrorPago extends Error {
  constructor(public codigo: string | null, public httpStatus: number, mensaje: string) {
    super(mensaje);
  }
}

export async function crearPagoCompra(args: {
  eventoId: string;
  userId: string;
  pasarela: Pasarela;
  cantidad?: number; // 1 por defecto
}): Promise<PagoCreado>

/** Texto para mostrar al comprador. */
export function mensajeErrorPago(err: unknown): string
```

**`crearPagoCompra`:**

1. Función por pasarela, el mismo mapa que la web:
   `{ mercadopago: 'create-preference', flow: 'create-payment-flow' }`.
2. Sesión: `supabase.auth.getSession()`; sin sesión lanza `ErrorPago(null, 401,
   'Sesión no encontrada')`. Las dos funciones identifican al comprador con
   `supabase.auth.getUser()` y con la anon key cortan en 401: hay que mandar el
   `access_token` (mismo comentario que `DetalleEventoScreen.tsx:180-182`).
3. `fetch` a `${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/<función>` con los headers de hoy
   (`Authorization: Bearer <access_token>`, `apikey`, `Content-Type`) y body
   `{ evento_id, user_id, cantidad, ...(Platform.OS !== 'web' ? { origen: 'app' } : {}) }`.
   **El `origen` lo decide el módulo, no quien llama:** es una regla de plataforma (en
   nativo la vuelta tiene que reabrir la app; en el build web, volver a la web), y dejarla
   en la pantalla es lo que permitiría que un botón nuevo se olvide de mandarla.
4. Si `!res.ok`: se lee el cuerpo como texto, se intenta `JSON.parse` y se lanza
   `ErrorPago(cuerpo.error ?? null, res.status, \`<función> <status>: <cuerpo>\`)`. El
   mensaje técnico va al `console.error` de la pantalla; al comprador le llega el de
   `mensajeErrorPago`.
5. Si `ok`: `checkoutUrl = data.checkout_url ?? data.init_point ?? data.sandbox_init_point`
   (mismo orden que la web; con credenciales de prueba `init_point` ya opera en modo
   test). Sin ninguno de los tres lanza `ErrorPago(null, 200, 'Respuesta sin link de pago')`
   en vez de abrir `undefined` en el navegador. `ticketId = data.ticket_id ?? null`,
   `ticketRef = data.ticket_ref ?? null`.

**`mensajeErrorPago`:** traduce el `codigo` de un `ErrorPago` con los mismos textos que
`mensajeDeError` de la web (`libs/purchase.js:87-110`), para que el comprador lea lo mismo
en las dos:

| `codigo` | Texto |
|---|---|
| `sin_cupo`, `sin_cupo_preventa` | «No quedan entradas suficientes para esa cantidad» |
| `cantidad_invalida` | «Esa cantidad de entradas no está permitida» |
| `pais_sin_cobro` | «La venta de entradas en este país todavía no está habilitada» |
| `pasarela_inactiva` | «Ese medio de pago no está disponible para este evento» |
| `flow_create_failed` | «Flow no pudo iniciar el pago. Intenta de nuevo o paga con otro medio» |
| cualquier otro, o un error que no es `ErrorPago` | «No se pudo procesar la compra» (el texto de hoy, `DetalleEventoScreen.tsx:268`) |

La web, a diferencia de este módulo, muestra el volcado técnico en el caso por defecto;
en la app ese volcado no le sirve al comprador y queda en el log.

`DetalleEventoScreen` no cambia en este spec: sigue con `pedirPreferencia` hasta el spec
160. Los dos módulos nuevos quedan sin llamadores mientras tanto.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. `getPasarelas('CL')` contra producción devuelve `['mercadopago']` mientras Flow esté
   apagado; `getPasarelas('MX')` y `getPasarelas('AR')` devuelven `[]`.
4. `crearPagoCompra({ pasarela: 'mercadopago', ... })` arma la misma llamada que
   `pedirPreferencia(desdeApp)` de `DetalleEventoScreen.tsx:176-210` (misma URL, headers y
   body; en nativo con `origen: 'app'`, en web sin él), revisado en el código.
5. `crearPagoCompra({ pasarela: 'flow', ... })` sobre un evento `CL`, con sesión válida,
   lanza `ErrorPago` con `codigo === 'pasarela_inactiva'`, y `mensajeErrorPago` devuelve
   «Ese medio de pago no está disponible para este evento».
6. Solo cambian los dos archivos nuevos.

## Fuera de alcance

- Usar estos módulos en la pantalla (botones por pasarela, errores visibles): spec 160.
- Elegir cantidad de entradas en la app: hoy se compra de a una y sigue así.
- Encender Flow: spec DATOS aparte sobre `pasarelas_cobro`.
- Cambios en las Edge Functions: specs 117 y 147.

## Verificación manual (candidata a `V#` en `specs/PENDIENTES.md`)

- **V-candidata 151-a:** con `EXPO_PUBLIC_PASARELAS_LOCAL=mercadopago,flow` en `npx
  expo start` (desarrollo), `getPasarelas('CL')` devuelve las dos; con la variable quitada,
  vuelve a leer la base. Se confirma de verdad con la pantalla del spec 160.
