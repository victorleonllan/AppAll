# Spec 085 — Las columnas `avatar` que nunca tuvieron migración

> Estado: **aplicado en producción** (10-sep-2026) — `20260910140000_spec_085_columnas_avatar_retroactivas.sql`
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_085_columnas_avatar_retroactivas.sql`.
> Depende de: nada. Las columnas ya existen en producción; esto las declara.
> Origen: hallazgo de la prueba de restauración del spec 025.

> **En una frase:** `profiles.avatar` y `venues.avatar` viven en producción desde hace meses sin
> migración que las cree, así que cualquier entorno reconstruido desde cero sale sin ellas — y la
> web las lee.

## El problema

Al restaurar el respaldo en un Postgres limpio (spec 025) se comparó columna por columna contra
producción: **242 de 244 coinciden**. Las dos que faltan:

| Columna | Valores no nulos en producción |
|---|---|
| `profiles.avatar` | 1 |
| `venues.avatar` | 0 |

Creadas a mano, sin rastro en `supabase/migrations/`. Mismo patrón que el caso del spec 045.

**No son columnas muertas.** `sonopolisWeb` las lee como fallback:

- `app/(marketing)/musicos/DirectorioMusicos.js` → `m.foto ?? m.avatar`
- `app/(private)/local/page.js` → `venue.image ?? venue.avatar`

Que `venues.avatar` tenga cero datos no significa que sobre: significa que hoy ningún local cae
en el fallback. En un entorno reconstruido, esas dos consultas fallan con *column does not exist*
— no devuelven vacío, revientan.

## Decisión 1 — declararlas, no borrarlas

La alternativa era borrarlas por muertas. Se descarta: el código las usa, y borrar una columna
que un `??` referencia rompe el directorio de músicos y el panel del local.

Que estén poco usadas es un problema de producto (dos caminos para la misma imagen: `foto`/`image`
y `avatar`), no de esquema. **Unificarlos es otro spec**, y hacerlo desde acá mezclaría un arreglo
de reproducibilidad con un cambio de comportamiento.

## Decisión 2 — `add column if not exists`, no un `add column` a secas

```sql
alter table public.profiles add column if not exists avatar text;
alter table public.venues   add column if not exists avatar text;
```

En producción es un **no-op**: las columnas ya están, la migración solo queda registrada. En un
entorno nuevo, las crea. Sin `if not exists` la migración falla contra producción, que es
justamente donde tiene que poder correr sin romper nada.

**Tipo `text` y nulable**, igual que en producción — verificado en `information_schema.columns`.
Ponerle `NOT NULL` o un default cambiaría el comportamiento en vez de documentarlo, y esta
migración no está para mejorar nada: está para que el repo diga la verdad sobre la base.

## Decisión 3 — no tocar los datos

No hay backfill. El único valor existente (`profiles.avatar`, 1 fila) ya está donde tiene que
estar. Una migración retroactiva que además moviera datos dejaría de ser retroactiva.

## Criterios de aceptación

- [x] La migración corre contra producción sin cambiar nada — `db push` aplicó solo esta y
      dejó 244 columnas, las mismas de antes
- [x] Correrla dos veces seguidas no falla — `if not exists` en las dos sentencias, y contra
      producción ya corrió sobre columnas existentes
- [x] En la réplica reconstruida desde cero, las dos columnas existen como `text` nulables
- [x] La comparación de columnas réplica vs producción da **244 de 244** (era 242/244)
- [x] `count(avatar)` sigue devolviendo 1 en `profiles` y 0 en `venues`; `tickets` 25 y
      `auth.users` 15 sin cambios

## Fuera de alcance

- **Unificar `foto`/`image` con `avatar`.** Es deuda de producto, anotada en `PENDIENTES.md`.
- **Buscar más drift.** Esta comparación cubrió columnas; constraints, índices, policies y
  funciones no se compararon. La restauración nocturna del spec 025 es lo que lo hará sistemático.
- El arreglo del orden 049/050, que es el otro hallazgo de la misma prueba — spec aparte.
