# Spec 082 — Cierre temporal obligatorio en preventas

> Estado: **aplicado en producción** (8-sep-2026) — `20260908155200_spec_082_cierre_temporal_preventas.sql` corrida contra `xluinfihjjtxkglihxqz` con `supabase db push`, los 6 criterios verificados por SQL directo en una transacción revertida. Prechequeo: una sola preventa activa en producción (la del incidente, Santiago samba club, 7/19 vendidas), que recibió el default `horas_antes`/3 — y como su evento ya pasó, con el 083 quedó cerrada sola.
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_082_cierre_temporal_preventas.sql`.
> Depende de: spec 064 (`event_preventas`), spec 068 (`cupo` obligatorio), spec 045
> (`events.comienza_at`).

> **En una frase:** una preventa hoy solo muere por cupo o a mano, así que en la puerta del
> evento sigue viva y se vende a precio de preventa — necesita una hora de cierre que no
> dependa de que alguien se acuerde.

## El incidente (7-sep-2026)

En un evento real, un fan compró dos entradas **estando en la puerta** y pagó precio de
preventa. No hubo bug: `precio_vigente_de` (spec 065/069) hizo exactamente lo que dice —
cobró la preventa de menor `orden` que estuviera `activa` y con `vendidos < cupo`. La
preventa tenía cupo y nadie la cerró a mano, así que para la base seguía vigente.

El modelo actual solo conoce dos cierres:

| Cierre | Quién lo ejecuta | Falla cuando |
|---|---|---|
| Cupo (`vendidos < cupo`) | La base, sola | Quedan entradas de preventa el día del evento |
| Manual (`activa = false`) | El organizador, desde el formulario | Está atendiendo la puerta y no se acuerda |

Los dos fallaron a la vez porque **ninguno mira el reloj**. Ese es el hueco.

## Decisión 1 — se agrega un cierre por tiempo, no se reemplaza el cupo

Victor propuso tres reglas: hasta agotar stock, una fecha específica, u horas antes del
inicio. Las tres van, pero no como "elige una":

- **Stock** ya existe y ya es obligatorio (spec 068). Se queda como está.
- **Tiempo** es lo nuevo, y es **obligatorio**: toda preventa tiene una hora de cierre.
  El organizador elige cómo escribirla — fecha y hora exacta, u horas antes del inicio.
- El cierre manual (`activa`) sigue siendo el override.

La preventa está abierta solo si **todas** las condiciones se cumplen: activa, con cupo y
antes de la hora de cierre. "Lo que ocurra primero" la cierra. Un "elige una" habría
dejado la puerta abierta a una preventa solo-por-stock, que es exactamente el caso del
incidente.

## Decisión 2 — el cierre es por preventa, no por evento

Una preventa temprana suele cerrar en una fecha ("Preventa 1 hasta el 15") y la última
suele cerrar contra el inicio ("Preventa 2 hasta 3 horas antes"). Poner un solo cierre a
nivel de evento obligaría a que todas terminen igual. Las columnas van en
`event_preventas`, una regla por fila.

## Decisión 3 — se guarda la regla, no el instante calculado

Para "horas antes" se guarda el número de horas, y el instante de cierre se **calcula**
cada vez a partir de `events.comienza_at`. Si el organizador corre el evento un día, la
preventa se corre con él sin que nadie edite nada. Guardar el timestamp calculado
dejaría la preventa cerrando a la hora del evento viejo.

Para "fecha" se guarda el instante tal cual (`timestamptz`): ese sí es un dato fijo que el
organizador eligió a propósito.

Quién calcula el instante y decide si la preventa está abierta es LÓGICA (spec 083); este
spec solo deja las columnas y sus garantías.

## Decisión 4 — el default recomendado vive en la base y es editable

Pedido explícito de Victor: proponer un default, que el organizador lo pueda cambiar, que
se vea como "recomendado" y que esté visible al crear el evento. La parte de pantalla es
FRONTEND (W-116). Lo que le toca a este spec:

- **Default a nivel de columna**: `cierre_tipo = 'horas_antes'`, `cierre_horas_antes = 3`.
  Cualquier cliente que inserte una preventa sin decir nada (la app móvil, un script) queda
  con la regla recomendada, no sin regla. Esto es distinto del spec 080, donde un `INSERT`
  sin país debía fallar fuerte: allá no había un valor correcto que asumir; acá el
  recomendado **es** el valor correcto para quien no opina.
- **3 horas** es una elección de esta sesión, no un dato de Victor. Un evento a las 21:00
  con puertas a las 20:00 cierra la preventa a las 18:00 — margen para que "en la puerta"
  nunca alcance a la preventa, sin quitarle la tarde entera de venta. Se cambia en un solo
  `ALTER COLUMN ... SET DEFAULT` y en la constante del frontend (W-116), que la repite
  porque el navegador no puede leer el default de una columna.
- **Backfill**: las preventas que ya existen reciben el default al agregar la columna.
  Verificar antes de aplicar cuántas filas activas hay y de qué eventos, porque desde el
  spec 083 en adelante esas preventas van a cerrar 3 horas antes de su evento sin que el
  organizador lo haya pedido:
  `SELECT p.id, p.nombre, e.artist_name, e.comienza_at FROM event_preventas p JOIN events e ON e.id = p.event_id WHERE p.activa;`

## Migración

```sql
ALTER TABLE public.event_preventas
  ADD COLUMN IF NOT EXISTS cierre_tipo        text        NOT NULL DEFAULT 'horas_antes',
  ADD COLUMN IF NOT EXISTS cierre_horas_antes integer     DEFAULT 3,
  ADD COLUMN IF NOT EXISTS cierre_at          timestamptz;

