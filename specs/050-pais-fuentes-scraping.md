# Spec 050 — `pais` en fuentes y eventos externos

> Estado: aplicado en producción (2026-08-20) — ver "Bugs encontrados al aplicar" abajo

**Capa: DATOS · `supabase/migrations/` · Depende de: spec 049**

Pedido desde `sonopolisWeb/specs/w026-logica-pais-fuentes.md`. Vive acá por la misma regla
del spec 049: cambio de esquema = spec de AppAll.

## El problema

`libs/scraping/comunas.js` (spec W-023) tiene una whitelist de comunas de Gran Santiago
hardcodeada, sin ninguna noción de país. Funciona porque hoy hay una sola fuente y es de
Chile, pero es una trampa: si mañana se agrega una fuente de otro país, no hay dónde
colgar "esta fuente es de Argentina" — el filtro de comuna se aplicaría igual a eventos
que no son ni de Chile.

Sonópolis tiene proyección a más de un país (este spec lo anticipa, no lo resuelve entero:
v1 sigue siendo Chile solo). Lo que hace falta ahora es el **dato**, no el filtro completo
— el filtro geográfico fino (comuna, región) sigue siendo responsabilidad de cada país y se
escribe cuando exista una segunda fuente real.

## Decisión: `pais` en las dos tablas, no solo en `event_sources`

- `event_sources.pais` — de qué país es la fuente en sí (`portaltickets` → `CL`). Un dato
  de configuración, se sabe de antemano.
- `external_events.pais` — copiado del `event_sources.pais` de la fuente al momento de la
  ingesta. Denormalizado a propósito, mismo criterio que `comuna` en el spec 049: filtrar o
  mostrar por país no puede depender de un `join` en cada consulta, y una fuente que cambie
  de alcance en el futuro no debe reescribir eventos ya guardados con el país viejo.

`char(2)`, código ISO 3166-1 alpha-2 en mayúsculas (`CL`, `AR`, ...). `NOT NULL` en las dos
— igual que `comuna`, es un criterio de ingesta, no un dato decorativo que pueda faltar.

## Trabajo

Migración `<timestamp>_spec_050_pais_fuentes.sql`:

- `ALTER TABLE event_sources ADD COLUMN pais char(2) NOT NULL DEFAULT 'CL'` — el `DEFAULT`
  es solo para no romper la fila ya seedeada de `portaltickets`; los `event_sources` que se
  agreguen después declaran su país explícito
- `ALTER TABLE external_events ADD COLUMN pais char(2) NOT NULL DEFAULT 'CL'` — mismo
  motivo, cubre las 33 filas ya insertadas por la corrida del W-023
- Quitar el `DEFAULT` de las dos columnas después del backfill (`ALTER COLUMN ... DROP
  DEFAULT`), para que un `INSERT` que se olvide del país falle fuerte en vez de asumir Chile
  en silencio
- Índice `(pais, comienza_at)` en `external_events`, mismo patrón que el `(status,
  comienza_at)` del spec 049 — es el filtro que la Cartelera va a necesitar apenas exista
  una segunda fuente

## Criterios de aceptación

- [x] `event_sources.pais` y `external_events.pais` existen, `NOT NULL`, sin `DEFAULT`
- [x] La fila `portaltickets` tiene `pais = 'CL'`
- [x] Las filas de `external_events` ya existentes quedaron en `'CL'` tras el backfill
- [x] Índice `(pais, comienza_at)` existe

## Fuera de alcance

- Filtro geográfico fino para países que no sean Chile (comuna, región, ciudad) — se
  escribe cuando exista una segunda fuente real, no antes
- Selector de país en la UI de la Cartelera — v1 sigue siendo Chile-only, este spec solo
  deja el dato listo para cuando deje de serlo

## Bugs encontrados al aplicar (2026-08-20)

La migración quedó escrita en el repo el 2026-08-19 pero nunca se corrió contra
producción: `supabase migration list` la mostraba con `remote: ""` mientras la migración
049 (posterior en el trabajo real, pero con timestamp más nuevo) sí estaba aplicada.
Causa: el archivo de este spec lleva timestamp `14:45:28`, anterior al de 049
(`16:46:43`), aunque se escribió después — quedó "antes" en el orden de aplicación, así
que un `supabase db push` normal no la detectaba como pendiente al final de la cola.

Efecto en producción: el pipeline de scraping (`sonopolisWeb/libs/scraping/pipeline.js`)
ya escribía `pais` en cada fila desde que ese campo se agregó al código, así que cada
corrida del cron fallaba entera con `column external_events.pais does not exist` — 0
eventos nuevos, 0 marcados como desaparecidos, 0 purgados. No rompía la cartelera (seguía
sirviendo lo ya cargado) pero la dejaba congelada en silencio, con el error solo visible
en `event_sources.last_error`.

Fix: `supabase db push --include-all` — el flag hace falta específicamente cuando hay una
migración con timestamp anterior a la última ya aplicada. Verificado con una corrida real
después del fix: 6 nuevos, 24 actualizados, 0 errores.

Lección para el futuro: si un spec de datos se escribe después de otro pero su migración
queda con timestamp anterior (por reordenar specs, por ejemplo), `supabase migration
list` es el chequeo real — no asumir que "se aplicó" solo porque el archivo existe en el
repo.
