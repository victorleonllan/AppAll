# Spec 135 — Lógica para gestionar un evento como en la web: preventas, banco, cobro, artistas e invitaciones

> Estado: propuesto (16-oct-2026)
> Capa: LÓGICA. `src/context/EventosContext.tsx`, `src/types/index.ts`, `src/hooks/useEntradasEvento.ts`, `src/hooks/usePreventas.ts` (nuevo), `src/hooks/useCobroEvento.ts` (nuevo), `src/hooks/useInvitacionesEquipo.ts` (nuevo), `src/lib/datosPago.ts` (nuevo), `src/lib/artistas.ts` (nuevo), `src/lib/fecha.ts`, `src/lib/apiWeb.ts` (nuevo), `src/lib/invitacionLocal.ts` (nuevo).
> Depende de: spec 095, spec 115, spec 116
> Alimenta: spec 136, spec 137, spec 138, spec 139, spec 140, spec 141
> Hermano en la web: `libs/data/preventas.js`, `libs/data/pagos.js`, `libs/data/artists.js`, `libs/data/colaboradores.js`, `libs/data/invitacionesLocal.js`, `libs/fecha.js`, y W-246 (las rutas que llama `apiWeb.ts`).

> **En una frase:** todo el acceso a datos que necesitan las pantallas 136–141 queda en
> hooks y funciones de `src/`, para que esas pantallas sean solo FRONTEND y puedan ir en
> paralelo: preventas, datos bancarios y cobro, artistas de la tabla `artists`, fecha
> exacta del show, invitaciones del equipo, reenvío de entradas e invitación de local.

## Contexto

La web gestiona un evento con funciones de `libs/data/` que la app no tiene. La base es la
misma (las tablas y RPC son de este repo), así que esto es portar consultas, no diseñar
datos nuevos.

Hay además un bug vivo que este spec deja listo para cerrar: **vincular un artista al crear
un evento desde la app falla**. `CrearEventoScreen.tsx:57-60` busca con
`search_collaborator_candidates`, que devuelve ids de `profiles`, y los manda como
`artist_id` (`EventosContext.tsx:65`). Pero desde el spec 061 `events.artist_id` apunta a
`artists(id)` (`supabase/migrations/20260827000000_spec_061_tabla_artists_placeholder.sql:45-48`),
así que el insert viola la FK (Postgres `23503`). La web busca y crea en `artists`
(`sonopolisWeb/libs/data/artists.js:7-69`). El trigger `events_claim_owner` ya resuelve el
músico detrás del artista (`20260901120000_spec_061_fix_claim_owner_artist_fk.sql:28-34`),
así que usar `artists` no pierde el «entra al equipo».

Las llamadas que necesitan una llave de servidor (mandar correos con Resend, leer correos de
`auth.users`) viven en rutas de la web. Hoy esas rutas solo aceptan la cookie de la web; el
W-246 les agrega el `Authorization: Bearer <access_token>` de la sesión de la app.

## Diseño

Ningún archivo nuevo tiene `catch {}` vacío ni datos mock: los errores se tiran con el
mensaje de Postgres o de la ruta, como dejó el spec 115.

### 1. `Evento`: los campos que la web ya usa

En `src/types/index.ts`:

- `export type TipoPrecio = 'general' | 'puerta';`
- `Evento` suma `descripcion?: string | null`, `tipoPrecio?: TipoPrecio`,
  `visibleEnCartelera?: boolean` y, **solo si el spec 116 no lo agregó**,
  `comienzaAt?: string | null`. `pais` ya lo agrega el 095.

En `src/context/EventosContext.tsx`:

- `mapEventoFromDB` suma `descripcion: db.description ?? null` (la columna se llama
  `description`, spec 087), `tipoPrecio: db.tipo_precio ?? 'general'` y
  `visibleEnCartelera: db.visible_en_cartelera ?? true` (spec 079: positivo con default
  `true`).
- `mapEventoToDB` suma `description: evento.descripcion?.trim() || null` y
  `tipo_precio: evento.tipoPrecio ?? 'general'`. `visible_en_cartelera` no se manda al
  crear: el default de la columna ya es `true`.
- `updateEvento` amplía su `Pick` con `'descripcion' | 'tipoPrecio' | 'visibleEnCartelera' | 'comienzaAt' | 'pais'`
  y su objeto `cambiosDB` suma, con el mismo patrón campo por campo:
  `description` (con `trim() || null`), `tipo_precio`, `visible_en_cartelera`,
  `comienza_at` y `pais`. Si el 095 o el 116 ya agregaron alguno, no se duplica.
