# Spec 084 — La fuente `ticketmaster` en `event_sources`, apagada

> Estado: escrito, sin aplicar (8-sep-2026)
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_084_fuente_ticketmaster.sql`.
> Depende de: spec 049 (`event_sources`), spec 050 (`pais`).
> Habilita: `sonopolisWeb/specs/w117-logica-fuente-ticketmaster.md`.

> **En una frase:** la tercera fuente de scraping necesita su fila igual que las dos
> anteriores, pero esta entra con `activa = false` — el interruptor es la forma de que el
> código exista sin que empiece a scrapear un sitio cuyos Términos de Uso lo prohíben.

Pedido desde `sonopolisWeb` (spec W-117). Reconocimiento del sitio en el vault:
`02-PROJECTS/Sonópolis/Producto/Web/2026-09-08 Ticketmaster Chile — reconocimiento técnico para scraping.md`.

## El problema

Es el mismo del spec 081: `external_events.source_slug` es
`REFERENCES event_sources(slug)`, y desde el W-110 el pipeline lee la fila antes de escribir
—existe / `activa` / `pais` coincide— y salta o aborta la fuente según lo que encuentre.

Lo que cambia es **cómo entra**.

## Decisión 1 — entra con `activa = false`, al revés que las dos fuentes anteriores

El spec 081 argumentó lo contrario para Puntoticket ("entra `activa = true`, sin período de
prueba en `false`") y ese argumento sigue siendo bueno **para ese caso**: dejarla apagada
cerraba el spec sobre algo que no había corrido nunca.

Acá el motivo de apagarla no es la prudencia técnica, es otro:

- `robots.txt` de `ticketmaster.cl` **no tiene grupo `User-agent: *`**: solo contempla tres
  bots de Google. No hay ninguna ruta prohibida que respetar, y eso es peor que tener
  reglas, no mejor — no hay nada escrito por el sitio que se pueda cumplir.
- Los **Términos de Uso** de Ticketmaster prohíben expresamente robots y scrapers. Eso no
  aparece en ningún archivo que un `curl` pueda leer, y no es una decisión de arquitectura:
  es de Victor.

Con `activa = false`, el pipeline **salta la fuente sin error** (W-110, Decisión 3) y el
adaptador puede existir, compilar y quedar revisado sin que se dispare un solo request. La
fuente se enciende con un `update` de una línea en el Table Editor, el día que la decisión
esté tomada.

```sql
insert into public.event_sources (slug, nombre, home_url, pais, activa) values
  ('ticketmaster', 'Ticketmaster', 'https://www.ticketmaster.cl', 'CL', false)
on conflict (slug) do nothing;
```

`on conflict do nothing` por lo mismo que en el 081: la migración puede correr sobre una
base donde la fila ya se cargó a mano, y ahí no debe fallar ni pisar nada — en particular,
no debe volver a apagar una fuente que alguien encendió a propósito.

## Decisión 2 — los valores, y por qué

- **`slug = 'ticketmaster'`**, no `'ticketmaster-cl'`. Es la clave con la que el pipeline
  filtra todas sus consultas; el país ya va en su propia columna, así que meterlo en el slug
  lo duplica. Si algún día entra Ticketmaster de otro país, será otra fila con otro slug y
  su propio `pais`.
- **`nombre = 'Ticketmaster'`** — es texto de pantalla: la tarjeta de la cartelera dice "vía
  Ticketmaster" leyendo esta columna (spec W-024). Sin el "Chile", que en una cartelera que
  hoy es toda chilena no agrega nada.
- **`home_url = 'https://www.ticketmaster.cl'`** — el sitio, no el listado. Los cuatro
  listados de categoría viven en el adaptador, que es quien sabe de la forma del sitio.
- **`pais = 'CL'`** — tiene que coincidir letra por letra con la constante `pais` de
  `libs/scraping/fuentes/ticketmaster.js`, o el pipeline aborta la fuente sin escribir nada.

## Criterios de aceptación

- [ ] La migración crea la fila con los cinco valores, `activa = false` incluido
- [ ] Correrla dos veces no falla, y **no apaga** la fila si alguien ya la encendió
- [ ] `select slug, pais, activa from event_sources` devuelve las tres fuentes, con
      `portaltickets` y `puntoticket` intactas y en `true`
- [ ] Aplicada en producción y confirmada con `supabase migration list`
- [ ] Una corrida del cron después de aplicarla **salta** Ticketmaster sin sumar un error al
      resumen (es el comportamiento del W-110 para `activa = false`)

## Fuera de alcance

- El adaptador (spec W-117 de la web)
- Encender la fuente: es la decisión de Victor descrita en la Decisión 1, y se hace con un
  `update`, no con una migración
- Cualquier cambio de esquema: las columnas que W-117 llena (`direccion`, `precio_texto`,
  `genero`) existen desde el spec 049
