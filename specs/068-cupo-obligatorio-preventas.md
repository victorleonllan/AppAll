# Spec 068 — Cupo obligatorio en preventas

**Capa: DATOS · `supabase/migrations/` · Depende de: spec 064 (`event_preventas`) ·
Pedido desde el vault, sesión 2026-09-02**

## Motivo

Pedido explícito de Victor: *"Creo que si se ponen preventas deberían ser obligatorias
tener una cantidad límite."* — hoy `event_preventas.cupo` es `NULL`-able ("sin límite, se
cierra a mano", spec 064). Sin cupo no hay forma de calcular "cuántas quedan" en pantalla
(spec 070, FRONTEND) ni de que `precio_vigente_de` (spec 065/069) salte sola a la siguiente
preventa cuando se agota — depende de que exista un número contra el que comparar
`vendidos`.

Antes de aplicar la constraint se revisó producción (`xluinfihjjtxkglihxqz`,
`event_preventas`): una sola fila existe hoy y ya tiene `cupo = 25` — no hizo falta
completar nada a mano. Si en el futuro se crea una preventa sin cupo antes de este spec, la
migración fallaría al aplicar el `NOT NULL`; revisar `SELECT id, event_id, nombre FROM
event_preventas WHERE cupo IS NULL` antes de reintentarla.

## Migración

```sql
-- Cualquier fila que quedara sin cupo antes de este spec necesita completarse a mano
-- (Victor la llena él mismo o el músico/local la edita después) — no hay valor por
-- defecto razonable que inventar.
ALTER TABLE public.event_preventas
  ALTER COLUMN cupo SET NOT NULL;

ALTER TABLE public.event_preventas
  DROP CONSTRAINT event_preventas_cupo_valido;

ALTER TABLE public.event_preventas
  ADD CONSTRAINT event_preventas_cupo_valido CHECK (cupo > 0 AND vendidos <= cupo);
```

`cupo > 0` porque una preventa con cupo 0 no tiene sentido — sería una preventa que nace
agotada; ese caso es "no crear la preventa", no "crearla con cupo 0".

## Fuera de alcance

- **Exponer `restantes` (cupo - vendidos) en `precio_vigente_de`.** LÓGICA, spec 069.
- **Mostrar "quedan X" en la cartelera/evento destacado.** FRONTEND (sonopolisWeb), spec
  w070.
- **Exigir cupo en el formulario de creación/edición.** También spec w070 — este spec solo
  garantiza la integridad en la base; el formulario hoy deja "Sin cupo" como placeholder
  válido y hay que sacarlo.

## Consecuencia para las apps que consumen esto

`crearPreventa`/`actualizarPreventa` (sonopolisWeb, `libs/data/preventas.js`) van a
recibir un error de Postgres (`null value in column "cupo" violates not-null constraint`)
si el frontend intenta mandar `cupo: null` — hasta que spec w070 lo valide en el form, ese
es el mensaje de error que vería el organizador si lo intentara.

> Estado: aplicado en producción (2026-09-02) —
> `20260902142928_spec_068_cupo_obligatorio_preventas.sql` corrida contra
> `xluinfihjjtxkglihxqz`. Verificado antes de aplicar que la única fila existente en
> `event_preventas` ya tenía cupo (25) — no hizo falta backfill manual.
