# Spec 193 — Perfiles: próximos eventos, evento en cartelera, redes y cómo llegar (lógica)

> Estado: aplicado (28-nov-2026) — `npx tsc --noEmit` sin errores fuera de `supabase/functions`; `src/lib/perfil.ts` probado con `npx tsx` (`TZ=America/Santiago`, criterio 3) y solo importa `./precio`; `useProximosEventos` revisado leyendo el código. Sin probar contra la base ni en dispositivo (ver `PENDIENTES.md`).
> Capa: LÓGICA. `src/lib/perfil.ts` (nuevo), `src/hooks/useProximosEventos.ts` (nuevo).
> Depende de: spec 188 (`musico_id` en `Evento` y en `mapEventoFromDB`; la consulta de este spec filtra por `events.musico_id` y `event_artists.musico_id`, que ya existen en la base por W-347). Usa `event_artists` (W-300), ya en producción.
> Alimenta: spec 202 (FRONTEND).
> Hermano en la web: `libs/perfil.js`, `libs/muro.js` (`diasHasta`, `quitarEventoDelMuro`), `libs/data/muro.js` (`getProximosEventos`, `getEventoEnCartelera`) — W-308, W-316, W-348.

> **En una frase:** lo que las fichas de músico y local necesitan calcular —sus próximos
> eventos contando todas las bandas, cuándo se viene el que está en cartelera, sus redes y
> los enlaces de «Cómo llegar» a varias apps de mapas— pasa a funciones puras y a un hook,
> para que las pantallas solo dibujen.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después
de esta orquestación.» En la web, el perfil de un local o banda destaca su próximo evento
arriba del muro (W-308/W-309, pedido de Victor del 19-nov-2026: «necesito que destaques el
evento actual en el muro de local y banda. con algun mensaje de que esta actualmente en
cartelera y se viene a futuro») y la ficha muestra próximos eventos y «Cómo llegar» con
Google Maps, Waze y Mapas de Apple (W-316). Desde el rediseño de las fichas (W-317 §3 y §6)
la web ya no dibuja el destacado sobre el muro: el primer evento de «Próximo show» /
«Próximos eventos» lleva el sello «● En cartelera · Es hoy» y el muro no lo repite. En la app:

- `VerMusicoScreen` no muestra ningún evento futuro de la banda.
- El muro (spec 187) solo junta correos y flyers de eventos **pasados**.
- «Cómo llegar» en `DetalleLocalScreen` (`:64`, `:117`) es un solo enlace a Google Maps
  (`urlComoLlegar`, `src/lib/mapa.ts`).

## Decisión

### 1. `src/lib/perfil.ts` (nuevo) — puro

Sin red ni React. Solo importa `formatearMonto` de `./precio` (que no tiene imports), así se
prueba con `npx tsx`. **Fechas en la hora local del teléfono**, no en el huso del país como
la web: es la convención de la app (spec 119, `src/lib/fechaCartelera.ts`), porque el
soporte de `Intl` con `timeZone` en Hermes (el motor JS de React Native) no está
garantizado. Días y meses salen de arreglos propios, sin `toLocaleString`.