- `montoDesdePrecio` pasa a exportarse (`export function`), para que las preventas usen la
  misma regla que el evento. Si el 116 la movió a un módulo propio, no se toca acá: se
  importa desde ese módulo.

### 2. `src/lib/fecha.ts` — la fecha exacta del show

El spec 116 ya crea `src/lib/fecha.ts` con `formatearFechaEs`, `armarFechaHora` y
`separarFechaHora` (copia de `sonopolisWeb/libs/fecha.js:35-62`). Este spec **no** crea otro
archivo de fechas: usa esas funciones y solo **agrega** a `src/lib/fecha.ts`:

- `fechaHoraValidas(fechaISO, horaISO): boolean`: `^\d{4}-\d{2}-\d{2}$`, `^\d{2}:\d{2}$`
  y que `armarFechaHora` no produzca una fecha inválida.

(Ajuste de diseño del 17-oct-2026, antes de ejecutar: la primera versión creaba
`src/lib/fecha.ts` con funciones duplicadas del 116.)

### 3. `src/hooks/usePreventas.ts`

Tipos en `src/types/index.ts`: `CierreTipo = 'horas_antes' | 'fecha'`;
`BorradorPreventa { precio: string; cupo: number; cierreTipo: CierreTipo; cierreHorasAntes: number | null; cierreAt: string | null }`;
`Preventa` = borrador + `id, eventId, nombre, orden, monto, vendidos, activa, cierraAt, createdAt`.

Exportaciones:

- `CIERRE_RECOMENDADO = { cierreTipo: 'horas_antes', cierreHorasAntes: 3 }` (copia del
  DEFAULT de la columna, spec 082).
- `cierreCompleto(c)`: `fecha` exige `cierreAt`; `horas_antes` exige entero `>= 0`.
- `crearPreventasDeBorrador(eventoId, borradores)`: inserta en orden, **secuencial**, una
  por una, después de que el evento existe (RLS de `event_preventas` exige
  `can_edit_event`). Devuelve las creadas.
- `usePreventas(eventoId)` → `{ preventas, cargando, error, recargar, crear(borrador), actualizar(id, cambios), cerrar(id) }`.

Reglas, iguales a `libs/data/preventas.js:33-111`:

- Leer: `select('*, preventa_cierra_at')`, `eq('event_id')`, orden por `orden`.
- Crear: `nombre = \`Preventa ${orden}\``, `orden` = máximo existente + 1 (nunca se reciclan
  números), `monto = montoDesdePrecio(precio)`, y el cierre como trío (`cierre_horas_antes`
  solo con `horas_antes`, `cierre_at` solo con `fecha`). Sin cupo o con cupo `<= 0` tira
  `Error('Falta el cupo de la preventa — toda preventa necesita un límite')` antes de ir a
  la base (spec 068: `cupo` es obligatorio).
- Actualizar: parcial; `monto` se recalcula solo si viene `precio`; el cierre viaja como
  trío o no viaja.
- Cerrar: `activa = false`. Nunca se borra la fila: los tickets vendidos apuntan a ella.

### 4. `src/lib/datosPago.ts` — datos bancarios

Tipos: `TipoCuenta = 'corriente' | 'vista' | 'ahorro' | 'rut'`;
`DatosPago { banco; tipoCuenta; numeroCuenta; titular; rut; emailContacto }`;
`EstadoPayout = 'pendiente' | 'reclamado' | 'pagado'`;
`Payout` = `DatosPago` + `eventoId, status, reclamadoAt, pagadoAt, montoPagado`.

- `TIPOS_CUENTA: { valor: TipoCuenta; etiqueta: string }[]` con «Cuenta corriente», «Cuenta
  vista», «Cuenta de ahorro», «Cuenta RUT» (el CHECK del spec 073).
- `hayAlgunDatoPago(d)` y `datosPagoCompletos(d)`: sobre `banco`, `numeroCuenta`,
  `titular`, `rut` con `trim()`, más `tipoCuenta` en el segundo (`FormEvento.js:84-88`).
- `getPayout(eventoId)`: `maybeSingle()` sobre `event_payouts`; `null` si no hay fila. La
  RLS solo se la da al owner, así que para cualquier otro también es `null`.
