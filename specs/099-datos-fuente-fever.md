# Spec 099 — La fuente `fever` en `event_sources`

> Estado: **aplicado en producción** (21-sep-2026) — `20260921233622_spec_099_fuente_fever.sql`, única migración pendiente antes del push. Cinco fuentes en `event_sources`: 2 en `CL`, 3 en `MX`. La corrida escribió 3 filas con `source_slug = 'fever'`.
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_099_fuente_fever.sql`.
> Depende de: spec 049 (`event_sources`), spec 050 (`pais`), specs 097 y 098 (las dos fuentes mexicanas anteriores).
> Habilita: `sonopolisWeb/specs/w160-logica-fuente-fever.md`.

> **En una frase:** tercera fuente mexicana, pedida por Victor. Es la primera que **no es una
> ticketera local** sino una plataforma global de experiencias, y la que mejores datos
> estructurados publica de las cinco.

Pedido desde `sonopolisWeb` (spec W-160). El reconocimiento está en el vault:
`02-PROJECTS/Sonópolis/Producto/Web/2026-09-21 Fever — reconocimiento técnico para scraping.md`.

## Decisión 1 — los valores

```sql
insert into public.event_sources (slug, nombre, home_url, pais) values
  ('fever', 'Fever', 'https://feverup.com', 'MX')
on conflict (slug) do nothing;
```

- **`slug = 'fever'`** — la clave con la que el pipeline filtra; coincide con la constante del
  adaptador.
- **`nombre = 'Fever'`** — para la atribución "vía Fever" en la tarjeta.
- **`home_url`** — el sitio. La URL de la vista de Chihuahua vive en el archivo del adaptador.
- **`pais = 'MX'`** — Fever opera en decenas de países; **esta fila es la de su catálogo
  mexicano**. Si algún día se scrapea Fever en Chile, es otra fila con otro slug
  (`fever-cl`), no la misma: el pipeline valida país por fuente, y una fuente con dos países
  no tiene forma de declararlo.

Esa última decisión es nueva respecto de las cuatro fuentes anteriores, que eran todas de un
solo país por naturaleza.

## Decisión 2 — entra `activa = true`

Mismo criterio que las anteriores. El riesgo de curaduría acá es **menor** que en Startickets:
la vista que se scrapea es la categoría de música del propio sitio, y el adaptador solo acepta
lo que publica un `schema.org/Event`, lo que deja fuera las tarjetas de regalo sin necesidad
de lista negra.

## Criterios de aceptación

- [x] La migración crea la fila con los cuatro valores
- [x] Correrla dos veces seguidas no falla
- [x] `event_sources` queda con **cinco** fuentes: 2 en `CL`, 3 en `MX`, todas `activa = true`
- [x] `supabase db push` aplicado y confirmado
- [x] Después del W-160, una corrida escribe filas con `source_slug = 'fever'` y `pais = 'MX'`

## Fuera de alcance

- El adaptador (spec W-160).
- Fever en otras ciudades de México o en otros países: cada una es una URL más en el
  adaptador, y otro país sería otra fila.
- La deduplicación entre las tres fuentes mexicanas, que ahora publican todas en Chihuahua.
  Sigue abierta desde el spec 049.
