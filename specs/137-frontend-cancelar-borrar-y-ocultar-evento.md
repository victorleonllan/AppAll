# Spec 137 — Cancelar con motivo, borrar y sacar de la cartelera desde Editar evento

> Estado: aplicado (17-oct-2026) — `npx tsc --noEmit` limpio fuera de `supabase/functions` (criterio 1), `npx expo export --platform web` sin error (criterio 6, a una carpeta temporal). `EditarEventoScreen` pide `useEventoPermisos(eventoId)` en vez de `(evento.id)`: es el mismo id y el hook tiene que ir antes del `return` de «Evento no encontrado». La navegación se tipa como `NativeStackNavigationProp<ParamListBase>` para tener `popToTop()` en las tres stacks. **Pendiente:** criterios 2-5 contra la base y V-candidata 137-a
> Capa: FRONTEND. `src/components/AccionesEvento.tsx` (nuevo), `src/screens/EditarEventoScreen.tsx`.
> Depende de: spec 135, spec 136
> Hermano en la web: `app/(private)/eventos/[id]/editar/AccionesEvento.js`, `app/(marketing)/cartelera/[id]/BotonBorrarEvento.js` (W-044, W-047, W-097).

> **En una frase:** al final de Editar evento aparece una sección con los tres controles de
> la web: el interruptor «Visible en la cartelera», cancelar con motivo y borrar, cada uno
> con el permiso que le pide la base.

## Contexto

La app ya cancela y borra desde el panel de gestión de `DetalleEventoScreen.tsx:54-96` y
`:370-389`, pero cancela sin motivo (`cancelEvento(evento.id)`, `:66`) y no tiene cómo
sacar un evento de la cartelera. En la web los tres controles viven en
`/eventos/<id>/editar` (`AccionesEvento.js`).

Son tres cosas distintas, y la diferencia importa (`AccionesEvento.js:8-34`):

- **Cancelar** deja el evento visible como cancelado, para que quien compró se entere.
  Exige `can_delete_event()`: dispara `events_guard_protected_columns_trg`.
- **Borrar** es definitivo y la base lo rechaza si hay entradas vendidas o en proceso
  (`events_block_delete_with_tickets_trg`). La policy `events_delete` solo acepta al
  `owner` (spec 059).
- **Ocultar** (spec 079) es para un show que ya pasó: no es destructivo, se deshace con el
  mismo interruptor, y lo autoriza `can_edit_event()` (cualquiera del equipo).

**Por qué en Editar y no en el detalle:** `DetalleEventoScreen` lo cambian los specs 118
(pago) y 120 (paridad del detalle). Ponerlo en Editar sigue a la web y evita un tercer
spec sobre el mismo archivo.

## Diseño

### `src/components/AccionesEvento.tsx` (nuevo)

Props: `{ evento: Evento; permisos: EventoPermisos; onBorrado: () => void }`. No renderiza
nada si `!permisos.puedeEditar && !permisos.puedeBorrar`.

Una tarjeta con título «Más acciones»:

1. **Visible en la cartelera** — `Switch` con `value={evento.visibleEnCartelera !== false}`,
   visible si `permisos.puedeEditar`. Al cambiar: `updateEvento(evento.id, { visibleEnCartelera })`,
   sin confirmación. Debajo, una línea de ayuda: «Para un show que ya pasó: deja de
   listarse, pero quien tenga el enlace lo sigue viendo.». Tras guardar, texto de
   confirmación «Visible en la cartelera» o «Sacado de la cartelera».
2. **Cancelar evento** — solo si `permisos.puedeBorrar && evento.status !== 'cancelled'`.
   Un `TextInput` «Motivo de la cancelación (opcional)» y un botón con borde
   `colors.danger`. Al tocarlo, `confirmar` con título «Cancelar evento» y mensaje «¿Cancelar
   este evento? Sigue visible, pero marcado como cancelado.»; si confirma,
   `cancelEvento(evento.id, motivo.trim() || undefined)` y `navigation.goBack()`.
3. **Evento cancelado** — si `evento.status === 'cancelled'`, en lugar del punto 2 una línea
   «Este evento está cancelado» y, si hay, «Motivo: <cancelReason>».
4. **Borrar evento** — solo si `permisos.rol === 'owner'`, en cualquier estado. Botón con
   fondo `colors.danger`. `confirmar` con título «Borrar evento», mensaje «Esta acción es
   definitiva. Si el evento tiene entradas vendidas o en proceso, la base lo va a rechazar —
   cancélalo en su lugar.» y `destructive: true`; si confirma, `deleteEvento(evento.id)` y
   `onBorrado()`.

Mientras una acción corre, los tres controles quedan deshabilitados. El error se muestra en
un `Text` rojo dentro de la tarjeta con el mensaje de la base (por ejemplo, el del trigger
que bloquea el borrado), no con `Alert.alert`, que en web no hace nada.

### `EditarEventoScreen.tsx`

Monta `<AccionesEvento>` debajo de la tarjeta del formulario, con
`permisos = useEventoPermisos(evento.id)` y `onBorrado={() => navigation.popToTop()}`:
después de borrar, el detalle del que se vino ya no existe y mostraría «Evento no
encontrado».

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. Apagar el interruptor deja `visible_en_cartelera = false` en la fila, y encenderlo lo
   vuelve a `true`, sin pedir confirmación.
3. Cancelar con motivo «Lluvia» deja `status = 'cancelled'` y `cancel_reason = 'Lluvia'`;
   sin motivo deja `cancel_reason` nulo.
4. Un `editor` sin `can_delete` ve el interruptor y no ve «Cancelar» ni «Borrar».
5. Borrar un evento con entradas `completed` muestra el error de la base en la tarjeta y el
   evento sigue existiendo; borrar uno sin ventas vuelve al inicio del stack.
6. En el build web (`npx expo export --platform web` sin error), cancelar pide
   confirmación con `window.confirm` (vía `confirmar`).

## Fuera de alcance

- Que la cartelera de la app esconda los eventos con `visibleEnCartelera === false`: es de
  quien toque `CarteleraScreen` (spec 119). Hasta entonces el interruptor ya surte efecto
  en la web.
- Quitar los botones de cancelar y borrar de `DetalleEventoScreen`: quedan duplicados
  hasta que un spec posterior a 118 y 120 decida si el detalle los conserva (la web
  conserva solo «Borrar» para eventos cancelados, W-047).
- Avisar a los compradores de la cancelación (es de la base y la web, spec 044).

## Verificación manual

- **V-candidata 137-a:** con un evento de prueba sin ventas, ocultarlo y confirmar que
  desaparece de `sonopolis.org/cartelera`; cancelarlo con motivo y verlo en la ficha web;
  borrarlo desde la app.