ALTER TABLE public.event_preventas
  ADD CONSTRAINT event_preventas_cierre_tipo_check
    CHECK (cierre_tipo IN ('horas_antes', 'fecha'));

-- La regla elegida tiene que estar completa: horas para 'horas_antes', instante para
-- 'fecha'. La columna que no aplica puede quedar con lo que tenga (el default de 3 horas
-- no molesta en una preventa por fecha): LÓGICA lee solo la que corresponde al tipo.
ALTER TABLE public.event_preventas
  ADD CONSTRAINT event_preventas_cierre_completo CHECK (
    (cierre_tipo = 'horas_antes' AND cierre_horas_antes IS NOT NULL AND cierre_horas_antes >= 0)
    OR
    (cierre_tipo = 'fecha' AND cierre_at IS NOT NULL)
  );

COMMENT ON COLUMN public.event_preventas.cierre_tipo IS
  'Cómo cierra por tiempo (spec 082): horas_antes = N horas antes de events.comienza_at; fecha = en cierre_at. Obligatorio; el default es el recomendado.';
COMMENT ON COLUMN public.event_preventas.cierre_horas_antes IS
  'Horas antes de events.comienza_at en que cierra, cuando cierre_tipo = horas_antes. 0 = cierra al inicio del evento.';
COMMENT ON COLUMN public.event_preventas.cierre_at IS
  'Instante exacto de cierre, cuando cierre_tipo = fecha.';
```

`cierre_horas_antes >= 0` y no `> 0`: "0 horas antes" es "cierra cuando empieza el
evento", una regla legítima aunque no sea la recomendada. Un valor negativo sería "cierra
después de que empezó", que es no tener cierre.

**Sin cambio de RLS.** Las columnas nuevas viajan dentro de la fila de `event_preventas`,
que el equipo del evento ya edita por `can_edit_event` (spec 064) y el público ya lee.

**Sin validar contra `events.comienza_at` en la constraint.** Un `CHECK` no puede mirar
otra tabla. Que el evento tenga `comienza_at` para que "horas antes" signifique algo lo
resuelve el spec 083 (falla cerrado: sin `comienza_at`, la preventa se considera cerrada).

## Criterios de aceptación

- [x] Las tres columnas existen con los tipos y defaults de arriba
      (`information_schema.columns`).
- [x] Todas las filas previas quedaron `cierre_tipo = 'horas_antes'`, `cierre_horas_antes = 3`.
- [x] `INSERT` con `cierre_tipo = 'fecha'` y `cierre_at NULL` falla por
      `event_preventas_cierre_completo`.
- [x] `INSERT` con `cierre_tipo = 'horas_antes'` y `cierre_horas_antes = -1` falla.
- [x] `INSERT` con `cierre_tipo = 'puerta'` (o cualquier otro) falla por
      `event_preventas_cierre_tipo_check`.
- [x] `INSERT` mínimo (sin ninguna columna de cierre) queda con el recomendado.

## Fuera de alcance

- **Calcular el instante de cierre y aplicarlo en el cobro** — spec 083 (LÓGICA):
  `precio_vigente_de` y `_reservar_ticket_shared` pasan a mirar el reloj.
- **El selector en el formulario, con el recomendado visible** — `sonopolisWeb`
  spec W-116 (FRONTEND).
- **`comienza_at` en la app móvil.** `src/` no escribe `comienza_at` (`grep comienza src/`
  da cero); un evento creado desde la app y con preventas creadas después desde la web
  tendría "horas antes" sin referencia. Hoy solo la web crea preventas y la web sí escribe
  `comienza_at` (`libs/fecha.js`), así que no bloquea — pero es un spec FRONTEND de esta
  app pendiente, anotado en `PENDIENTES.md`.

## Consecuencia para las apps que consumen esto

`mapPreventaFromDB` (`sonopolisWeb/libs/mappers.js`) recibe tres campos nuevos;
`crearPreventa`/`actualizarPreventa` (`libs/data/preventas.js`) pueden mandarlos u
omitirlos — omitidos, la base pone el recomendado. Nada se rompe al aplicar solo este spec:
el cobro sigue ignorando el reloj hasta el 083.
