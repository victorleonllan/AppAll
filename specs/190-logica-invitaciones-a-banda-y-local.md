# Spec 190 — La app invita a una banda a Sonópolis y al dueño del local que registró

> Estado: propuesto (27-nov-2026)
> Capa: LÓGICA. `src/lib/invitacionesSonopolis.ts` (nuevo), `src/lib/invitacionLocal.ts`.
> Depende de: W-302, W-307 y W-336 (tabla `sonopolis_invites`, RPC `invitar_a_sonopolis`, `revocar_invitacion_sonopolis`, `invitar_dueno_local`; ya en producción); W-304 y W-337 (rutas `POST`/`DELETE /api/invitaciones-sonopolis` y `POST /api/invitaciones-local` de la web, que aceptan el Bearer de la app, W-246). Ningún spec de la app.
> Alimenta: spec 199 (pantallas).
> Hermano en la web: W-304 (`libs/data/invitacionesSonopolis.js`, `libs/invitarApi.js`) y W-337 (`libs/data/invitacionesLocal.js`, `enviarInvitacionLocal`).

> **En una frase:** la app crea, reenvía y cancela la invitación de una banda a Sonópolis, lista
> las que hizo, e invita por correo al dueño real del local que registró, todo por las rutas de
> la web que ya mandan el correo.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en el
mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después de
esta orquestación.»

En la web, el local invita a cada banda sin cuenta de su evento (W-306), desde su panel (W-306),
y el músico invita al local que registró (W-338). La app no puede hacer ninguna de las tres
cosas. Mandar el correo necesita la llave de Resend, que vive en la web: por eso la app llama a
las rutas de la web con `llamarApiWeb` (spec 135), como ya hace con el correo del CRM.

**Por qué crear y mandar van en una sola llamada** (decisión de W-304, se copia): si fueran dos
llamadas, un fallo de red entre ellas deja una invitación creada sin que nadie se entere. La
ruta crea (o reusa) la invitación y manda el correo en el mismo handler; si Resend falla
responde `{ ok, token, emailError }` y la invitación vale igual. Reenviar = volver a llamar.

## Decisión

### `src/lib/invitacionesSonopolis.ts` (nuevo)

```ts
export type EstadoInvitacionSonopolis = 'pending' | 'accepted' | 'revoked';

export interface InvitacionSonopolis {
  id: string;
  correo: string;
  nombre: string;
  artistId: string | null;   // la ficha invitada (sin ficha: invitación desde el panel)
  eventId: string | null;
  token: string;
  estado: EstadoInvitacionSonopolis;
  creadaAt: string;
  enviadaAt: string | null;
  aceptadaAt: string | null;
}

export interface ResultadoInvitacion { ok: true; token: string; emailError?: string }

/** Crea o reenvía (mismo correo = mismo token). POST /api/invitaciones-sonopolis. */
export function enviarInvitacionSonopolis(datos: { email: string; nombre?: string | null; artistId?: string | null; eventId?: string | null }): Promise<ResultadoInvitacion>;

/** Revoca. DELETE /api/invitaciones-sonopolis con { token }. */
export function cancelarInvitacionSonopolis(token: string): Promise<void>;

/** Las invitaciones que hizo la sesión (RLS `sonopolis_invites_select_own`: solo las propias),
 * sin las revocadas, recientes primero. */
export function getMisInvitacionesSonopolis(opciones?: { eventId?: string | null; limite?: number }): Promise<InvitacionSonopolis[]>;

/** Texto para mostrar bajo el campo cuando una llamada de invitación falla. */
export function mensajeErrorInvitacion(err: unknown): string;

export const ESTADO_INVITACION: Record<EstadoInvitacionSonopolis, string>;
```

- `enviarInvitacionSonopolis` → `llamarApiWeb<ResultadoInvitacion>('/api/invitaciones-sonopolis', { metodo: 'POST', cuerpo: { email: email.trim(), nombre, artistId, eventId } })`,
  mandando `null` en vez de `undefined` o vacío, como la web.
- `cancelarInvitacionSonopolis` → `llamarApiWeb('/api/invitaciones-sonopolis', { metodo: 'DELETE', cuerpo: { token } })`.
- `getMisInvitacionesSonopolis` lee con el cliente de `src/lib/supabase`:
  `sonopolis_invites.select('*').neq('status', 'revoked').order('created_at', desc).limit(limite ?? 50)`,
  con `.eq('event_id', eventId)` si viene. Mapea como `mapInvitacion` de la web. Un error se lanza.
- `mensajeErrorInvitacion`: si es `ErrorApiWeb` con `status === 401` o `codigo === 'no_autenticado'`
  → «Inicia sesión para invitar.»; con `status >= 500` o un error de red (`TypeError` de
  `fetch`) → «No se pudo conectar con Sonópolis. Intenta de nuevo.»; si no, el mensaje que trae
  (los errores de la base ya vienen en español: «solo locales y músicos pueden invitar a
  Sonópolis», «necesitas entrar para invitar», «Falta el correo»…); sin mensaje, «No se pudo
  completar».
- `ESTADO_INVITACION`: `pending` → «Pendiente», `accepted` → «Ya entró», `revoked` → «Cancelada»
  (los dos primeros son literales de `BotonInvitarASonopolis.js` de la web).

### `src/lib/invitacionLocal.ts`

Suma, sin tocar lo que ya hay:

```ts
/** Spec 190 (W-337) — el músico invita al dueño real del local que registró al crear su evento.
 * POST /api/invitaciones-local. El permiso lo decide `invitar_dueno_local` en Postgres; el error
 * llega en español. Si Resend falla, `emailError` y la invitación vale igual. */
export function invitarDuenoLocalDelEvento(datos: { venueId: string; email: string }): Promise<{ ok: true; token: string; emailError?: string }>;
```

→ `llamarApiWeb('/api/invitaciones-local', { metodo: 'POST', cuerpo: { venueId, email: email.trim() } })`.
Sus errores se muestran con `mensajeErrorInvitacion` del módulo nuevo.

### Lo que NO hace

- `/unete/<token>` (la banda acepta) queda en la web: el correo lleva al dominio web, como la
  invitación del local (W-232).
- No cambia la base ni las rutas de la web.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `grep -n "/api/invitaciones-sonopolis" src/lib/invitacionesSonopolis.ts` devuelve las llamadas
   `POST` y `DELETE`; `grep -n "/api/invitaciones-local" src/lib/invitacionLocal.ts` devuelve la
   llamada `POST`.
3. `grep -n "fetch(" src/lib/invitacionesSonopolis.ts src/lib/invitacionLocal.ts` no devuelve nada:
   todo pasa por `llamarApiWeb` (Bearer de la sesión, dominio sin `www`).
4. Lectura del código: ningún `console.*` imprime el token de sesión ni el correo invitado.
5. `git diff --stat` del commit toca solo los dos archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Llega con las pantallas del spec 199: invitar una banda desde la app y recibir el correo con el
  enlace `/unete/<token>`; invitar al dueño de un local registrado por un músico y recibir el de
  `/invitacion/<token>`.
