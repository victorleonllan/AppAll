-- Spec W-302 — invitar a una banda a Sonópolis por correo.
-- Ver sonopolisWeb/specs/w302-datos-invitar-a-sonopolis.md
--
-- Un local (o un músico) invita a una banda por correo, desde un evento o desde
-- su panel. Cuando esa persona entra con el correo CONFIRMADO:
--   - su cuenta queda como músico (profiles.role y user_metadata.role),
--   - reclama la ficha de banda que el local creó al cargar el evento
--     (artists.profile_id), o se le crea una propia si la invitación no traía,
--   - queda admin de los eventos donde esa banda toca (principal o W-300),
--     y con eso los compradores de esos eventos entran a su base (W-301).
--
-- Mismo patrón que venue_owner_invites (W-230): token para la página pública,
-- reclamo por correo confirmado en auth.users, RPC para quien ya tiene sesión.

-- 1. Tabla ----------------------------------------------------------------------------
create table if not exists public.sonopolis_invites (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null check (email = lower(email)),
  nombre      text        not null check (length(btrim(nombre)) between 1 and 120),
  artist_id   uuid        references public.artists(id) on delete set null,
  event_id    uuid        references public.events(id)  on delete set null,
  token       uuid        not null unique default gen_random_uuid(),
  status      text        not null default 'pending'
                          check (status in ('pending', 'accepted', 'revoked')),
  invited_by  uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  accepted_at timestamptz,
  accepted_by uuid        references auth.users(id)
);

-- Una invitación viva por ficha de banda: invitar otro correo revoca la anterior.
create unique index if not exists sonopolis_invites_one_pending_artist
  on public.sonopolis_invites (artist_id) where status = 'pending' and artist_id is not null;
-- Sin ficha: una viva por (quién invita, correo).
create unique index if not exists sonopolis_invites_one_pending_email
  on public.sonopolis_invites (invited_by, email) where status = 'pending' and artist_id is null;
create index if not exists sonopolis_invites_email_idx
  on public.sonopolis_invites (email) where status = 'pending';
create index if not exists sonopolis_invites_invited_by_idx
  on public.sonopolis_invites (invited_by, created_at desc);

alter table public.sonopolis_invites enable row level security;

-- Quien invita ve sus invitaciones (lista del panel). Escribir: solo por RPC.
drop policy if exists sonopolis_invites_select_own on public.sonopolis_invites;
create policy sonopolis_invites_select_own on public.sonopolis_invites for select
  using (invited_by = auth.uid());

grant select on public.sonopolis_invites to authenticated;

-- 2. invitar_a_sonopolis ---------------------------------------------------------------
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
  if v_rol not in ('local', 'musician') and not public.es_admin_sonopolis() then
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
    -- Quién puede invitar a una ficha: quien la creó, o quien edita un evento
    -- donde esa banda toca (el que viene en p_event_id).
    if not (v_artist.created_by = v_uid
            or public.es_admin_sonopolis()
            or (p_event_id is not null and exists (
                  select 1 from public.events e
                   where e.id = p_event_id
                     and (e.artist_id = p_artist_id
                          or exists (select 1 from public.event_artists ea
                                      where ea.event_id = e.id and ea.artist_id = p_artist_id))))) then
      raise exception 'no puedes invitar a esa banda';
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

  -- Reenviar la misma invitación devuelve el mismo token y no cuenta.
  if p_artist_id is not null then
    select * into v_pendiente from public.sonopolis_invites
     where artist_id = p_artist_id and status = 'pending';
  else
    select * into v_pendiente from public.sonopolis_invites
     where invited_by = v_uid and email = v_email and artist_id is null and status = 'pending';
  end if;
  if v_pendiente.id is not null and v_pendiente.email = v_email then
    if p_event_id is not null and v_pendiente.event_id is null then
      update public.sonopolis_invites set event_id = p_event_id where id = v_pendiente.id;
    end if;
    return v_pendiente.token;
  end if;

  -- Freno contra usar Sonópolis para mandar correos a cualquiera.
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