- `guardarDatosPago(eventoId, datos)`: `upsert` con `onConflict: 'event_id'` mandando
  **solo** `event_id` y las seis columnas de datos. Nunca `status`, `pagado_at`,
  `pagado_por` ni `monto_pagado`: el trigger `event_payouts_guard_estado` hace fallar todo
  el guardado si vienen desde una sesión de usuario (`libs/data/pagos.js:23-33`).

### 5. `src/hooks/useCobroEvento.ts`

`useCobroEvento(eventoId, habilitado: boolean)` → `{ cargando, error, payout, monto, moneda, showTermino, cancelado, recargar, reclamar }`.

Con `habilitado = false` no consulta nada: `monto_a_transferir` es `SECURITY DEFINER` sin
guarda de dueño (spec 074), y la pantalla lo habilita solo para el owner.

Con `habilitado = true`, en paralelo: `getPayout`, `rpc('monto_a_transferir', { p_event })`
y `events.select('moneda, comienza_at, status').eq('id').single()`. Deriva
`showTermino = comienza_at != null && comienza_at < ahora` y `cancelado = status === 'cancelled'`.
`reclamar()` llama `rpc('reclamar_pago_evento', { p_event })` y reemplaza `payout` con la
fila que devuelve. Las guardas (owner, show terminado, datos bancarios) viven en el RPC
(spec 075) y no se repiten acá; su mensaje sube tal cual.

El mapeo de `Payout` incluye `reclamadoAt: db.reclamado_at ?? null`. La web lo omite en
`mapPayoutFromDB` y por eso nunca muestra «Lo pediste el…»; acá no se copia esa omisión.

### 6. `src/lib/artistas.ts`

- `ArtistaBreve { id: string; nombre: string }`.
- `buscarArtistas(q)`: con menos de 2 caracteres devuelve `[]`; si no,
  `from('artists').select('id, name').ilike('name', \`%${q}%\`).order('name').limit(8)`.
- `crearArtista({ nombre, contacto, instagram, creadoPor })`: `insert` con `name`,
  `contacto`, `instagram` (vacíos → `null`) y `created_by`; la policy `artists_insert` exige
  `auth.uid() = created_by`. Sin `creadoPor` tira antes de llamar a la base.

### 7. `src/lib/apiWeb.ts` — llamar a la web con la sesión de la app

```ts
const URL_WEB = process.env.EXPO_PUBLIC_WEB_URL || 'https://sonopolis.org';
export class ErrorApiWeb extends Error { status: number; codigo: string; }
export async function llamarApiWeb<T>(ruta: string, opciones?: { metodo?: 'GET' | 'POST'; cuerpo?: unknown }): Promise<T>;
```

- Toma el `access_token` de `supabase.auth.getSession()`. Sin sesión tira
  `ErrorApiWeb(401, 'no_autenticado')` **sin** hacer el `fetch`.
- Manda `Authorization: Bearer <token>` y, si hay cuerpo, `Content-Type: application/json`.
- Respuesta no 2xx → `ErrorApiWeb(status, body?.error ?? \`HTTP ${status}\`)`; el mensaje es
  el mismo `codigo`. Cuerpo no JSON → se trata como `{}`.
- Nunca escribe el token en un `console.*`.

**Por qué el dominio sin `www`:** `https://www.sonopolis.org` responde `307` hacia el
dominio raíz, y una petición con preflight de CORS no sigue redirecciones (verificado con
`curl` el 16-oct-2026). En el build web de Expo eso rompería la llamada.

### 8. `src/hooks/useInvitacionesEquipo.ts`

`useInvitacionesEquipo(eventoId, { esOwner, puedeInvitar })` →
`{ pendientes, emailsEquipo, errorEmails, cargando, recargar, invitarPorCorreo(email, rol), revocar(id) }`.

- `PARECE_CORREO = /\S+@\S+\.\S+/` exportado (mismo criterio que `PanelEquipo.js:31`).
- `pendientes`: solo si `puedeInvitar`; `event_collaborator_invites` con
  `select('id, email, role, created_at')`, `status = 'pending'` (RLS `eci_select`).
- `invitarPorCorreo(email, rol)`: rol `'admin' | 'editor'`;
  `llamarApiWeb('/api/eventos/<id>/invitar-email', { metodo: 'POST', cuerpo: { email: email.trim().toLowerCase(), role: rol } })`.
  Devuelve `{ emailError: string | null }`: la ruta responde `200 { ok, emailError }` cuando
  la invitación quedó creada pero Resend falló. Después recarga `pendientes`.
