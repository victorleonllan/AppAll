-- Spec W-300 — un evento con más de una banda (lineup).
-- Ver sonopolisWeb/specs/w300-datos-bandas-del-evento.md
--
-- events.artist_id sigue siendo la banda PRINCIPAL (la app nativa la lee y la
-- escribe sin cambios). event_artists guarda SOLO las bandas adicionales.

create table if not exists public.event_artists (
  event_id   uuid        not null references public.events(id)  on delete cascade,
  artist_id  uuid        not null references public.artists(id) on delete cascade,
  orden      smallint    not null default 1 check (orden >= 1),
  created_by uuid        references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (event_id, artist_id)
);

create index if not exists event_artists_artist_idx on public.event_artists (artist_id);

alter table public.event_artists enable row level security;

-- Se ve la fila si se ve el evento (events_select oculta borradores ajenos).
drop policy if exists event_artists_select on public.event_artists;
create policy event_artists_select on public.event_artists for select
  using (exists (select 1 from public.events e where e.id = event_id));

drop policy if exists event_artists_insert on public.event_artists;
create policy event_artists_insert on public.event_artists for insert
  with check (public.can_edit_event(event_id));

drop policy if exists event_artists_update on public.event_artists;
create policy event_artists_update on public.event_artists for update
  using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

drop policy if exists event_artists_delete on public.event_artists;
create policy event_artists_delete on public.event_artists for delete
  using (public.can_edit_event(event_id));

-- La banda principal no se repite como adicional.
create or replace function public.event_artists_guard_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.events e
              where e.id = new.event_id and e.artist_id = new.artist_id) then
    raise exception 'esa banda ya es la principal del evento';
  end if;
  return new;
end;
$$;

drop trigger if exists event_artists_guard_principal_trg on public.event_artists;
create trigger event_artists_guard_principal_trg
  before insert or update of artist_id on public.event_artists
  for each row execute function public.event_artists_guard_principal();

-- Igual que events_claim_owner con la principal: si la banda adicional ya fue
-- reclamada (artists.profile_id), su cuenta queda admin del evento.
create or replace function public.event_artists_claim_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
  select new.event_id, a.profile_id, 'admin', false, 'artist'
    from public.artists a
   where a.id = new.artist_id and a.profile_id is not null
  on conflict (event_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists event_artists_claim_admin_trg on public.event_artists;
create trigger event_artists_claim_admin_trg
  after insert on public.event_artists
  for each row execute function public.event_artists_claim_admin();

-- Al sacar una banda adicional, su cuenta pierde solo lo que tenía por ser banda
-- de este evento (source = 'artist'), salvo que también sea la principal.
create or replace function public.event_artists_release_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  select profile_id into v_profile from public.artists where id = old.artist_id;
  if v_profile is null then
    return old;
  end if;
  if exists (select 1 from public.events e
               join public.artists a on a.id = e.artist_id
              where e.id = old.event_id and a.profile_id = v_profile) then
    return old;
  end if;
  delete from public.event_collaborators
   where event_id = old.event_id and user_id = v_profile and source = 'artist';
  return old;
end;
$$;

drop trigger if exists event_artists_release_admin_trg on public.event_artists;
create trigger event_artists_release_admin_trg
  after delete on public.event_artists
  for each row execute function public.event_artists_release_admin();

revoke all on function public.event_artists_guard_principal() from public, anon, authenticated;
revoke all on function public.event_artists_claim_admin()     from public, anon, authenticated;
revoke all on function public.event_artists_release_admin()   from public, anon, authenticated;

grant select on public.event_artists to anon, authenticated;
grant insert, update, delete on public.event_artists to authenticated;
