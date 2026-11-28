# Spec 199 — Invitar a las bandas y al local a Sonópolis desde el evento y desde el panel del local

> Estado: propuesto (27-nov-2026)
> Capa: FRONTEND. `src/components/InvitarBandasDelEvento.tsx` (nuevo), `src/components/InvitarLocalDelEvento.tsx` (nuevo), `src/components/BotonInvitarASonopolis.tsx` (nuevo), `src/screens/EditarEventoScreen.tsx`, `src/screens/DashboardLocalScreen.tsx`, `src/screens/CrearEventoScreen.tsx`.
> Depende de: spec 190 (`enviarInvitacionSonopolis`, `cancelarInvitacionSonopolis`, `getMisInvitacionesSonopolis`, `mensajeErrorInvitacion`, `ESTADO_INVITACION`, `invitarDuenoLocalDelEvento`), spec 198 (toca el mismo `CrearEventoScreen.tsx`: debe estar aplicado antes; deja `artista`/`otrasBandas` como `Banda`), spec 189 (`useBandasDelEvento`), spec 173 (`useEstilos`, `useTema`).
> Hermano en la web: W-306 (`components/InvitarBandasDelEvento.js`, `components/BotonInvitarASonopolis.js`, `eventos/[id]/editar/page.js`, `local/page.js`) y W-338 (`components/FormEvento.js`, `components/InvitarLocalDelEvento.js`).

> **En una frase:** en la edición del evento el equipo invita por correo a cada banda sin cuenta
> (y el músico, al dueño del local que registró); el panel del local tiene «Enviar invitación a
> Sonópolis»; y al crear el evento se dejan escritos los correos de las bandas sin cuenta y del
> local nuevo para que les llegue la invitación.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en el
mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después de
esta orquestación.»

Caso real de W-338: una banda nueva crea un evento con otra banda en un local. Para invitar a la
otra banda tiene que esperar a la edición, y al local no lo puede invitar de ninguna forma. En
la web eso ya está resuelto (W-306, W-338); en la app no existe ninguna de las tres entradas.
Con su perfil, cada banda suma a su propia base los correos de quienes compren entradas de sus
shows (W-301), y el local pasa a la cuenta de su dueño (W-230/W-336).

## Decisión

Colores con `useEstilos`/`useTema` y la paleta (spec 173): ningún hex nuevo. La app no tiene
toasts: cada resultado va en un `Text` bajo su campo o botón (éxito en `success`, error en
`danger`), nunca en `Alert.alert` (no hace nada en el build web de Expo). Campos de correo con
`keyboardType="email-address"`, `autoCapitalize="none"` y `autoCorrect={false}`. Los textos
entre comillas «» son literales de la web salvo los marcados como supuesto.

Mensajes comunes a los tres componentes (literales de la web):

- éxito: «Invitación enviada a <correo>»;
- la ruta respondió `emailError`: «La invitación quedó creada, pero el correo falló: <emailError>»;
- error: `mensajeErrorInvitacion(err)` (spec 190).

### `src/components/InvitarBandasDelEvento.tsx` (nuevo)

`<InvitarBandasDelEvento evento={evento} />`. Lee las bandas con `useBandasDelEvento(evento)` y
las invitaciones con `getMisInvitacionesSonopolis({ eventId: evento.id })` (al montar y tras cada
acción; si la lectura falla, se sigue con `[]`, como la web). Cruza por `artistId`.

- Sin bandas (o `bandas === null`): no se dibuja.
- Tarjeta con título «Invita a las bandas a Sonópolis» y, debajo, si hay alguna ficha suelta:
  «Con su perfil, cada banda suma a su propia base los correos de quienes compren entradas de
  este show (y de los que vengan).»; si todas son cuentas: «Todas las bandas de este evento ya
  tienen perfil en Sonópolis.»