- `revocar(id)`: `update({ status: 'revoked' }).eq('id', id)` (RLS `eci_update_revoke`).
- `emailsEquipo: Record<userId, string | null>`: solo si `esOwner`,
  `llamarApiWeb('/api/eventos/<id>/equipo-emails')`. Si falla, `emailsEquipo = {}` y
  `errorEmails` lleva el mensaje: el equipo se muestra igual, sin correos.

### 9. `src/hooks/useEntradasEvento.ts` — saber si el correo salió, y reenviarlo

- El join pasa a `ticket:tickets(user_id, cantidad, status, entrada_enviada_at)`.
- `TicketItem` (en `types`) suma tres campos **opcionales**, para no romper a quien ya
  construye `TicketItem`: `compraPagada?: boolean` (`ticket.status === 'completed'`),
  `cantidadEnCompra?: number`, `entradaEnviadaAt?: string | null`.
- El hook suma `reenviarCorreo(ticketId): Promise<string>`:
  `llamarApiWeb('/api/entradas/reenviar', { metodo: 'POST', cuerpo: { ticket_id } })`,
  devuelve `enviadoAt` y lo escribe en **todas** las entradas de esa compra en el estado (el
  correo lleva la compra entera, `BotonReenviar.js:19-21`). Errores: `ErrorApiWeb` con el
  código de la ruta (`sin_email`, `ticket_no_pagado`, `no_encontrado`, `envio_fallido`).

### 10. `src/lib/invitacionLocal.ts`

- `esTokenInvitacion(token)`: regex UUID de `invitacion/[token]/page.js`.
- `getInvitacionLocalPublica(token)`: `rpc('invitacion_local_publica', { p_token }).maybeSingle()`
  → `null` o `{ nombreLocal, tipo, direccion, comuna, imagen, pais, correo, estado }` con
  `estado: 'pending' | 'accepted' | 'revoked'`. Funciona sin sesión (`grant` a `anon`).
- `reclamarInvitacionLocal(token)`: `rpc('reclamar_invitacion_local', { p_token })`; error →
  `Error(mensaje de la base)`. Si funcionó, **llama `supabase.auth.refreshSession()`**: la
  función cambia `user_metadata.role` a `local` en la base (W-230,
  `_aplicar_invitacion_local`), pero el JWT de la app trae el rol viejo hasta refrescarlo, y
  `AuthContext` decide las pestañas con ese rol.
- `cerrarSesionSoloAqui()`: `supabase.auth.signOut({ scope: 'local' })`. `scope: 'local'`
  cierra esta sesión y no las de la persona en otros dispositivos.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. Ningún archivo de la columna Capa tiene `catch {}` vacío ni importa `data/mock`
   (`grep -n "catch {}\|data/mock"` sobre ellos → 0 líneas).
3. Crear un evento con `descripcion` y `tipoPrecio: 'puerta'` deja `description` y
   `tipo_precio` en la fila; `updateEvento(id, { visibleEnCartelera: false })` deja
   `visible_en_cartelera = false` y no toca `monto`.
4. `crearPreventasDeBorrador` con dos borradores deja «Preventa 1» y «Preventa 2» con
   `orden` 1 y 2 y `monto` igual a `montoDesdePrecio(precio)`; con cupo `0` tira el error
   del §3 sin insertar.
5. `guardarDatosPago` dos veces sobre el mismo evento deja una sola fila, y el cuerpo del
   `upsert` no contiene `status`.
6. Elegir un artista de `buscarArtistas` y crear el evento no da `23503`.
7. `llamarApiWeb` sin sesión tira `ErrorApiWeb` con `status === 401` y no hace `fetch`.
8. `reclamarInvitacionLocal` con un UUID sin fila tira «no existe esa invitación».

## Fuera de alcance

- Las pantallas: 136 (formulario), 137 (cancelar, borrar, ocultar), 138 (equipo), 139
  (reenvío), 140 (cobro), 141 (invitación).
- Filtrar `visibleEnCartelera === false` en la cartelera: es de quien toque
  `CarteleraScreen` (spec 119).
- El aviso «Todavía no vendemos entradas en <país>» de `paises_cobro` (W-168).
- Cambiar las rutas de la web: W-246.

## Verificación manual

- **V-candidata 135-a:** con la app contra producción, crear un evento de prueba con
  artista nuevo, preventas y banco, y revisar con SQL `events`, `artists`,
  `event_preventas` y `event_payouts`. Borrar el evento de prueba al terminar.
