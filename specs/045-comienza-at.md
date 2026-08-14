# Spec 045 — `comienza_at`: la fecha del evento como dato comparable

> Estado: **aplicado en producción (2026-08-13), archivo recreado retroactivamente
> (2026-08-14).** La migración `20260813234256_spec_045_comienza_at` se aplicó directo a
> producción vía `apply_migration` sin guardar el `.sql` ni este spec — el drift que el
> spec 018 ya advertía ("`apply_migration` sin archivo desincroniza el repo en silencio").
> Se detectó el 2026-08-13/14 desde `sonopolisWeb` (spec W-005, hallazgo #10b de
> `W-PENDIENTES.md`) y se confirmó contra producción el 2026-08-14 (`list_migrations`,
> `information_schema.columns`, `pg_indexes`) antes de recrear este archivo, para que el
> `.sql` reproduzca exactamente lo aplicado y no una reconstrucción a ojo.

**Capa: DATOS · `supabase/migrations/` · Depende de: nada**

Pedido desde `sonopolisWeb/specs/w005-datos-comienza-at.md` — bloqueante más profundo de
ese repo (bloquea W-006, W-007, W-016). Vive acá y no en `sonopolisWeb` por la misma regla
del spec 044: un cambio de esquema es un spec de AppAll, aunque quien lo pida sea la web.

## El problema

`events.fecha` y `events.hora` son `text` — etiquetas de visualización, no datos
comparables (`fecha = "Sáb 12 Sep"`, sin año). No es un problema de formato: falta el dato,
y ningún parseo lo arregla.

Un solo problema con seis síntomas, todos en la web nueva: los filtros Hoy/Finde/Esta
semana no pueden funcionar, "elegir fecha" no tiene contra qué comparar, los grupos por día
salen en orden arbitrario, `.order("fecha")` ordena alfabéticamente, no se sabe si un
evento ya pasó, y "el destacado es el más próximo" (decisión de Victor) no se puede
calcular.

## Decisión: agregar columna, no convertir

`timestamptz` y no `date`+`time`: la pregunta que hace todo el producto es "¿cuándo
empieza?", se responde con una comparación. La zona horaria importa — Chile cambia de huso
dos veces al año y un `timestamp` sin zona se corre una hora.

**`fecha` y `hora` se quedan intactas.** La app nativa las escribe y las lee; cambiarles el
tipo la rompe en producción el mismo día. `"Sáb 12 Sep"` es la etiqueta que alguien eligió
mostrar; `comienza_at` es el dato — no son lo mismo. Cuando el nativo migre, `fecha`/`hora`
pasan a derivarse y se borran — spec posterior.

**Filas existentes quedan en `NULL`.** No se infiere un año que no está escrito; la UI las
trata como "sin fecha definida". La corrección llega por el producto, al editar el evento
(spec W-007 de `sonopolisWeb`) — no es parte de este spec ni lo bloquea.

## Trabajo

Migración `20260813234256_spec_045_comienza_at.sql`:

```sql
alter table events add column comienza_at timestamptz;
create index events_comienza_at_idx on events (comienza_at);
```

## Criterios de aceptación

- [x] La columna `comienza_at timestamptz` existe en `events` (confirmado por
      `information_schema.columns`, 2026-08-14)
- [x] El índice `events_comienza_at_idx` existe sobre `comienza_at` (confirmado por
      `pg_indexes`, 2026-08-14)
- [x] La app nativa sigue mostrando fecha y hora igual que antes — no se tocó `fecha`/`hora`
- [ ] El archivo de migración existe **antes** de aplicarse — regla que este mismo spec
      incumplió; no se puede cerrar en retrospectiva, queda documentado como el motivo de
      este spec

## Fuera de alcance

Borrar `fecha`/`hora`; backfill de las filas existentes; hora de término o duración;
esconder eventos pasados — todo eso vive en specs posteriores de `sonopolisWeb`
(W-006, W-007, W-016).