-- 3. Marcar enviada / revocar (solo quien invitó) --------------------------------------
create or replace function public.marcar_invitacion_sonopolis_enviada(p_token uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sonopolis_invites set sent_at = now()
   where token = p_token and status = 'pending' and invited_by = auth.uid();
$$;

create or replace function public.revocar_invitacion_sonopolis(p_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sonopolis_invites set status = 'revoked'
   where token = p_token and status = 'pending'
     and (invited_by = auth.uid() or public.es_admin_sonopolis());
  if not found then
    raise exception 'esa invitación no está pendiente o no es tuya';
  end if;
end;
$$;

-- 4. invitacion_sonopolis_publica: lo que ve /unete/<token> ---------------------------
create or replace function public.invitacion_sonopolis_publica(p_token uuid)
returns table (
  nombre        text,
  email         text,
  status        text,
  invitado_por  text,
  artist_image  text,
  event_id      uuid,
  evento_titulo text,
  evento_local  text,
  evento_inicio timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.nombre,
         i.email,
         i.status,
         coalesce((select v.name from public.venues v where v.owner_id = i.invited_by
                    order by v.created_at limit 1),
                  nullif(p.nombre, ''),
                  'Sonópolis'),
         a.image,
         e.id,
         e.artist_name,
         e.venue_name,
         e.comienza_at
    from public.sonopolis_invites i
    left join public.profiles p on p.id = i.invited_by
    left join public.artists  a on a.id = i.artist_id
    left join public.events   e on e.id = i.event_id and e.status <> 'draft'
   where i.token = p_token;
$$;

-- 5. El reclamo (interna). Devuelve el motivo si no aplica, null si aplicó. NUNCA
-- lanza: corre dentro de un trigger de auth.users (ver W-230).
create or replace function public._aplicar_invitacion_sonopolis(p_invite_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv     public.sonopolis_invites%rowtype;
  v_rol     text;
  v_nombre  text;
  v_artist  uuid;
begin
  select * into v_inv from public.sonopolis_invites
   where id = p_invite_id and status = 'pending'
   for update;
  if not found then
    return 'esta invitación ya no está vigente';
  end if;

  -- En el INSERT de auth.users este trigger corre ANTES que handle_new_user
  -- (on_auth_user_created): los triggers AFTER del mismo evento van en orden
  -- alfabético. Sin perfil todavía, se crea aquí como músico, con el país de la
  -- metadata si es válido; handle_new_user después hace ON CONFLICT DO NOTHING.
  if not exists (select 1 from public.profiles where id = p_user_id) then
    insert into public.profiles (id, role, nombre, pais)
    select p_user_id, 'musician',
           coalesce(nullif(u.raw_user_meta_data->>'nombre', ''), v_inv.nombre),
           coalesce((select pc.pais from public.paises_cobro pc
                      where pc.pais = u.raw_user_meta_data->>'pais'), 'CL')
      from auth.users u where u.id = p_user_id
    on conflict (id) do nothing;
  end if;

  select role, nombre into v_rol, v_nombre from public.profiles where id = p_user_id;
  if v_rol = 'local' then
    return 'esta cuenta es de un local; entra con el correo de la banda';
  end if;

  -- Las dos fuentes de rol: profiles (datos) y user_metadata (navegación).
  -- Cada una por separado: el perfil recién creado arriba ya es músico, pero su
  -- metadata (la que lee la web para navegar) todavía no.
  if v_rol is distinct from 'musician' then
    update public.profiles set role = 'musician' where id = p_user_id;
  end if;
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"musician"}'::jsonb
   where id = p_user_id and raw_user_meta_data->>'role' is distinct from 'musician';
  if coalesce(btrim(v_nombre), '') = '' then
    update public.profiles set nombre = v_inv.nombre where id = p_user_id;
  end if;

  -- La ficha de banda: la que trae la invitación si sigue libre; si no, la que la
  -- cuenta ya tenga; si no, una nueva. Así la banda aparece en el buscador de
  -- artistas del formulario de evento y los próximos eventos se le enlazan.
  if v_inv.artist_id is not null then
    update public.artists set profile_id = p_user_id
     where id = v_inv.artist_id and profile_id is null
    returning id into v_artist;
  end if;
  if v_artist is null then
    select id into v_artist from public.artists where profile_id = p_user_id
     order by created_at limit 1;
  end if;
  if v_artist is null then
    insert into public.artists (name, created_by, profile_id)
    values (v_inv.nombre, p_user_id, p_user_id)
    returning id into v_artist;
  end if;

  -- Admin de cada evento donde toca alguna ficha suya (principal o adicional),
  -- como lo habría hecho events_claim_owner si la ficha ya hubiera estado reclamada.
  insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
  select e.id, p_user_id, 'admin', false, 'artist'
    from public.events e
   where e.created_by is distinct from p_user_id
     and (e.artist_id in (select id from public.artists where profile_id = p_user_id)
          or exists (select 1 from public.event_artists ea
                       join public.artists a on a.id = ea.artist_id
                      where ea.event_id = e.id and a.profile_id = p_user_id))
  on conflict (event_id, user_id) do nothing;

  update public.sonopolis_invites
     set status = 'accepted', accepted_at = now(), accepted_by = p_user_id
   where id = v_inv.id;
  return null;
exception when others then
  return 'no se pudo aplicar la invitación: ' || sqlerrm;
end;
$$;

revoke all on function public._aplicar_invitacion_sonopolis(uuid, uuid) from public, anon, authenticated;

-- 6a. Trigger en auth.users (correo confirmado) ----------------------------------------
create or replace function public.claim_sonopolis_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.sonopolis_invites
     where status = 'pending' and email = lower(new.email)
     order by created_at
  loop
    perform public._aplicar_invitacion_sonopolis(v_id, new.id);
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists claim_sonopolis_invites_insert_trg on auth.users;
create trigger claim_sonopolis_invites_insert_trg
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.claim_sonopolis_invites();

drop trigger if exists claim_sonopolis_invites_update_trg on auth.users;
create trigger claim_sonopolis_invites_update_trg
  after update of email_confirmed_at, last_sign_in_at on auth.users
  for each row
  when (new.email_confirmed_at is not null
        and (new.email_confirmed_at is distinct from old.email_confirmed_at
             or new.last_sign_in_at is distinct from old.last_sign_in_at))
  execute function public.claim_sonopolis_invites();

-- 6b. Reclamo con la sesión abierta ----------------------------------------------------
create or replace function public.reclamar_invitacion_sonopolis(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv        public.sonopolis_invites%rowtype;
  v_email      text;
  v_confirmado timestamptz;
  v_motivo     text;
begin
  if auth.uid() is null then
    raise exception 'necesitas entrar para aceptar la invitación';
  end if;
  select * into v_inv from public.sonopolis_invites where token = p_token;
  if not found then
    raise exception 'no existe esa invitación';
  end if;
  if v_inv.status = 'accepted' and v_inv.accepted_by = auth.uid() then
    return true;
  end if;

  select lower(email), email_confirmed_at into v_email, v_confirmado
    from auth.users where id = auth.uid();
  if v_email is distinct from v_inv.email or v_confirmado is null then
    raise exception 'esta invitación es para %', v_inv.email;
  end if;

  v_motivo := public._aplicar_invitacion_sonopolis(v_inv.id, auth.uid());
  if v_motivo is not null then
    raise exception '%', v_motivo;
  end if;
  return true;
end;
$$;

-- Permisos ------------------------------------------------------------------------------
revoke all on function public.invitar_a_sonopolis(text, text, uuid, uuid)      from public, anon;
revoke all on function public.marcar_invitacion_sonopolis_enviada(uuid)        from public, anon;
revoke all on function public.revocar_invitacion_sonopolis(uuid)               from public, anon;
revoke all on function public.reclamar_invitacion_sonopolis(uuid)              from public, anon;
revoke all on function public.claim_sonopolis_invites()                        from public, anon, authenticated;
grant execute on function public.invitar_a_sonopolis(text, text, uuid, uuid)   to authenticated;
grant execute on function public.marcar_invitacion_sonopolis_enviada(uuid)     to authenticated;
grant execute on function public.revocar_invitacion_sonopolis(uuid)            to authenticated;
grant execute on function public.reclamar_invitacion_sonopolis(uuid)           to authenticated;
grant execute on function public.invitacion_sonopolis_publica(uuid)            to anon, authenticated;