```ts
export interface BloqueFecha { dia: string; num: string; mes: string }

/** «VIE» / «27» / «NOV»: día y mes abreviados a tres letras, en mayúscula, sin punto
 * («SÁB», «MIÉ», «DIC»). null sin comienzaAt o con fecha inválida. */
export function bloqueFecha(comienzaAt: string | null | undefined): BloqueFecha | null;

/** «21:30 · $6.000 CLP». Hora en 24 h desde comienzaAt (si no hay, el texto `hora`). Precio:
 * `formatearMonto(monto, moneda)` si `monto > 0`; si no, el texto libre `precio` si existe;
 * si no, solo la hora. Nunca dice «Gratis» por su cuenta: `monto` vacío no prueba que la
 * entrada sea gratis. */
export function lineaEvento(evento: {
  comienzaAt?: string | null; hora?: string; monto?: number; moneda?: string | null; precio?: string;
}): string;

/** Días de calendario entre hoy y el día del evento (0 = hoy, 1 = mañana). Calendario y no
 * horas: un evento a la 01:00 de mañana visto a las 22:00 es «mañana». */
export function diasHasta(comienzaAt: string, ahora: Date): number;

/** Lo que acompaña al sello «● En cartelera»: «Es hoy», «Mañana» o «en {n} días». */
export function cuandoCorto(comienzaAt: string, ahora: Date): string;

/** Saca del muro la entrada `evento:<eventId>` (un evento de hoy que ya empezó vuelve como
 * pasado en `muro_eventos_pasados` y saldría dos veces). No toca correos ni otros eventos
 * y no modifica el arreglo recibido. */
export function quitarEventoDelMuro<T extends { clave: string }>(entradas: T[], eventId: string): T[];

export interface RedPerfil { id: string; nombre: string; href: string }

/** Solo las redes con valor, en orden fijo. */
export function redesDelPerfil(perfil: {
  instagram?: string | null; spotify?: string | null; youtube?: string | null;
  tiktok?: string | null; sitioWeb?: string | null; telefono?: string | null; emailContacto?: string | null;
}, tipo: 'musician' | 'venue'): RedPerfil[];

export interface EnlacesComoLlegar { direccion: string; google: string; waze: string; apple: string }

export function enlacesComoLlegar(venue: {
  lat?: unknown; lng?: unknown; address?: string | null; comuna?: string | null; ciudad?: string | null;
}): EnlacesComoLlegar | null;
```

Reglas:

- `cuandoCorto` (textos de W-317 §3, que es como la web muestra hoy el pedido de W-309):
  `diasHasta ≤ 0` (un evento de hoy, aunque ya haya empezado) → «Es hoy»; `1` → «Mañana»;
  `n ≥ 2` → «en {n} días».
- `redesDelPerfil` (orden y nombres de W-316):
  - músico: `instagram` «Instagram», `spotify` «Spotify», `youtube` «YouTube», `tiktok`
    «TikTok», `sitioWeb` «Sitio web». Al músico no se le suman teléfono ni correo.
  - local: `instagram` «Instagram», `sitioWeb` «Sitio web», `telefono` «Llamar» (`tel:` con
    el número sin espacios), `emailContacto` «Correo» (`mailto:`).
  - `href`: Instagram con `https://` se deja; si no, `https://instagram.com/<usuario sin @>`
    (la regla de `urlInstagram` de `DetalleLocalScreen`). Sitio web sin `http(s)://` →
    se antepone `https://`. Spotify, YouTube y TikTok se usan tal cual (ya son URLs, como
    hoy en `VerMusicoScreen`). Valores con solo espacios cuentan como vacíos.
- `enlacesComoLlegar` (URLs literales de W-316):
  - Con `lat`/`lng` numéricos (`Number()`, finitos): Google
    `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`, Waze
    `https://waze.com/ul?ll={lat},{lng}&navigate=yes`, Apple
    `https://maps.apple.com/?daddr={lat},{lng}`.
  - Sin coordenadas pero con `address`: los mismos tres con la dirección completa codificada
    con `encodeURIComponent` (`destination=`, `q=` en Waze, `daddr=`).
  - Sin coordenadas ni dirección: `null`.
  - `direccion`: «{address}, {comuna}, {ciudad}» sin las partes vacías.
  - Descartado `geo:` en Android (de W-316): en iPhone y en el build web no hace nada; los
    tres https abren la app si está instalada y el navegador si no.

### 2. `src/hooks/useProximosEventos.ts` (nuevo)

```ts
export function useProximosEventos(
  tipo: TipoTenant,              // de src/hooks/useTenantCrm
  id: string | null | undefined,
  limite: number
): {
  eventos: Evento[] | null;      // null = cargando o error de lectura
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
};
```

