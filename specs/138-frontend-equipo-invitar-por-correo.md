# Spec 138 — Equipo del evento: invitar por correo, invitaciones pendientes y correos del equipo

> Estado: aplicado (17-oct-2026) — `npx tsc --noEmit` limpio. Criterios 2, 3, 5 y 6 (contra la base y con/sin W-246) y V-candidata 138-a pendientes de prueba manual.
> Capa: FRONTEND. `src/screens/EquipoEventoScreen.tsx`.
> Depende de: spec 135
> Hermano en la web: `app/(private)/eventos/[id]/equipo/PanelEquipo.js` (W-032–034, W-088, W-094, W-095). Necesita **W-246 desplegado en producción** antes de publicar el build (sin él, invitar por correo y ver correos responden `401`).

> **En una frase:** en Equipo se puede invitar por correo a alguien que todavía no tiene
> cuenta, ver y revocar las invitaciones pendientes, y el dueño ve el correo de cada
> persona del equipo, igual que en la web.

## Contexto

Hoy `EquipoEventoScreen` solo invita a quien ya tiene cuenta (texto de ayuda en
`EquipoEventoScreen.tsx:210`: «Solo se puede invitar a quien ya tiene cuenta»). La web
invita por correo desde W-034: si la búsqueda no encuentra a nadie y lo escrito parece un
correo, ofrece invitarlo (`PanelEquipo.js:160-190`); la ruta crea la invitación y manda el
correo en un solo paso (`app/api/eventos/[id]/invitar-email/route.js:9-14`), y al crear la
cuenta con ese correo la persona entra sola al equipo (trigger del spec 052).

Además, el nombre de un colaborador `local` o `fan` llega vacío por la RLS de `profiles`
(`EventosContext.tsx:291-293`), y la app muestra solo «Dueño del local». La web le muestra
al owner el correo de cada uno (W-094/W-095).

Toda la lógica la deja el spec 135 en `useInvitacionesEquipo`. Las llamadas a la web van
con la sesión de la app gracias a W-246.

## Diseño

En `EquipoEventoScreen.tsx`:

```ts
const { pendientes, emailsEquipo, errorEmails, invitarPorCorreo, revocar, recargar } =
  useInvitacionesEquipo(eventoId, { esOwner: permisos.esOwner, puedeInvitar: permisos.puedeInvitar });
```

`recargar` se llama junto con `cargar()` en el `useFocusEffect` existente.

### 1. Lista del equipo

- Nombre: `c.nombre ?? emailsEquipo[c.userId] ?? (c.userId === user?.id ? 'Tú' : SOURCE_LABEL[c.source])`.
- Si hay nombre **y** correo, el correo va en una segunda línea (`fontSize.sm`,
  `colors.muted`).
- Si `errorEmails`, una línea al pie de la tarjeta: «No se pudieron cargar los correos del
  equipo.». El equipo se muestra igual.

### 2. Invitar

Se mantiene el gate actual, `permisos.puedeInvitar` (owner o admin), porque es el mismo que
aplica la base: `eci_insert` exige `can_manage_team()`, que acepta a los dos. La web lo
muestra solo al owner; la app ya dejaba invitar al admin a quien tiene cuenta, y no tiene
sentido que pueda invitar a una cuenta existente y no a un correo.

- Texto de ayuda nuevo: «Busca por nombre, o escribe un correo para invitar a alguien que
  todavía no tiene cuenta.». Placeholder: «Nombre o correo…».
- Si no hay resultados, no se está buscando y `PARECE_CORREO.test(query)`, aparece una fila
  «Invitar a <correo> por correo» con los botones «+ Editor» y «+ Admin».
- Al tocar: `invitarPorCorreo(query, rol)`. Si `emailError` → aviso «Invitación creada,
  pero el correo no salió: <emailError>»; si no → «Invitación mandada por correo». Se
  limpian búsqueda y resultados.
- Error → texto rojo bajo la fila con el mensaje (por ejemplo, el de la base si ese correo
  ya tiene una invitación pendiente). Si el mensaje es `no_autenticado`, se muestra «Tu
  sesión venció: vuelve a entrar.».

Los avisos de éxito y de error van en un `Text` dentro de la tarjeta, no con
`Alert.alert`: en el build web `Alert.alert` no hace nada (`src/lib/confirm.ts:11-15`).

### 3. Invitaciones pendientes

Tarjeta «Invitaciones pendientes», visible si `permisos.puedeInvitar && pendientes.length > 0`.
Una fila por invitación: correo, `ROLE_LABEL[role]` y «Revocar». Revocar pide
`confirmar({ title: 'Revocar invitación', message: '¿Revocar la invitación a <correo>?', confirmText: 'Revocar', destructive: true })`
y llama `revocar(id)`; la fila desaparece.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. Escribir un correo sin cuenta muestra «Invitar a <correo> por correo»; elegir «+ Editor»
   deja una fila `pending` con `role = 'editor'` en `event_collaborator_invites` y el correo
   llega (con W-246 desplegado).
3. La invitación aparece en «Invitaciones pendientes»; «Revocar» la deja en `revoked` y la
   quita de la lista.
4. Escribir un nombre (sin `@`) nunca ofrece invitar por correo.
5. El owner ve el correo de un colaborador `local` cuyo nombre no es visible; un `admin` no
   ve correos y la pantalla no muestra error por eso.
6. Con W-246 sin desplegar, invitar por correo muestra el error en pantalla y la app no se
   cae.

## Fuera de alcance

- Cambiar rol o permiso de borrado de una invitación pendiente: la web tampoco lo hace.
- Reenviar el correo de una invitación pendiente: se revoca y se invita de nuevo.
- El correo que manda la web (texto y enlace a `/eventos/<id>/entradas`): es de W-033/W-088.

## Verificación manual

- **V-candidata 138-a:** con W-246 en producción, invitar desde la app un correo de prueba
  sin cuenta, crear la cuenta con ese correo y confirmar que aparece en el equipo.
