-- Spec W-307 — cierra tres huecos que dejaron W-300 y W-302, encontrados por la
-- revisión independiente antes de desplegar la web.
-- Ver sonopolisWeb/specs/w307-datos-cierra-permisos-de-fichas-e-invitaciones.md

-- 1. Nadie enlaza una ficha a una cuenta desde el cliente -------------------------------
-- artists_insert solo miraba created_by y artists_update deja al creador cambiar
-- profile_id: un editor de evento creaba una ficha con profile_id = su segunda cuenta,
-- la ponía en el lineup (W-300) y esa cuenta quedaba admin y recibía los compradores
-- (W-301). El reclamo de una ficha va solo por invitación (W-302, security definer) o
-- por el admin. Una ficha nueva puede nacer reclamada solo por su propia cuenta.
drop policy if exists artists_insert on public.artists;
create policy artists_insert on public.artists for insert
  with check (auth.uid() = created_by and (profile_id is null or profile_id = auth.uid()));

create or replace function public.artists_guard_profile_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- current_user es 'authenticated'/'anon' cuando escribe el cliente; dentro de una
  -- función security definer (el reclamo de W-302) es el dueño, y pasa.
  if new.profile_id is distinct from old.profile_id
     and current_user in ('authenticated', 'anon')
     and not public.es_admin_sonopolis() then
    raise exception 'la cuenta de una ficha de banda se enlaza con una invitación';
  end if;
  return new;
end;
$$;

drop trigger if exists artists_guard_profile_id_trg on public.artists;
create trigger artists_guard_profile_id_trg
  before update of profile_id on public.artists
  for each row execute function public.artists_guard_profile_id();

-- 2. El admin por banda adicional lo da solo quien maneja el equipo -------------------
-- can_edit_event acepta editores; agregar una banda ya reclamada no puede ser la forma
-- en que un editor fabrique un admin. Un editor sigue pudiendo agregar la banda; si ya
-- tiene cuenta, el admin se lo da después el owner/admin desde el equipo.
create or replace function public.event_artists_claim_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_team(new.event_id) then
    return new;
  end if;
  insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
  select new.event_id, a.profile_id, 'admin', false, 'artist'
    from public.artists a
   where a.id = new.artist_id and a.profile_id is not null
  on conflict (event_id, user_id) do nothing;
  return new;
end;
$$;

-- Al sacar una banda: se conserva el admin si la misma cuenta sigue como principal O
-- con otra ficha adicional en el evento.
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
              where e.id = old.event_id and a.profile_id = v_profile)
     or exists (select 1 from public.event_artists ea
                  join public.artists a on a.id = ea.artist_id
                 where ea.event_id = old.event_id and ea.artist_id <> old.artist_id
                   and a.profile_id = v_profile) then
    return old;
  end if;
  delete from public.event_collaborators
   where event_id = old.event_id and user_id = v_profile and source = 'artist';
  return old;
end;
$$;

revoke all on function public.artists_guard_profile_id()      from public, anon, authenticated;
revoke all on function public.event_artists_claim_admin()     from public, anon, authenticated;
revoke all on function public.event_artists_release_admin()   from public, anon, authenticated;

