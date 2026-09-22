-- Spec 097 — La fuente `donboleton` en `event_sources`, y con ella México.
--
-- Primera fila del esquema con un país que no es Chile. El valor 'MX' debe coincidir
-- letra por letra con la constante `pais` de sonopolisWeb/libs/scraping/fuentes/donboleton.js:
-- si no coinciden, el pipeline (spec W-110) aborta la fuente sin escribir una sola fila.
--
-- Esto NO hace visible la cartelera mexicana: que un país tenga filas en external_events y
-- que un visitante pueda verlas son cosas distintas. Lo segundo exige que 'MX' entre a
-- PAISES en sonopolisWeb/libs/pais.js, que es un spec aparte y posterior (W-109: un país
-- entra al catálogo cuando YA tiene cartelera).
--
-- `on conflict do nothing` por si alguien cargó la fila a mano probando el adaptador: la
-- migración no debe fallar ni pisar lo que haya.

insert into public.event_sources (slug, nombre, home_url, pais) values
  ('donboleton', 'Don Boletón', 'https://www.donboleton.com', 'MX')
on conflict (slug) do nothing;
