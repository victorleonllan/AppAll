-- Spec W-062 (sonopolisWeb) — un local, varias direcciones, una sola activa.
--
-- Archivo retroactivo (2026-09-01): esto se aplicó en producción el 2026-08-29 vía
-- `supabase db query --linked`, sin dejar migración — pendiente #20 de
-- `sonopolisWeb/specs/W-PENDIENTES.md` (mismo patrón de deuda que W-010/W-048/W-058).
-- Reproduce EXACTAMENTE lo que ya corre en producción (ver el bloque "Estado" al final
-- de `sonopolisWeb/specs/w062-datos-direcciones-multiples-local.md`), con guardas
-- IF NOT EXISTS / DROP-then-CREATE para que correrlo sobre una base que ya tiene todo
-- esto sea un no-op seguro, no un error.

create table if not exists public.venue_addresses (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  address text not null,
  comuna text,
  ciudad text,
  lat numeric,
  lng numeric,
  activa boolean not null default false,
  created_at timestamptz not null default now()
);

-- "Solo una activa" garantizado por Postgres, no por la UI.
create unique index if not exists venue_addresses_una_activa
  on public.venue_addresses (venue_id)
  where activa;

-- Cambiar la activa son dos updates, no uno — RPC para que no sea una carrera entre
-- pestañas (la red puede cortarse entre medio y dejar cero direcciones activas).
create or replace function public.activar_direccion_venue(p_direccion_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_venue_id uuid;
begin
  select venue_id into v_venue_id
    from public.venue_addresses
   where id = p_direccion_id;

  if v_venue_id is null then
    raise exception 'Dirección no encontrada';
  end if;

  update public.venue_addresses
     set activa = false
   where venue_id = v_venue_id
     and activa = true
     and id <> p_direccion_id;

  update public.venue_addresses
     set activa = true
   where id = p_direccion_id;
end;
$$;

-- Tope de 3 direcciones por local, puesto en la base (no solo en la UI).
create or replace function public.limitar_direcciones_venue()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.venue_addresses where venue_id = new.venue_id) >= 3 then
    raise exception 'Un local puede tener como máximo 3 direcciones';
  end if;
  return new;
end;
$$;

drop trigger if exists venue_addresses_limite on public.venue_addresses;
create trigger venue_addresses_limite
  before insert on public.venue_addresses
  for each row execute function public.limitar_direcciones_venue();

-- `venues.address/comuna/ciudad/lat/lng` siguen existiendo como caché de la activa —
-- 15 archivos del frontend (Cartelera, Mapa, /locales, ficha pública) leen esas columnas
-- directo, sin pasar por venue_addresses. Este trigger las mantiene sincronizadas.
create or replace function public.sync_venue_address_activa()
returns trigger
language plpgsql
as $$
begin
  if new.activa then
    update public.venues
       set address = new.address,
           comuna = new.comuna,
           ciudad = new.ciudad,
           lat = new.lat,
           lng = new.lng,
           updated_at = now()
     where id = new.venue_id;
  end if;
  return new;
end;
$$;

drop trigger if exists venue_addresses_sync_activa on public.venue_addresses;
create trigger venue_addresses_sync_activa
  after insert or update of activa, address, comuna, ciudad, lat, lng
  on public.venue_addresses
  for each row execute function public.sync_venue_address_activa();

-- RLS: mismo dueño que `venues`, sin reimplementar el permiso. Lectura pública (mismo
-- criterio que venues_select); escritura solo si el venue_id referenciado es del dueño
-- que llama.
alter table public.venue_addresses enable row level security;

drop policy if exists venue_addresses_select on public.venue_addresses;
create policy venue_addresses_select on public.venue_addresses
  for select using (true);

drop policy if exists venue_addresses_insert on public.venue_addresses;
create policy venue_addresses_insert on public.venue_addresses
  for insert with check (
    exists (select 1 from public.venues v
             where v.id = venue_addresses.venue_id
               and v.owner_id = auth.uid())
  );

drop policy if exists venue_addresses_update on public.venue_addresses;
create policy venue_addresses_update on public.venue_addresses
  for update using (
    exists (select 1 from public.venues v
             where v.id = venue_addresses.venue_id
               and v.owner_id = auth.uid())
  );

drop policy if exists venue_addresses_delete on public.venue_addresses;
create policy venue_addresses_delete on public.venue_addresses
  for delete using (
    exists (select 1 from public.venues v
             where v.id = venue_addresses.venue_id
               and v.owner_id = auth.uid())
  );

-- Backfill — cada local existente arranca con su dirección actual, ya activa. Guarda
-- `where not exists`: ya corrió en producción el 29-ago (confirmado 2026-09-01 vía REST
-- con service_role, los 4 venues tienen su fila), así que sobre una base ya migrada esto
-- no inserta nada; solo importa para un ambiente que reconstruya desde cero.
insert into public.venue_addresses (venue_id, address, comuna, ciudad, lat, lng, activa)
select v.id, v.address, v.comuna, v.ciudad, v.lat, v.lng, true
from public.venues v
where v.address is not null
  and not exists (
    select 1 from public.venue_addresses va where va.venue_id = v.id
  );