-- 3. invitar_a_sonopolis: solo quien creó la ficha; freno de reenvíos ------------------
-- Antes bastaba con editar CUALQUIER evento donde la ficha toca: otro local agregaba la
-- ficha ajena a su evento, se invitaba a sí mismo y se quedaba con la banda (admin de
-- los eventos del primer local y sus compradores). Y reenviar no tenía freno: un POST
-- en loop llenaba de correos a una dirección.
create or replace function public.invitar_a_sonopolis(
  p_email     text,
  p_nombre    text default null,
  p_artist_id uuid default null,
  p_event_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_email     text := lower(btrim(coalesce(p_email, '')));
  v_nombre    text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_rol       text;
  v_artist    public.artists%rowtype;
  v_cuenta    uuid;
  v_rol_cta   text;
  v_hoy       int;
  v_pendiente public.sonopolis_invites%rowtype;
  v_token     uuid;
begin
  if v_uid is null then
    raise exception 'necesitas entrar para invitar';
  end if;
  select role into v_rol from public.profiles where id = v_uid;
  if coalesce(v_rol, '') not in ('local', 'musician') and not public.es_admin_sonopolis() then
    raise exception 'solo locales y músicos pueden invitar a Sonópolis';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'correo inválido';
  end if;

  if p_event_id is not null and not public.can_edit_event(p_event_id) then
    raise exception 'no puedes invitar desde ese evento';
  end if;

  if p_artist_id is not null then
    select * into v_artist from public.artists where id = p_artist_id;
    if not found then
      raise exception 'no existe esa banda';
    end if;
    if v_artist.profile_id is not null then
      raise exception '% ya tiene cuenta en Sonópolis', v_artist.name;
    end if;
    -- Solo quien creó la ficha decide qué correo la reclama.
    if v_artist.created_by is distinct from v_uid and not public.es_admin_sonopolis() then
      raise exception 'solo quien registró a % puede invitarla', v_artist.name;
    end if;
    if p_event_id is not null and not exists (
         select 1 from public.events e
          where e.id = p_event_id
            and (e.artist_id = p_artist_id
                 or exists (select 1 from public.event_artists ea
                             where ea.event_id = e.id and ea.artist_id = p_artist_id))) then
      raise exception '% no toca en ese evento', v_artist.name;
    end if;
    v_nombre := coalesce(v_nombre, v_artist.name);
  end if;

  if v_nombre is null then
    raise exception 'falta el nombre de la banda';
  end if;

  select u.id, p.role into v_cuenta, v_rol_cta
    from auth.users u left join public.profiles p on p.id = u.id
   where lower(u.email) = v_email
   limit 1;
  if v_cuenta is not null then
    if v_cuenta = v_uid then
      raise exception 'no puedes invitarte a ti mismo';
    end if;
    if v_rol_cta = 'local' then
      raise exception 'ese correo es de una cuenta de local; usa el correo de la banda';
    end if;
    if p_artist_id is null then
      raise exception 'ese correo ya tiene cuenta en Sonópolis';
    end if;
  end if;

  if p_artist_id is not null then
    select * into v_pendiente from public.sonopolis_invites
     where artist_id = p_artist_id and status = 'pending';
  else
    select * into v_pendiente from public.sonopolis_invites
     where invited_by = v_uid and email = v_email and artist_id is null and status = 'pending';
  end if;
  if v_pendiente.id is not null and v_pendiente.email = v_email then
    -- Reenviar: el mismo token, pero no más de una vez cada 10 minutos.
    if v_pendiente.sent_at > now() - interval '10 minutes' then
      raise exception 'ya enviamos esta invitación hace menos de 10 minutos';
    end if;
    if p_event_id is not null and v_pendiente.event_id is null then
      update public.sonopolis_invites set event_id = p_event_id where id = v_pendiente.id;
    end if;
    return v_pendiente.token;
  end if;

  select count(*) into v_hoy from public.sonopolis_invites
   where invited_by = v_uid and created_at > now() - interval '1 day';
  if v_hoy >= 30 and not public.es_admin_sonopolis() then
    raise exception 'llegaste al máximo de 30 invitaciones por día';
  end if;

  -- (No se usa FOUND: el count de arriba lo pisa.)
  if v_pendiente.id is not null then
    update public.sonopolis_invites set status = 'revoked' where id = v_pendiente.id;
  end if;

  insert into public.sonopolis_invites (email, nombre, artist_id, event_id, invited_by)
  values (v_email, v_nombre, p_artist_id, p_event_id, v_uid)
  returning token into v_token;
  return v_token;
end;
$$;

revoke all on function public.invitar_a_sonopolis(text, text, uuid, uuid)    from public, anon;
grant execute on function public.invitar_a_sonopolis(text, text, uuid, uuid) to authenticated;
