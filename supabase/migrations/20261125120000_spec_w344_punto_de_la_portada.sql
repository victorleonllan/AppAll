-- Spec W-344 — punto de la portada del músico y del local (datos).
-- Ver sonopolisWeb/specs/w344-datos-punto-de-la-portada.md
--
-- Se guarda el punto de la foto que debe quedar a la vista (object-position: x% y%), no un
-- recorte: la foto original no cambia y el mismo punto sirve para la franja de escritorio
-- y la del celular. 50, 50 es el centro = lo que se ve hoy, así que ninguna fila cambia de
-- aspecto con esta migración. Mismo nombre en las dos tablas para que la web use un solo
-- helper.
--
-- Permisos: no hay policy nueva. profiles ya deja a cada uno actualizar su fila y
-- venues_update exige auth.uid() = owner_id. guard_sonopolis_pro (W-048) solo mira
-- sonopolis_pro_hasta, así que no rechaza un UPDATE que toque solo estas columnas.

-- 1. Columnas -------------------------------------------------------------------------
alter table public.profiles
  add column if not exists portada_x smallint not null default 50 check (portada_x between 0 and 100),
  add column if not exists portada_y smallint not null default 50 check (portada_y between 0 and 100);

alter table public.venues
  add column if not exists portada_x smallint not null default 50 check (portada_x between 0 and 100),
  add column if not exists portada_y smallint not null default 50 check (portada_y between 0 and 100);

-- 2. Al cambiar la foto, el punto vuelve al centro -----------------------------------
-- El punto de la foto vieja no tiene sentido en la nueva. Si el mismo UPDATE trae un punto
-- distinto al guardado, se respeta: la web puede cambiar foto y punto de una vez.
-- security invoker + search_path fijo, igual que guard_sonopolis_pro (W-048): el trigger
-- no consulta otras tablas.
create or replace function public.profiles_reset_portada() returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.foto is distinct from old.foto
     and new.portada_x = old.portada_x and new.portada_y = old.portada_y then
    new.portada_x := 50;
    new.portada_y := 50;
  end if;
  return new;
end $$;

create or replace function public.venues_reset_portada() returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.image is distinct from old.image
     and new.portada_x = old.portada_x and new.portada_y = old.portada_y then
    new.portada_x := 50;
    new.portada_y := 50;
  end if;
  return new;
end $$;

drop trigger if exists profiles_reset_portada_trg on public.profiles;
create trigger profiles_reset_portada_trg
  before update on public.profiles
  for each row execute function public.profiles_reset_portada();

drop trigger if exists venues_reset_portada_trg on public.venues;
create trigger venues_reset_portada_trg
  before update on public.venues
  for each row execute function public.venues_reset_portada();
