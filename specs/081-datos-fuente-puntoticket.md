# Spec 081 — La fuente `puntoticket` en `event_sources`

> Estado: escrito, sin aplicar (8-sep-2026)
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_081_fuente_puntoticket.sql`.
> Depende de: spec 049 (`event_sources`), spec 050 (`pais` en `event_sources`).
> Habilita: `sonopolisWeb/specs/w115-logica-fuente-puntoticket.md`.

> **En una frase:** el adaptador de la segunda fuente de scraping no puede correr sin su
> fila en `event_sources` — la clave foránea de `external_events` la exige y el pipeline la
> lee para autorizar la corrida.

Pedido desde `sonopolisWeb` (spec W-115). Vive acá por la regla de siempre: escritura en la
base = spec de AppAll, aunque quien lo consuma sea la web. El reconocimiento técnico del
sitio está en el vault: `02-PROJECTS/Sonópolis/Producto/Web/2026-09-08 Puntoticket — reconocimiento técnico para scraping.md`.

## El problema

`external_events.source_slug` es `REFERENCES event_sources(slug)` (spec 049). Sin la fila,
el primer `upsert` del pipeline falla entero por violación de FK, no por fila.

Y desde el spec W-110 de la web la fila no es solo una restricción: es **el interruptor y el
contrato** de la fuente. El pipeline, antes de escribir nada, la consulta y decide:

- no existe → salta la fuente con error;
- `activa = false` → salta la fuente sin error;
- `pais` de la fila distinto de `pais` del archivo del adaptador → **aborta esa fuente sin
  escribir una sola fila**.

Ese último es el que obliga a que el `INSERT` de acá y la constante del adaptador digan
exactamente lo mismo. Si el archivo declara `CL` y esta fila dijera `AR`, no entra ni un
evento — que es el comportamiento buscado, pero solo si el dato correcto está de este lado.

## Decisión 1 — un `INSERT` en una migración, no una fila cargada a mano

Cargarla desde el Table Editor deja la producción funcionando y a cualquier entorno nuevo
(un `supabase db reset` local, un proyecto de staging) con el pipeline saltando la fuente y
nadie sabiendo por qué. La fila seed de `portaltickets` ya entró por migración (spec 049);
esta sigue el mismo camino.

```sql
insert into public.event_sources (slug, nombre, home_url, pais) values
  ('puntoticket', 'Puntoticket', 'https://www.puntoticket.com', 'CL')
on conflict (slug) do nothing;
```

`on conflict do nothing` porque la migración puede correr sobre una base donde alguien ya
cargó la fila a mano mientras se probaba el adaptador: en ese caso la migración no debe
fallar ni pisar lo que haya.

## Decisión 2 — los valores exactos, y por qué cada uno

- **`slug = 'puntoticket'`** — es la clave que el adaptador exporta como `slug` y con la que
  el pipeline filtra cada consulta (`.eq("source_slug", FUENTE.slug)`). Una letra distinta
  acá y la fuente escribe filas que después ella misma no encuentra: los "desaparecidos" y
  la caché de direcciones dejarían de funcionar en silencio.
- **`nombre = 'Puntoticket'`** — es texto de pantalla, no identificador. `getEventosExternos`
  lo embebe (`select("*, event_sources(nombre)")`, spec W-024) para la atribución "vía
  Puntoticket" en la tarjeta. Se escribe como lo escribe la marca en su propio sitio.
- **`home_url = 'https://www.puntoticket.com'`** — sin barra final y sin ruta: es el sitio,
  no el listado. La URL del listado (y de las otras cuatro vistas que W-115 lee) vive en el
  archivo del adaptador, que es quien sabe de la forma del sitio. Ponerla acá invitaría a
  cambiar el scraper editando una fila de la base.
- **`pais = 'CL'`** — Puntoticket es la ticketera chilena; el filtro geográfico que aplica
  la ingesta es la whitelist del Gran Santiago de `REGIONES_POR_PAIS.CL` (spec W-026). Tiene
  que coincidir letra por letra con la constante `pais` de `libs/scraping/fuentes/puntoticket.js`.

## Decisión 3 — entra `activa = true`, sin período de prueba en `false`

Sale con el `DEFAULT true` de la columna. La tentación es insertarla apagada y encenderla a
mano después de ver una corrida limpia, pero eso deja el spec cerrado sobre algo que no
corrió nunca, y la verificación depende de que alguien se acuerde de tocar la base.

El riesgo real es acotado por diseño: un evento externo entra como fuente de cartelera, no
de venta —`external_events` no tiene columna de monto ni de tickets (spec 049)— y si el
parseo saliera torcido, `activa = false` desde el Table Editor apaga la fuente en un
segundo, ahora sí con algo concreto que mirar.

## Criterios de aceptación

- [ ] La migración crea la fila con los cuatro valores de la Decisión 2
- [ ] Correrla dos veces seguidas no falla (`on conflict do nothing`)
- [ ] `select slug, nombre, home_url, pais, activa from event_sources` devuelve las dos
      fuentes, `portaltickets` intacta
- [ ] `supabase db push` aplicado en producción y confirmado con `supabase migration list`

## Fuera de alcance

- El adaptador y el pipeline (spec W-115 de la web)
- Cualquier cambio de esquema: las columnas que W-115 va a llenar por primera vez
  (`direccion`, `lat`, `lng`, `precio_texto`, `genero`) ya existen desde el spec 049
- Una segunda whitelist geográfica: Puntoticket es chilena y `REGIONES_POR_PAIS.CL` ya existe
- Apagar `portaltickets`. Las dos fuentes conviven; la deduplicación entre fuentes distintas
  es un problema abierto, anotado en `sonopolisWeb/specs/W-PENDIENTES.md`
