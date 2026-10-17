# Spec 143 — El detalle del evento deja de duplicar cancelar y borrar

> Estado: propuesto (17-oct-2026)
> Capa: FRONTEND. `src/screens/DetalleEventoScreen.tsx`.
> Depende de: spec 137 (aplicado)
> Hermano en la web: `app/(marketing)/cartelera/[id]/BotonBorrarEvento.js` (W-047).

> **En una frase:** el panel de gestión del detalle deja de ofrecer «Cancelar» y solo
> ofrece «Borrar» cuando el evento ya está cancelado, igual que la ficha de la web; el resto
> vive en Editar evento (spec 137).

## Contexto

El spec 137 llevó cancelar con motivo, borrar y ocultar a `EditarEventoScreen` mediante
`AccionesEvento`, y dejó fuera de alcance quitar los botones viejos del detalle. Hoy hay dos
caminos para lo mismo, y el del detalle es peor:

- **«🚫 Cancelar»** (`DetalleEventoScreen.tsx:496-504`, `handleCancelar` en `:89-109`)
  cancela **sin motivo** (`cancelEvento(evento.id)`, `:101`). Quien cancela desde ahí no
  puede decirle a los compradores por qué.
- **«🗑️ Borrar»** (`:507-515`, `handleBorrar` en `:111-131`) aparece en cualquier estado.
  Muestra el error con `Alert.alert`, que en el build web no hace nada.

La web resolvió esto en W-047: la ficha pública solo muestra «Borrar», al `owner` y solo si
el evento está cancelado. La razón es que un evento cancelado ya no se puede editar con
sentido, pero sí puede querer borrarse para que deje de aparecer. Todo lo demás se hace en
`/eventos/<id>/editar`.

## Diseño

En `DetalleEventoScreen.tsx`:

1. Quitar el botón «🚫 Cancelar» del panel de gestión y la función `handleCancelar`.
   Quitar `cancelEvento` del destructuring de `useEventos()` (`:32`) si deja de usarse.
2. «🗑️ Borrar» pasa a mostrarse solo si `permisos.rol === 'owner' && cancelado`. Se
   mantiene `handleBorrar` con su `confirmar`.
3. El error de borrar deja de ir a `Alert.alert` y pasa a un `Text` rojo
   (`colors.danger`) debajo de la fila de botones de gestión. Va en un estado
   `errorGestion: string | null`, que se limpia al reintentar. Es el mismo criterio que
   el 137: el mensaje del trigger tiene que leerse también en web.
4. Actualizar el comentario de `:86-88` para que diga que cancelar vive en Editar
   (spec 137) y que aquí solo queda borrar un cancelado (W-047).

No cambia nada más del panel: Editar, Entradas, Equipo y Cobrar quedan como están.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `grep -n "handleCancelar\|🚫 Cancelar" src/screens/DetalleEventoScreen.tsx` no
   encuentra nada.
3. El `owner` no ve «Borrar» en un evento `published`, y sí lo ve en uno `cancelled`.
4. Un `editor` no ve «Borrar» ni «Cancelar» en ningún estado.
5. Si se borra un cancelado que tiene entradas `completed`, el mensaje de la base aparece
   en rojo dentro del panel y el evento sigue existiendo.
6. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.

## Fuera de alcance

- Cambiar `AccionesEvento` o `EditarEventoScreen`.
- Cambiar el resto de los `Alert.alert` del detalle (compartir, compra). Son de otros flujos.

## Verificación manual

- **V-candidata 143-a:** con un evento de prueba sin ventas, cancelarlo desde Editar, volver
  al detalle, ver que aparece «Borrar» y borrarlo.
