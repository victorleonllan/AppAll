-- Spec 098 — La fuente `startickets` en `event_sources`.
--
-- Segunda fuente mexicana, sobre la vista de Chihuahua. 'MX' debe coincidir letra por letra
-- con la constante `pais` de sonopolisWeb/libs/scraping/fuentes/startickets.js: si no
-- coinciden, el pipeline (spec W-110) aborta la fuente sin escribir una sola fila.
--
-- Primera vez que dos fuentes comparten país Y región (Chihuahua y Cd. Juárez, con
-- donboleton): la deduplicación entre fuentes distintas sigue abierta desde el spec 049 y
-- pasa de teórica a probable. Anotado en sonopolisWeb/specs/W-PENDIENTES.md.
--
-- Como el 097, esto NO hace visible nada: 'MX' no está en PAISES.

insert into public.event_sources (slug, nombre, home_url, pais) values
  ('startickets', 'Startickets', 'https://startickets.com.mx', 'MX')
on conflict (slug) do nothing;
