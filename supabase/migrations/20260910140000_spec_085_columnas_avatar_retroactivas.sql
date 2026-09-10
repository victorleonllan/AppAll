-- Spec 085 — Las columnas avatar que nunca tuvieron migración
--
-- profiles.avatar y venues.avatar existen en producción desde hace meses, creadas a mano.
-- Ninguna migración las declara, así que un entorno reconstruido desde cero sale sin ellas
-- y sonopolisWeb revienta al leerlas (DirectorioMusicos.js: m.foto ?? m.avatar;
-- local/page.js: venue.image ?? venue.avatar).
--
-- Contra producción esto es un no-op deliberado: solo deja registrado lo que ya está.

alter table public.profiles add column if not exists avatar text;
alter table public.venues   add column if not exists avatar text;
