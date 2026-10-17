# Spec 132 — Pantalla de solicitudes para músico y local, y «Solicitar» desde la ficha del músico

> Estado: aplicado (17-oct-2026) — `npx tsc --noEmit` limpio fuera de `supabase/functions` (criterio 1), `npx expo export --platform web` sin errores (10), sin cambios en `src/navigation/`, `PerfilMusicoScreen` ni `DashboardLocalScreen` (9). Criterios 2–8 y V-candidatas 1–3 pendientes de probar en ejecución contra Supabase.
> Capa: FRONTEND. `src/screens/SolicitudesScreen.tsx`, `src/components/ModalSolicitud.tsx` (nuevo), `src/constants/solicitudes.ts` (nuevo), `src/screens/VerMusicoScreen.tsx`.
> Depende de: spec 114 (registra la ruta `Solicitudes` en `MusicoStack` y `MiLocalStack` con su pantalla provisoria, y ya agrega el botón «📨 Solicitudes» en los dos paneles), spec 131 (`useSolicitudes`, `useConexiones`), spec 121 (`useMusicos`), spec 122 (reemplaza `VerMusicoScreen` con datos reales).
> Alimenta: —
> Hermano en la web: `components/PanelConexiones.js`, `components/PanelSolicitudes.js`, `components/ModalSolicitud.js` (W-034, W-055, W-057, W-060), `app/(private)/musico/solicitudes/page.js`, `app/(private)/local/solicitudes/page.js`, `libs/constants.js:80-86` (`MENSAJES_SOLICITUD`).

> **En una frase:** la pantalla `Solicitudes` (tres pestañas: Solicitudes, Músicos, Locales)
> igual a la de la web para músico y local, un modal reutilizable para mandar una solicitud o
> una conexión, y el botón «Solicitar»/«Conectar» en la ficha pública del músico.

## Contexto

En la web, `/musico/solicitudes` y `/local/solicitudes` montan el mismo `PanelConexiones`
(`PanelConexiones.js:15-27`) con tres pestañas:

- **Solicitudes:** las solicitudes de bolo donde soy parte. La contraparte acepta o rechaza;
  quien la creó la puede cancelar mientras está `pending`; las demás muestran su estado
  (`PanelSolicitudes.js:69-138`).
- **Músicos:** galería de músicos. Para el músico, cada tarjeta lleva «Conectar» (o
  «Pendiente»/«Conectado»), y arriba las conexiones que le llegaron, para aceptar o rechazar
  (`PanelConexiones.js:145-171`, `244-293`). Para el local, «Solicitar» (bolo), salvo que no
  tenga ficha de local: entonces un aviso con enlace a crearla (`:248-261`).
- **Locales:** galería de locales. El músico ve «Solicitar» en cada una y un aviso de
  completar su perfil (`:296-312`). El local la ve sin botón: `booking_requests` es solo
  músico ↔ local (`:22-28`).

En la app no existe nada de esto. Las entradas posibles son el panel del músico
(`PerfilMusicoScreen.tsx:207-234`), el panel del local (`DashboardLocalScreen.tsx:186-203`) y
la ficha del músico (`VerMusicoScreen.tsx`), que hoy muestra datos de `musicosMock` y el
spec 122 reemplaza.

## Diseño

### 1. `src/constants/solicitudes.ts` (nuevo)

Copia literal de `sonopolisWeb/libs/constants.js:80-86`:

```ts
export const MENSAJES_SOLICITUD = {
  musicoAlLocal: 'Me gustaría tocar en tu local.',
  localAlMusico: 'Me gustaría que toques en mi local.',
  musicoAlMusico: 'Me gustaría conectar contigo.',
} as const;
```

### 2. `src/components/ModalSolicitud.tsx` (nuevo)

`Modal` de React Native (`transparent`, `animationType="fade"`), equivalente a
`ModalSolicitud.js`:

```ts
interface ModalSolicitudProps {
  visible: boolean;
  destino: string;                  // nombre que va en el título
  mensajeInicial: string;
  titulo?: string;                  // default 'Solicitar a'
  subtitulo?: string;               // default 'Le llega a su panel de Solicitudes, donde puede aceptar o rechazar.'
  mostrarFecha?: boolean;           // default true; false para conectar entre músicos (W-060)
  onCancelar: () => void;
  onEnviar: (datos: { note: string | null; proposedAt: string | null }) => Promise<void>;
}
```

- Título `` `${titulo} ${destino}` ``, subtítulo, campo «Mensaje» multilínea precargado con
  `mensajeInicial` y editable.
