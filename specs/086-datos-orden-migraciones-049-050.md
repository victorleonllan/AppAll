# Spec 086 — El orden de las migraciones 049 y 050

> Estado: **aplicado en producción** (10-sep-2026) — archivo renombrado y remoto realineado
> Capa: DATOS — no cambia el esquema; cambia el **historial** de migraciones.
> Depende de: nada. Bloquea: spec 024 (entorno local).
> Origen: hallazgo de la prueba de restauración del spec 025.

> **En una frase:** el spec 050 tiene un timestamp anterior al 049 del que depende, así que la
> cadena de migraciones no reconstruye desde cero — y eso deja a Sonópolis sin forma de levantar
> un entorno nuevo ni de restaurar de verdad.

## El problema

```
20260819144528_spec_050_pais_fuentes.sql      ← agrega pais a event_sources
20260819164643_spec_049_eventos_externos.sql  ← CREA event_sources
```

Dos horas de diferencia, en el orden equivocado. Aplicadas por timestamp, el 050 corre primero y
falla con `relation "event_sources" does not exist`; el 081 cae detrás
(`column "pais" does not exist`).

**Por qué nunca se notó:** a producción llegaron por `db push`, que las aplicó en el orden en que
se pushearon, no por timestamp. `supabase_migrations.schema_migrations` las tiene registradas
invertidas y la base quedó correcta igual. El error es invisible mientras nadie reconstruya.

**Qué rompe hoy:** `supabase db reset` no levanta un entorno usable. Eso bloquea el entorno local
del spec 024 y obliga a intervención manual en cualquier restauración de emergencia — justo el
momento en que menos se quiere improvisar.

## Decisión 1 — renombrar el archivo del 050, no reescribir su contenido

```
20260819144528_spec_050_pais_fuentes.sql  →  20260819164644_spec_050_pais_fuentes.sql
```

Un segundo después del 049. El SQL no se toca: el problema es cuándo corre, no qué hace.

Se descartaron dos alternativas:

- **Hacer el 050 defensivo** (que cree `event_sources` si no existe): duplica la definición de la
  tabla en dos migraciones, y la copia se desactualiza en el primer cambio de esquema.
- **Documentar el orden manual** ("aplicar el 049 antes del bucle"): convierte una cadena
  reproducible en un procedimiento con nota al pie. Un procedimiento con nota al pie es un
  procedimiento que alguien va a ejecutar sin leer la nota.

## Decisión 2 — realinear el remoto con `migration repair`

Renombrar el archivo sin más deja el remoto con `20260819144528` registrado y sin
`20260819164644`: el próximo `db push` intentaría aplicar el 050 otra vez sobre una base que ya
lo tiene.

```bash
supabase migration repair --status reverted 20260819144528
supabase migration repair --status applied  20260819164644
supabase migration list        # local y remoto tienen que coincidir 55/55
```

`repair` escribe en `supabase_migrations.schema_migrations` — **la tabla de registro, no el
esquema ni los datos**. No corre SQL de la migración. Aun así es escritura en producción, y por
eso este spec la deja explícita en vez de esconderla dentro de otro cambio.

## Decisión 3 — probarlo en la réplica antes de tocar producción

El respaldo del spec 025 dejó una réplica reconstruible. El orden correcto de trabajo es:
renombrar → reconstruir la réplica desde cero → verificar que las 55 migraciones corren limpias y
que el esquema resultante coincide con producción → recién entonces el `repair`.

Es la primera vez que un cambio de migraciones se puede validar antes de aplicarlo. Es
exactamente para lo que se montó el respaldo.

## Criterios de aceptación

- [x] El archivo del 050 queda con timestamp `20260819164644`, contenido intacto (`git mv`)
- [x] Una reconstrucción desde cero corre las **56 migraciones sin una sola falla**, en orden
      cronológico puro y sin intervención manual (base `sonopolis_prueba`, Postgres 17.11)
- [x] El esquema reconstruido coincide con producción columna por columna — **244/244**
- [x] `supabase migration repair` dejó local y remoto en **56/56, cero desalineadas**
- [x] `supabase db push` posterior aplicó solo la migración del spec 085, sin tocar el 049/050
- [ ] El clon de WSL que usa Hermes queda realineado — pendiente, requiere la máquina Windows

## Fuera de alcance

- **Auditar el resto de los timestamps.** Este es el único par con la dependencia invertida que la
  reconstrucción destapó; si aparecen más, es otro spec.
- **Cambiar cómo se generan los timestamps.** Que el 050 haya salido con hora anterior al 049
  sugiere que se escribió a mano o en otra máquina con reloj distinto. Vale una convención
  (`supabase migration new` siempre), pero es proceso, no esquema.
- El drift de columnas `avatar`, que es el otro hallazgo de la misma prueba — spec 085.


---

## Addenda — ejecución (10-sep-2026)

Hecho en el orden que pedía la Decisión 3: renombrar → reconstruir la réplica desde cero →
verificar → recién entonces tocar producción.

**La reconstrucción de validación:** base limpia, andamiaje, las 56 migraciones en orden
cronológico puro. Antes del arreglo fallaban 5 (el 050, el 081 detrás de él, y tres más por
piezas de infra de Supabase que faltaban); después, **0 fallas** y 244/244 columnas contra
producción. Los datos del respaldo cargaron sin un solo error.

**En producción** se corrieron los dos `repair` y después `db push`. Verificado que no cambió
nada: 244 columnas, `tickets` 25, `auth.users` 15, `profiles.avatar` con su único valor.

**Lo que queda:** el clon de WSL de Hermes sigue con el nombre viejo del archivo. Se arregla solo
la próxima vez que corra su `git fetch && git reset --hard origin/main` — que es justamente el
paso 0 del [[cron-drift-esquema-supabase]] y por eso está diseñado así.
