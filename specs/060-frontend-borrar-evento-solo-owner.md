# Spec 060 — Botón Borrar visible solo para el owner

**Capa: FRONTEND · `DetalleEventoScreen.tsx` · Depende de: spec 059**

Spec 059 angostó `events_delete` a `event_role_of(id) = 'owner'`. `DetalleEventoScreen`
sigue mostrando el botón "🗑️ Borrar" a cualquiera con `permisos.puedeBorrar` (owner o
colaborador con `can_delete`) — un colaborador no-owner con `can_delete` vería el botón
y le fallaría el `DELETE` por RLS, un error confuso en vez de un permiso ausente.

`permisos.rol` ya se pide en el mismo `Promise.all` que `puedeBorrar` (spec 033) — no
hace falta ninguna llamada nueva.

## Cambio

`src/screens/DetalleEventoScreen.tsx`, el botón "Borrar" (línea ~379): condición pasa
de `permisos.puedeBorrar` a `permisos.rol === 'owner'`. "Cancelar" (línea ~370) no
cambia — sigue en `permisos.puedeBorrar`, owner y colaborador con `can_delete` cancelan
igual que antes.

> Estado: aplicado (2026-08-26)
