# Spec 059 — Borrar evento: solo el owner, no cualquiera con `can_delete`

**Capa: DATOS · `supabase/migrations/` · Depende de: spec 033**
**Extiende: spec 033** (no lo edita — los specs aplicados no se editan) — tighten
puntual de una sola policy, el resto del diseño del 033 no cambia.

Pedido de Victor: "necesito crear un botón para borrar el evento cancelado, solo
puede eliminarlo el owner. cancelar puede hacerlo ambos."

## El problema

`can_delete_event()` (spec 033) es `role = 'owner' OR can_delete`. Un owner puede
invitar a un admin/editor con `can_delete = true` (`ec_insert`, mismo spec), y esa
persona hoy pasa `can_delete_event()` igual que el owner. La policy `events_delete`
usa esa misma función:

```sql
CREATE POLICY events_delete ON public.events FOR DELETE
  USING (public.can_delete_event(id));
```

Victor quiere separar los dos casos: **cancelar** (`UPDATE status='cancelled'`) sigue
abierto a owner + colaborador con `can_delete` — el trigger `events_guard_protected_columns_trg`
sigue llamando a `can_delete_event()` sin cambios, así que esto no se toca. **Borrar**
(`DELETE`) se angosta a *solo* el owner, sin importar el flag `can_delete` de nadie más.

`can_delete_event()` en sí no cambia — sigue existiendo y sigue significando lo mismo
para quien la llame (el trigger de cancelar la sigue usando tal cual). Lo que cambia es
**qué función usa la policy de `events_delete`**: pasa a `event_role_of(id) = 'owner'`
en vez de `can_delete_event(id)`.

## Migración

```sql
DROP POLICY IF EXISTS events_delete ON public.events;
CREATE POLICY events_delete ON public.events FOR DELETE
  USING (public.event_role_of(id) = 'owner');
```

`event_role_of()` ya existe (spec 033), `SECURITY DEFINER` con `search_path` fijo — no
hace falta función nueva.

## Consecuencia para las dos apps que consumen esto

Ambas gatean hoy el botón "Borrar" con `permisos.puedeBorrar` (RPC `can_delete_event`),
igual que "Cancelar". Con esta migración aplicada, un colaborador con `can_delete=true`
que no sea owner va a ver el botón (porque `puedeBorrar` sigue en `true`) pero el
`DELETE` le va a rechazar por RLS — error confuso, no un permiso ausente.

Corregido en:
- AppAll: spec 060 (`DetalleEventoScreen.tsx`)
- sonopolisWeb: spec w044 (`AccionesEvento.js`)

Ninguna de las dos re-pregunta el permiso a Postgres con una función nueva — ambas ya
reciben `permisos.rol` de `event_role_of()` en el mismo `Promise.all` que pide
`puedeBorrar`, así que la comparación es local: `rol === 'owner'`.

> Estado: aplicado en producción (2026-08-26) — `20260826000000_spec_059_borrar_evento_solo_owner.sql` corrida contra `xluinfihjjtxkglihxqz`
