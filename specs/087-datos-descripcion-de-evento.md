# Spec 087 — `description` en `events`

> Estado: aplicado en producción (11-sep-2026) — `supabase db push` confirmó la migración; sin `docker` local no se pudo correr `db diff` para verificar contra un shadow DB, pero el push no reportó error.
> Capa: DATOS. `supabase/migrations/20260911141000_spec_087_descripcion_evento.sql`.
> Depende de: ninguno.

> **En una frase:** el comprador hoy solo ve artista, fecha, local y precio — no hay dónde
> el organizador cuente de qué va el show antes de pagar la entrada.

Pedido de Victor, 11-sep-2026: un espacio para que el creador del evento escriba una
descripción que se vea en la ficha de compra. Vive acá por la regla de siempre: cambio de
esquema = spec de AppAll, aunque quien lo consuma sea `sonopolisWeb` (w120/w121).

## Decisión — `text` nullable, sin `CHECK` de largo

Mismo patrón que `venues.description` (baseline): `text`, sin `NOT NULL`, sin `DEFAULT`. Los
eventos que ya existen quedan con `NULL` — "sin descripción todavía", no un string vacío que
haya que distinguir de "el organizador la borró a propósito".

El límite de 300 caracteres que pidió Victor es una regla de producto (cuánto se muestra en
la ficha), no una invariante de los datos — no hay otra fila ni otro flujo que dependa de que
la columna nunca supere ese largo. Se aplica en el formulario (w121), no con `CHECK` en la
base: un `CHECK` congelaría el límite ahí para siempre, y si el número cambia mañana es un
`ALTER` más para un producto que hoy solo quiere no romper el layout de la ficha.

## Trabajo

Migración `20260911141000_spec_087_descripcion_evento.sql`:

```sql
ALTER TABLE public.events ADD COLUMN description text;
```

**Sin cambios de RLS.** Es un campo más del evento — mismas policies que `genero` o
`precio`: lo escribe quien puede editar el evento (`can_edit_event`), lo lee cualquiera con
acceso a la fila (la ficha pública ya lee `events.*`).

## Criterios de aceptación

- [ ] `events.description` existe, `text`, `is_nullable = YES`, `column_default = null` —
      `information_schema.columns`
- [ ] Un evento existente sigue leyendo `description: null` sin romper `getEventos`/`getEvento`