- Si `mostrarFecha`: «Fecha propuesta (opcional)» con dos `TextInput`: fecha `AAAA-MM-DD` y
  hora `HH:MM`. Vacíos → `proposedAt: null`. Con fecha y sin hora → hora `20:00`. Se arma
  `new Date(año, mes - 1, día, hh, mm)` (hora local del teléfono, que es la que la persona
  escribió) y se manda `.toISOString()`. Formato inválido o fecha inexistente →
  `Alert.alert('Revisa la fecha', 'Usa el formato AAAA-MM-DD y HH:MM.')` sin enviar.
  **Por qué texto y no un selector de fecha:** la app no tiene un *date picker* instalado
  (sería una dependencia nativa más) y la fecha es opcional a propósito: el primer contacto
  no debe convertirse en una negociación (`ModalSolicitud.js:9-14`).
- Botones «Cancelar» y «Enviar solicitud». Mientras `onEnviar` corre, los dos quedan
  deshabilitados y «Enviar» muestra `ActivityIndicator`. Si `onEnviar` lanza, el modal **no**
  se cierra (quien llama ya mostró la alerta).
- `note`: el texto con `trim()`; vacío → `null`.

### 3. `src/screens/SolicitudesScreen.tsx` — reemplaza la pantalla provisoria del 114

**Quién mira:** `lado = role === 'musician' ? 'musico' : 'local'` (de `useAuth()`). La ruta
solo está montada en `MusicoStack` y `MiLocalStack`, así que no hay un tercer caso. No se
compara contra `'cafe'` ni `'local'`: el spec 048 cambia ese literal y esta pantalla no debe
depender de cuándo se aplique.

**Datos:**
- `useSolicitudes()` y, solo si `lado === 'musico'`, `useConexiones()` (el hook se llama
  siempre por las reglas de los hooks; si `lado === 'local'` se ignora su resultado).
- `useMusicos()` del spec 121 **sin opciones**, que devuelve los músicos de todos los países:
  una solicitud no se esconde por país (mismo criterio que W-206 en la web). Su estado de
  carga se llama `loading`, no `cargando`.
- `useVenues().allVenues` para la galería de locales.
- `miVenueId = allVenues.find((v) => v.ownerId === user.id)?.id ?? null` (solo para el local).

**Pestañas:** fila propia de tres botones («Solicitudes», «Músicos», «Locales»), la activa
con borde inferior `colors.accent`. Cambiar de pestaña limpia la búsqueda.

**Pestaña Solicitudes** (lista de `SolicitudBolo`):
- Contraparte: `s.musicianId === user.id ? s.venueNombre : s.musicoNombre` (`?? '—'`).
- Debajo: fecha propuesta con `toLocaleString('es-CL')` o «Sin fecha propuesta», `· genre`
  si hay, y la nota.
- `pending` y `!propuseYo` → «Rechazar» y «Aceptar» (`responder`).
- `pending` y `propuseYo` → «Cancelar» (`cancelar`), en `colors.danger`.
- Otro estado → etiqueta: Pendiente / Aceptada / Rechazada / Cancelada.
- Vacía → «Todavía no hay solicitudes.»
- Error de una acción → `Alert.alert('No se pudo responder' | 'No se pudo cancelar', err.message)`.

**Pestaña Músicos:**
- Excluye mi propio id. Buscador por `nombre` (`TextInput`, sin distinguir mayúsculas).
- Si `lado === 'local'` y `!miVenueId` → aviso «Para solicitarle a un músico necesitas tener
  la ficha de tu local creada.» con botón «Crear mi local» → `navigation.navigate('EditarLocal')`.
- Si `lado === 'musico'` y hay conexiones recibidas `pending` → sección «Te quieren conectar»
  con nombre, nota, «Rechazar»/«Aceptar» (`useConexiones().responder`).
- Botón por tarjeta:
  - músico mirando: `musicosYaConectados` da `accepted` → «Conectado» (deshabilitado);
    `pending` → «Pendiente» (deshabilitado); si no → «Conectar», abre el modal con
    `mensajeInicial = MENSAJES_SOLICITUD.musicoAlMusico`, `mostrarFecha={false}`,
    `titulo="Conectar con"`.
  - local con `miVenueId`: id en `contrapartesConSolicitudViva(solicitudes, 'musician')` o
    enviado en esta sesión → «Solicitud enviada» (deshabilitado); si no → «Solicitar», modal
    con `MENSAJES_SOLICITUD.localAlMusico`.
- Tarjeta: nombre, tipo de proyecto (`TIPO_PROYECTO_LABEL`), ciudad, y el botón.