La consulta es la de `getProximosEventos` de la web (W-316 + W-348), con el cliente de
`src/lib/supabase` (llave anónima; funciona sin sesión):

- `events` con `comienza_at >= inicioDeHoyLocal()` (`src/lib/fechaCartelera.ts`: un evento
  de hoy que ya empezó sigue en la lista hasta medianoche, como en la cartelera) y
  `.not('visible_en_cartelera', 'is', false)`, ordenado por `comienza_at` ascendente.
- **Local:** `venue_id = id`.
- **Banda** (la pertenencia del muro, `muro_evento_es_de`, más las bandas adicionales):
  1. ids de `artists` con `profile_id = id`;
  2. `event_id` de `event_artists` con `musico_id = id` o `artist_id` en esos ids;
  3. `events` con `.or()` de `created_by.eq.<id>`, `musico_id.eq.<id>`,
     `artist_id.in.(…)` (si hay fichas) e `id.in.(…)` (si hay filas del paso 2).
- Se piden `limite + 10` filas, se descartan `draft` y `cancelled` en JS y se corta a
  `limite` (mismo criterio que la web: el filtro de estado no se mezcla con el `or` de la
  banda). Se mapean con `mapEventoFromDB` (exportado de `src/context/EventosContext.tsx`;
  este spec no edita ese archivo).
- Un error en cualquier paso deja `eventos: null` y `error` con «No se pudieron cargar los
  próximos eventos.»; nunca una lista vacía que parezca «sin eventos» (regla de `useMuro`).
- Sin `id`, no consulta y devuelve `eventos: []`.
- Si cambia `id` antes de que llegue la respuesta, la vieja se descarta (como
  `usePerfilMusico`).

### Lo que NO cambia

- `src/lib/mapa.ts` (`urlComoLlegar` sigue para quien lo use; queda anotada la duplicación
  del enlace de Google para unificarla después), `src/lib/muro.ts`, `src/hooks/useMuro.ts`,
  `src/hooks/useEventosDelLocal.ts`.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `src/lib/perfil.ts` no importa React, `src/lib/supabase` ni nada de `src/context`
   (`grep -n "^import" src/lib/perfil.ts` muestra solo `./precio`).
3. Prueba con `npx tsx` de `src/lib/perfil.ts` (con `TZ=America/Santiago`):
   - `bloqueFecha('2026-11-28T01:30:00Z')` → `{ dia: 'VIE', num: '27', mes: 'NOV' }`;
   - `lineaEvento` con `monto`, con solo `precio` y sin ninguno (solo la hora);
   - `diasHasta`: hoy (0), mañana (1), un evento a la 01:00 de mañana visto a las 22:00 (1), en 3 días (3);
   - `cuandoCorto`: «Es hoy», «Mañana» y «en 3 días»;
   - `quitarEventoDelMuro`: quita `evento:<id>`, deja correos y otros eventos, no modifica la entrada;
   - `redesDelPerfil`: solo las cargadas y en orden; el local suma «Llamar» y «Correo» con
     `tel:` sin espacios y `mailto:`; el músico no; `@banda` → `https://instagram.com/banda`;
   - `enlacesComoLlegar`: con coordenadas, solo con dirección (codificada), sin nada → `null`.
4. Lectura del código: `useProximosEventos` filtra por `musico_id` en `events` y en
   `event_artists`, y no usa ninguna llave que no sea la anónima.
5. `git diff --stat` del commit toca solo los dos archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- `useProximosEventos('musician', id, 3)` de una banda que solo figura como banda adicional
  (`event_artists`) de un evento futuro lo devuelve.
- La misma consulta para una banda con cuenta que es `musico_id` de un evento creado por un
  local lo devuelve.

## Fuera de alcance

- Dibujar todo esto (spec 202).
- «Copiar dirección»: necesita `expo-clipboard`, una dependencia nativa nueva. La
  dirección se muestra como texto seleccionable (spec 202).
- «Abierto hoy»: `venues.horarios` es texto libre.
