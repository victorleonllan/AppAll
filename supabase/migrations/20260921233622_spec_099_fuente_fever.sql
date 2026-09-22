-- Spec 099 — La fuente `fever` en `event_sources`.
--
-- Tercera fuente mexicana y primera que no es una ticketera local, sino una plataforma global
-- de experiencias. 'MX' debe coincidir letra por letra con la constante `pais` de
-- sonopolisWeb/libs/scraping/fuentes/fever.js.
--
-- Esta fila es el catálogo MEXICANO de Fever: la plataforma opera en decenas de países, y
-- scrapear otro sería otra fila con otro slug, porque el pipeline (spec W-110) valida un solo
-- país por fuente y no hay forma de declarar dos.

insert into public.event_sources (slug, nombre, home_url, pais) values
  ('fever', 'Fever', 'https://feverup.com', 'MX')
on conflict (slug) do nothing;
