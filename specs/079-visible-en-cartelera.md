# Spec 079 — Un evento se puede sacar de la cartelera sin cancelarlo

> Estado: aplicado (5-sep-2026) — `supabase db push` verde en producción
> Capa: DATOS. Columna nueva en `events` + policy de `events_update` sin cambios
> (`can_edit_event()` ya la cubre).
> Depende de: nada. Habilita el spec W-096 de sonopolisWeb (LÓGICA/FRONTEND, el switch).

> **En una frase:** hoy solo hay una forma de que un evento deje de listarse en la
> cartelera — cancelarlo, que además apaga la venta y deja el aviso "Cancelado" para
> siempre. Esto agrega un interruptor aparte: seguir existiendo, seguir vendido, pero fuera
> del listado público.

## Motivo

Victor, sobre un evento ya cerrado —entradas pagadas, todas usadas en la puerta—: *"no
quiero que aparezca en la cartelera"*. Cancelarlo no sirve para lo que pide: cancelar es
para un show que **no va a pasar**, deja el evento marcado "Cancelado" a propósito (spec
033: quien compró tiene que poder encontrarlo y enterarse) y apaga la venta. Este evento **sí
pasó**, se vendió y se cumplió — no hay nada que cancelar, solo un listado que ya no
necesita mostrarlo.

**Las dos cosas son independientes y no hay que forzar una a hacer de la otra:**

| | Cambia si se puede comprar | Se ve en `/cartelera/<id>` | Aparece en el listado de la cartelera |
|---|---|---|---|
| `cancelEvento` | Sí, deja de venderse | Sí, marcado "Cancelado" | Sí (spec 033, a propósito) |
| Este spec (`visible_en_cartelera`) | No cambia nada | Sí, sin marca | **No** |

Un evento puede estar en cualquier combinación: publicado y visible (el caso normal),
publicado y oculto (este pedido — ya pasó, sale del listado, pero un QR o un link directo
sigue funcionando para quien lo tenga), o cancelado y visible (el caso que protege el spec
033).

## Qué cambia

```sql
ALTER TABLE public.events
  ADD COLUMN visible_en_cartelera boolean NOT NULL DEFAULT true;
```

**Booleano positivo con default `true`, no `oculto` con default `false`:** todo evento que
existía antes de esta columna sigue apareciendo exactamente igual sin backfill — el default
hace el trabajo. Con un flag negativo, el mismo default (`false`) habría escondido de golpe
todos los eventos existentes.

**Sin policy nueva.** `events_update` ya exige `can_edit_event(id)` para cualquier columna
(spec 033) — cualquier miembro del equipo puede prender o apagar el switch, mismo permiso
que ya tiene para cambiar el nombre o la fecha. No hace falta la fuerza de
`can_delete_event()` (reservada para cancelar/borrar): ocultar del listado no es
destructivo ni afecta el pago, así que no amerita el permiso fuerte.

**`events_guard_protected_columns_trg` no se toca.** Ese trigger protege columnas que
importan para la integridad de una venta en curso (fechas, precio, etc. tras la primera
venta); `visible_en_cartelera` no es una de ellas y no hace falta agregarla — es
exactamente el tipo de columna que ese guard no necesita vigilar.

## Lo que este spec NO hace

- No toca `events_select`. La policy sigue siendo `status <> 'draft' OR can_edit_event(id)`
  — un evento oculto del listado sigue siendo una fila legible por `anon` si alguien pide su
  `id` directo (`getEvento`). Ocultar es una decisión de **listado**, no de **acceso**: quien
  tiene el link de una entrada vieja (para el registro, o el escáner si hiciera falta
  reabrirlo) no se queda afuera.
- No cambia `eventoDestacado()` ni ningún otro cálculo de sonopolisWeb — eso es LÓGICA/
  FRONTEND, spec W-096.
- No agrega un `visible_en_cartelera` a `external_events` (spec 049): son scrapeados, no
  eventos propios, y ocultar uno de la cartelera hoy se resuelve borrando la fila del
  scraping, no con un flag nuevo.

## Criterios de cierre

1. `supabase db push` verde.
2. Un evento existente, sin tocar nada, sigue con `visible_en_cartelera = true`.
3. Un miembro del equipo (`editor` incluido) puede poner `visible_en_cartelera = false` vía
   `UPDATE`, y RLS lo deja pasar.
4. `getEvento(id)` de un evento oculto sigue devolviendo la fila (sin filtrar por esta
   columna en `events_select`).