- Una fila por banda, en orden:
  - **cuenta**: el nombre y «✓ En Sonópolis» en `success`;
  - **ficha con invitación `pending`** (y sin «Cambiar correo» abierto): el nombre, «Invitada:
    <correo>» (más « (correo sin enviar)» si `enviadaAt` es nulo) y tres acciones de texto:
    «Reenviar» (vuelve a llamar con el mismo correo), «Cambiar correo» (muestra el campo) y
    «Cancelar» (`cancelarInvitacionSonopolis`; éxito: «Invitación cancelada»);
  - **ficha sin invitación**: el nombre, un campo con placeholder y `accessibilityLabel`
    «Correo de <nombre>» y el botón «Enviar invitación» («Enviando…» mientras va; desactivado con
    el campo vacío o enviando). Llama a
    `enviarInvitacionSonopolis({ email, artistId: banda.id, eventId: evento.id })`.
- Cada fila guarda su propio estado (correo, enviando, mensaje), como `FilaBanda` de la web.

### `src/components/InvitarLocalDelEvento.tsx` (nuevo)

`<InvitarLocalDelEvento venueId={…} nombre={…} />`. Tarjeta con título «Invita a <nombre> a
Sonópolis», el texto «Registraste este local tú. Con el correo de su dueño, el local pasa a su
cuenta y queda como admin del evento.», un campo «Correo de <nombre>» y el botón «Enviar
invitación» («Enviando…»). Llama a `invitarDuenoLocalDelEvento({ venueId, email })`. Con éxito
muestra «✓ Invitación enviada a <correo>» y vacía el campo. Mandar de nuevo al mismo correo
reenvía; a otro, reemplaza la invitación (lo decide la base).

### `src/components/BotonInvitarASonopolis.tsx` (nuevo)

- Botón «Enviar invitación a Sonópolis» que abre un `Modal` de React Native (`transparent`,
  `animationType="fade"`, `onRequestClose` cierra; fondo oscurecido con la paleta).
- En el modal: título «Invitar a una banda a Sonópolis»; texto «Le llega un correo para crear el
  perfil de su banda. Con su perfil podrás sumarla a tus eventos, y cada uno suma a su base a
  quienes compren entradas de los shows que hagan juntos.»; campos «Nombre de la banda»
  (`maxLength={120}`) y «Correo de la banda»; botones «Cerrar» y «Enviar invitación»
  («Enviando…»; desactivado con algún campo vacío o enviando). Llama a
  `enviarInvitacionSonopolis({ email, nombre })`, sin evento ni ficha.
- Con éxito: vacía los campos, cierra el modal, recarga la lista y muestra el mensaje de éxito
  (o el de `emailError`) bajo el botón del panel. Un error queda en el modal, bajo los campos.
- «Tus invitaciones» dentro del modal, bajo el formulario, solo si hay alguna:
  `getMisInvitacionesSonopolis({ limite: 20 })` (al montar y tras cada acción; si falla, `[]`).
  Cada fila: «<nombre> · <correo>» (el nombre en negrita, una línea con `numberOfLines={1}`), el
  estado con `ESTADO_INVITACION` y, si está `pending`, «Cancelar». Lista con alto máximo y
  `ScrollView` propio.

### `src/screens/EditarEventoScreen.tsx`

- Entre la tarjeta del formulario y `AccionesEvento`:
  - `{evento && permisos.puedeEditar && <InvitarBandasDelEvento evento={evento} />}`: el equipo
    del evento (a donde llega el local tras crearlo, W-306);
  - `<InvitarLocalDelEvento venueId={local.id} nombre={local.name} />` solo si quien edita es
    músico (`role === 'musician'` de `useAuth`) y es el dueño del local del evento
    (`allVenues` de `useVenues`, `local.ownerId === user.id`): el placeholder que registró (W-338).
- `useAuth()` y `useVenues()` se llaman junto a los hooks de hoy, antes del return temprano.
- El resto del formulario no cambia.

### `src/screens/DashboardLocalScreen.tsx`

`<BotonInvitarASonopolis />` bajo la fila de «📊 Ventas» / «✏️ Editar local» (W-306: «bajo
"Editar local"»), antes de «📷 Escanear entradas». Solo en la vista con local (`miVenue`), como
el resto de esos botones.

### `src/screens/CrearEventoScreen.tsx`

Sobre lo que deja el spec 198:

- Estado `correosBandas: Record<string, string>`, con clave `"<tipo>:<id>"` (solo fichas), y
  `correoLocal: string`.
