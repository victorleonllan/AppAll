# Spec 098 — La fuente `startickets` en `event_sources`

> Estado: **aplicado en producción** (21-sep-2026) — `20260921230906_spec_098_fuente_startickets.sql`. Antes del push, 1 sola migración pendiente (la propia). Después: cuatro fuentes en `event_sources`, dos `CL` y dos `MX`. La corrida escribió 22 filas con `source_slug = 'startickets'`, y la cartelera pública no cambió.
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_098_fuente_startickets.sql`.
> Depende de: spec 049 (`event_sources`), spec 050 (`pais`), spec 097 (`donboleton`, la primera fuente MX).
> Habilita: `sonopolisWeb/specs/w157-logica-fuente-startickets.md`.

> **En una frase:** segunda fuente mexicana, pedida por Victor sobre la vista de Chihuahua —
> y la primera que va a convivir con otra del mismo país y la misma región, así que estrena
> el problema de deduplicación entre fuentes.

Pedido desde `sonopolisWeb` (spec W-157). El reconocimiento técnico del sitio está en el
vault: `02-PROJECTS/Sonópolis/Producto/Web/2026-09-21 Startickets México — reconocimiento técnico para scraping.md`.

## El problema

Lo mismo que el 097: sin la fila, el primer `upsert` falla entero por violación de FK, y el
pipeline usa la fila como interruptor y contrato (existe / `activa` / `pais` coincidente).

## Decisión 1 — los valores

```sql
insert into public.event_sources (slug, nombre, home_url, pais) values
  ('startickets', 'Startickets', 'https://startickets.com.mx', 'MX')
on conflict (slug) do nothing;
```

- **`slug = 'startickets'`** — sin el "México" del nombre comercial: es la clave con la que el
  pipeline filtra cada consulta y tiene que coincidir con la constante del adaptador.
- **`nombre = 'Startickets'`** — texto de pantalla, para la atribución "vía Startickets" en la
  tarjeta (`getEventosExternos` lo embebe, spec W-024). El sitio se llama "Startickets Mexico"
  en su `<title>`, pero en la tarjeta el país sobra: el evento ya está en la cartelera de
  México.
- **`home_url`** — el sitio, no la vista de Chihuahua. La URL que el adaptador visita vive en
  su archivo, como en las otras tres fuentes.
- **`pais = 'MX'`** — tiene que coincidir letra por letra con
  `libs/scraping/fuentes/startickets.js`.

## Decisión 2 — entra `activa = true`, y acá el riesgo es distinto

Las tres fuentes anteriores entraron encendidas. Esta también, pero por una razón que ya no es
"el riesgo es acotado": **esta fuente sí trae eventos que no son música** — conferencias
católicas, un partido de fútbol, comedia y un rodeo, sobre 28 eventos totales.

El filtro de curaduría vive en el adaptador (W-157) y es una lista que se edita a mano. Entra
encendida porque la lista ya está puesta y porque `external_events` tiene `status`: un evento
que se cuele se despublica sin tocar código.

Lo que **no** se puede hacer desde la base es arreglar la curaduría — si la mezcla resulta
peor de lo previsto, la perilla rápida es `activa = false` acá, y la corrección real es la
lista del adaptador.

## Criterios de aceptación

- [x] La migración crea la fila con los cuatro valores
- [x] Correrla dos veces seguidas no falla
- [x] `event_sources` queda con **cuatro** fuentes: `portaltickets` y `puntoticket` en `CL`,
      `donboleton` y `startickets` en `MX`, todas `activa = true`
- [x] `supabase db push` aplicado y confirmado con `supabase migration list`
- [x] Después del W-157, una corrida escribe filas con `source_slug = 'startickets'` y
      `pais = 'MX'`, y la cartelera pública no cambia (`MX` no está en `PAISES`)

## Fuera de alcance

- El adaptador y su lista de curaduría (spec W-157).
- **La deduplicación entre `donboleton` y `startickets`**, que publican los dos en Ciudad
  Juárez y Chihuahua: el problema está abierto desde el spec 049 y anotado en
  `sonopolisWeb/specs/W-PENDIENTES.md`. Hasta hoy era teórico porque ninguna fuente compartía
  región con otra; con esta deja de serlo, pero resolverlo es su propio spec y necesita ver
  primero cuántos choques reales hay.
- Agregar `MX` a `PAISES`.