**Pestaña Locales:**
- Excluye `miVenueId`. Buscador por `name`.
- Músico mirando: texto «Un local decide con lo que ve en tu perfil. Completa el tuyo antes
  de escribirle.» con enlace a `EditarPerfilBanda`; cada tarjeta con «Solicitar» (o «Solicitud
  enviada» si está en `contrapartesConSolicitudViva(solicitudes, 'venue')` o se envió en esta
  sesión), modal con `MENSAJES_SOLICITUD.musicoAlLocal`.
- Local mirando: tarjetas sin botón.
- Tarjeta: nombre, `venueEmoji(type)` + `venueLabel(type)`, comuna.

**Enviar:**
- Bolo: `crear({ musicianId: tipo === 'musico' ? item.id : user.id, venueId: tipo === 'musico' ? miVenueId : item.id, proposedAt, note })`.
- Conexión: `useConexiones().crear({ toMusician: item.id, note })`.
- Éxito → cierra el modal, agrega el id a `enviados` (estado local, para que el botón cambie
  antes de que llegue la recarga), `Alert.alert('Solicitud enviada')`.
- Error → `Alert.alert('No se pudo enviar', err.message)` y relanza (el modal queda abierto).

**Cargando/errores de carga:** `ActivityIndicator` mientras `cargando`; si un hook trae
`error`, se muestra el texto y un botón «Reintentar» que llama `refrescar()`.

### 4. `VerMusicoScreen.tsx` — botón en la ficha del músico

Sobre la versión que deja el spec 122 (no sobre la actual con `musicosMock`). Al final de la
tarjeta, un solo botón según quién mira:

- Sin sesión, o el músico soy yo → nada.
- `role === 'musician'` → el mismo botón de conexión de la pestaña Músicos
  (Conectar / Pendiente / Conectado), con `useConexiones()`.
- El usuario es dueño de un local (`miVenueId` como arriba) → «Solicitar» / «Solicitud
  enviada», con `useSolicitudes()` y `MENSAJES_SOLICITUD.localAlMusico`.
- Cualquier otro caso (fan) → nada.

Usa el mismo `ModalSolicitud` y los mismos textos de éxito y error que la pantalla. Esta es
una entrada que la web no tiene (allí se solicita solo desde el panel), y se agrega porque en
la app la ficha del músico es donde el local decide.

### 5. Entradas desde los paneles

Las pone el spec 114 (Decisión 7): «📨 Solicitudes» en `PerfilMusicoScreen` y en
`DashboardLocalScreen`. Este spec no toca esos dos archivos ni `src/navigation/`.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio.
2. Como músico: desde «Locales», solicitar a un local con mensaje y fecha → aparece en «Solicitudes» como pendiente con «Cancelar», y la fila existe en `booking_requests` con `musician_id = yo`, `created_by = yo`.
3. Como el dueño de ese local: la misma solicitud aparece con «Aceptar»/«Rechazar»; aceptar → `status = 'accepted'` y `responded_at` lleno.
4. Como local sin ficha creada, la pestaña «Músicos» muestra el aviso y ninguna tarjeta tiene botón.
5. Como músico, «Conectar» con otro músico → la tarjeta pasa a «Pendiente»; el otro músico la ve en «Te quieren conectar»; aceptar → la tarjeta del primero muestra «Conectado».
6. Mandar dos veces conexión al mismo músico (forzado) → «Ya tienes una solicitud de conexión pendiente con este músico.»
7. Como local, en `VerMusico` de un músico, «Solicitar» crea la solicitud y el botón pasa a «Solicitud enviada».
8. Una fecha `2026-13-40` en el modal → alerta «Revisa la fecha» y no se envía nada.
9. `git diff --stat` no muestra cambios en `src/navigation/`, `src/screens/PerfilMusicoScreen.tsx` ni `src/screens/DashboardLocalScreen.tsx`.
10. `npx expo export --platform web` termina sin error.

## Fuera de alcance

- Notificaciones (push o correo) de solicitud nueva.
- Contador de pendientes en el botón del panel.
- Navegar desde una tarjeta de la galería a la ficha (depende de qué rutas registre el 114 en
  cada stack).
- Filtrar la galería por disponibilidad (`profiles.available`).
- Un selector de fecha nativo.

## Verificación manual

- **V-candidata 1:** flujo completo músico → local → aceptar, con dos teléfonos o teléfono + web: lo que se acepta en la app se ve aceptado en `/musico/solicitudes` de la web.
- **V-candidata 2:** en Expo web, el modal abre centrado, el teclado no tapa el botón «Enviar» en un teléfono chico.
- **V-candidata 3:** un fan que abre la ficha de un músico no ve ningún botón de solicitud.