- Bajo la banda principal elegida, si es una ficha suelta, y bajo cada ficha de «Otras bandas»:
  campo con placeholder «Correo de <nombre> para invitarla (opcional)» y `accessibilityLabel`
  «Correo de <nombre> para invitarla». Una cuenta no lo muestra (W-349).
- La ayuda de «Otras bandas» suma la segunda frase de la web: «Si tocan dos o más bandas,
  agrégalas aquí. Si una no está en Sonópolis, deja su correo y le llega la invitación al crear
  el evento.»
- En el subformulario de local nuevo, después de «Instagram (opcional)»: campo con placeholder
  «Correo del local para invitarlo a Sonópolis (opcional)» y `accessibilityLabel` «Correo del
  local para invitarlo a Sonópolis».
- Al publicar, con el evento ya creado y después de preventas y packs (un fallo acá no deshace el
  evento, W-338 §4):
  - por cada banda de `[artista, ...otrasBandas]` que sea ficha y tenga correo:
    `enviarInvitacionSonopolis({ email, artistId: b.id, eventId: creado.id })`;
  - si el local se creó en este formulario (`!selectedVenue`) y hay `correoLocal`:
    `invitarDuenoLocalDelEvento({ email: correoLocal, venueId: venue.id })`;
  - todas en paralelo (`Promise.all`); cada una resuelve a `null` o a «<nombre>: <emailError o
    mensajeErrorInvitacion(err)>»;
  - con algún fallo se suma a `fallos`: «Evento creado, pero no salió alguna invitación —
    <fallos unidos por « · »>»; sin fallos y con al menos una, el aviso «Evento publicado» suma
    una línea «Invitación enviada» o «Invitaciones enviadas».
- Las bandas sin correo o los correos de bandas quitadas no se mandan.

### Fuera de alcance

- `/unete/<token>` (la banda acepta) queda en la web.
- Cancelar la invitación del local desde la edición, e invitar a un local registrado por otra
  persona (fuera de alcance también en W-338).
- Ver invitaciones hechas por otra persona del equipo: la RLS de `sonopolis_invites` deja ver
  solo las propias. Supuesto, igual que en la web: si otro miembro ya invitó a una banda, la fila
  ofrece el campo de correo, e invitar a otro correo reemplaza la invitación anterior.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `npx expo export --platform web` termina sin errores.
3. Ningún hex nuevo en los archivos tocados (`git diff` sin `#[0-9a-fA-F]{3,6}` agregado).
4. `grep -rn "Alert.alert" src/components/InvitarBandasDelEvento.tsx src/components/InvitarLocalDelEvento.tsx src/components/BotonInvitarASonopolis.tsx`
   no devuelve nada.
5. `grep -n "Invita a las bandas a Sonópolis" src/components/InvitarBandasDelEvento.tsx`,
   `grep -n "Enviar invitación a Sonópolis" src/components/BotonInvitarASonopolis.tsx` y
   `grep -n "para invitarla (opcional)\|Correo del local para invitarlo a Sonópolis (opcional)\|no salió alguna invitación" src/screens/CrearEventoScreen.tsx`
   devuelven al menos una línea cada uno.
6. `grep -n "InvitarBandasDelEvento\|InvitarLocalDelEvento" src/screens/EditarEventoScreen.tsx` y
   `grep -n "BotonInvitarASonopolis" src/screens/DashboardLocalScreen.tsx` devuelven el uso.
7. `git diff --stat` del commit toca solo los seis archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Como local, crear un evento con una banda nueva (ficha) y su correo: llega el correo con
  `/unete/<token>`, y en la edición la banda sale «Invitada: <correo>» con Reenviar / Cambiar
  correo / Cancelar.
- Como músico, crear un evento en un local nuevo con el correo del local: llega el correo con
  `/invitacion/<token>`; en la edición aparece «Invita a <local> a Sonópolis».
- Panel del local: «Enviar invitación a Sonópolis» manda la invitación y la lista la muestra
  «Pendiente»; «Cancelar» la saca.
- Probar en el build web de Expo que el modal abre y cierra, y que los mensajes se ven (sin
  `Alert`).
