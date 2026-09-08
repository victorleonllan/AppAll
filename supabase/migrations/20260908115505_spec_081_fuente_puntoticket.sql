-- Spec 081 — La fila `puntoticket` en `event_sources`
--
-- `external_events.source_slug` es REFERENCES event_sources(slug) (spec 049): sin esta
-- fila, el primer upsert del pipeline falla entero por violación de FK, no fila por fila.
-- Desde el spec W-110 de la web la fila además es el interruptor y el contrato de la
-- fuente: el pipeline la consulta antes de escribir y salta la fuente si no existe, si
-- `activa = false`, o si su `pais` no coincide con el del archivo del adaptador.
--
-- Va por migración y no cargada a mano desde el Table Editor para que cualquier entorno
-- nuevo (un `db reset` local, un staging) tenga la fuente, igual que la fila seed de
-- `portaltickets` del spec 049.
--
-- Los valores tienen que coincidir letra por letra con `libs/scraping/fuentes/puntoticket.js`
-- de sonopolisWeb (spec W-115): `slug` es la clave con la que la fuente filtra sus propias
-- filas, y `pais` es lo que el pipeline compara antes de autorizar la corrida.
--
-- `activa` sale en true por el DEFAULT de la columna: el riesgo es acotado porque un evento
-- externo es cartelera, no venta (`external_events` no tiene monto ni tickets, spec 049),
-- y apagar la fuente es un UPDATE de un segundo si el parseo sale torcido.

insert into public.event_sources (slug, nombre, home_url, pais) values
  ('puntoticket', 'Puntoticket', 'https://www.puntoticket.com', 'CL')
on conflict (slug) do nothing;
