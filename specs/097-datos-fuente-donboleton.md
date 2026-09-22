# Spec 097 — La fuente `donboleton` en `event_sources`, y con ella México

> Estado: **aplicado en producción** (21-sep-2026) — `20260921211833_spec_097_fuente_donboleton.sql`. Verificado: antes del push no había ninguna migración ajena pendiente (62 locales = 62 remotas), así que el `db push` aplicó solo esta. Después: tres fuentes en `event_sources`, `donboleton` con `pais = 'MX'` —la primera fila del esquema que no es Chile— y las dos chilenas intactas. La corrida del pipeline escribió 35 filas con `source_slug = 'donboleton'` y `pais = 'MX'`, y la cartelera pública no cambió.
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_097_fuente_donboleton.sql`.
> Depende de: spec 049 (`event_sources`), spec 050 (`pais` en `event_sources`).
> Habilita: `sonopolisWeb/specs/w152-logica-fuente-donboleton.md`.

> **En una frase:** es la primera fila de `event_sources` que no dice `CL`, así que además
> de habilitar el adaptador es la prueba de que el país por fuente —diseñado en el spec 050
> y validado por el W-110— funciona con un país de verdad.

Pedido desde `sonopolisWeb` (spec W-152). Vive acá por la regla de siempre: escritura en la
base = spec de AppAll, aunque quien lo consuma sea la web. El reconocimiento técnico del
sitio está en el vault:
`02-PROJECTS/Sonópolis/Producto/Web/2026-09-21 Don Boletón — reconocimiento técnico para scraping.md`.

## El problema

`external_events.source_slug` es `REFERENCES event_sources(slug)` (spec 049). Sin la fila, el
primer `upsert` del pipeline falla entero por violación de FK, no por fila.

Y desde el W-110 la fila no es solo una restricción: es el interruptor y el contrato de la
fuente. Antes de escribir nada, el pipeline la consulta y decide:

- no existe → salta la fuente con error;
- `activa = false` → salta la fuente sin error;
- `pais` de la fila distinto de `pais` del archivo del adaptador → **aborta esa fuente sin
  escribir una sola fila**.

Con `portaltickets` y `puntoticket` ese último chequeo era teórico: las tres partes decían
`CL`. Acá deja de serlo.

## Decisión 1 — `pais = 'MX'`, y es lo que este spec viene a hacer

Las dos fuentes existentes son chilenas. Esta es la primera que no. El valor tiene que
coincidir **letra por letra** con la constante `pais` de
`libs/scraping/fuentes/donboleton.js`, o el W-110 aborta la fuente y no entra ni un evento
— que es el comportamiento buscado, pero solo si el dato correcto está de este lado.

**Esto no hace que México aparezca en la cartelera.** Que un país tenga eventos en
`external_events` y que un visitante pueda verlos son dos cosas distintas: lo segundo exige
que `MX` entre a `PAISES` en `sonopolisWeb/libs/pais.js`, que es una decisión aparte y
posterior (spec W-109: un país entra al catálogo **cuando ya tiene cartelera**).

Esa separación es justamente lo que vuelve seguro aplicar este spec: los eventos mexicanos
entran a producción y **nadie los ve** hasta que alguien decida lo contrario. Sirve para
probar la cadena completa contra datos reales sin cambiar una línea de lo que ve el público.

## Decisión 2 — los valores exactos, y por qué cada uno

```sql
insert into public.event_sources (slug, nombre, home_url, pais) values
  ('donboleton', 'Don Boletón', 'https://www.donboleton.com', 'MX')
on conflict (slug) do nothing;
```

- **`slug = 'donboleton'`** — la clave con la que el pipeline filtra cada consulta
  (`.eq("source_slug", FUENTE.slug)`). Una letra distinta acá y la fuente escribe filas que
  después ella misma no encuentra: los "desaparecidos" y la caché de detalle dejarían de
  funcionar en silencio. Sin punto ni acento, como los otros dos slugs.
- **`nombre = 'Don Boletón'`** — texto de pantalla, no identificador. `getEventosExternos` lo
  embebe (`select("*, event_sources(nombre)")`, spec W-024) para la atribución "vía Don
  Boletón" en la tarjeta. Con acento y separado, como lo escribe la marca.
- **`home_url = 'https://www.donboleton.com'`** — el sitio, no el listado. Sin barra final.
  Acá el listado *es* la home, pero la URL que el adaptador visita vive en su archivo: poner
  rutas en la base invitaría a cambiar el scraper editando una fila.
- **`pais = 'MX'`** — ver Decisión 1.

`on conflict (slug) do nothing` porque la migración puede correr sobre una base donde alguien
ya cargó la fila a mano mientras probaba el adaptador: no debe fallar ni pisar lo que haya.

## Decisión 3 — entra `activa = true`, como la fuente anterior

Sale con el `DEFAULT true` de la columna, mismo criterio que el spec 081: insertarla apagada
deja el spec cerrado sobre algo que no corrió nunca, y la verificación depende de que alguien
se acuerde de encenderla.

El riesgo está acotado por diseño y **más acotado que en el spec 081**: un evento externo
entra como fuente de cartelera, no de venta (`external_events` no tiene columna de monto ni
de tickets), y además estos eventos son `MX`, un país que hoy ninguna pantalla pública
muestra. Si el parseo sale torcido, no lo ve nadie. `activa = false` desde el Table Editor
apaga la fuente en un segundo.

## Trabajo

Migración `<timestamp>_spec_097_fuente_donboleton.sql` con el `insert` de la Decisión 2.
Nada más: **sin cambios de esquema**. Las columnas que W-152 va a llenar (`direccion`,
`precio_texto`, `genero`, `lat`, `lng`) existen desde el spec 049, y `pais` desde el 050.

## Criterios de aceptación

- [x] La migración crea la fila con los cuatro valores de la Decisión 2
- [x] Correrla dos veces seguidas no falla
- [x] `select slug, nombre, home_url, pais, activa from event_sources` devuelve **tres**
      fuentes, con `portaltickets` y `puntoticket` intactas en `CL` y `activa = true`
- [x] `donboleton` queda con `pais = 'MX'` — la primera fila del esquema con un país que no
      es Chile
- [x] `supabase db push` aplicado y confirmado con `supabase migration list`
- [x] **Después del W-152**: una corrida del pipeline escribe filas con
      `source_slug = 'donboleton'` y `pais = 'MX'`, y la cartelera pública **no cambia**
      (los eventos `MX` quedan fuera porque `PAISES` no tiene `MX`)

## Fuera de alcance

- El adaptador y la whitelist geográfica `REGIONES_POR_PAIS.MX` (spec W-152 de la web).
- **Agregar `MX` a `PAISES`**: es lo que haría visible la cartelera mexicana, y va en su
  propio spec de la web, después de ver una corrida real. Un país entra al catálogo cuando
  ya tiene cartelera (W-109), no para estrenarla.
- Cualquier cambio de esquema.
- Las otras tres ticketeras mexicanas reconocidas (Startickets, Boletito, TicketZone): cada
  fuente es su propio spec, y las razones para empezar por esta están en la nota del vault.
- La deduplicación entre fuentes distintas, que sigue siendo un problema abierto en
  `sonopolisWeb/specs/W-PENDIENTES.md` y que con dos fuentes en Chihuahua se vuelve más
  probable.
