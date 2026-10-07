-- Spec W-230 — invitar al dueño real de un local por correo.
-- Ver sonopolisWeb/specs/w230-datos-invitar-dueno-de-local.md
--
-- Caso que lo origina: «Estudio Plectrum» quedó a nombre de la cuenta de la banda
-- Cadência do Sul porque venues_insert exige owner_id = auth.uid() a quien crea el
-- local desde el formulario de evento. El admin invita un correo; cuando esa persona
-- entra con el correo CONFIRMADO, el local pasa a su cuenta.
--
-- Mismo patrón que event_collaborator_invites (specs 052 y 076), con una diferencia
-- a propósito: acá se exige email_confirmed_at. El 052 reclama en el INSERT de
-- auth.users, que con registro por contraseña ocurre antes de confirmar el correo.

-- 1. Tabla ----------------------------------------------------------------------------
create table if not exists public.venue_owner_invites (
  id                uuid        primary key default gen_random_uuid(),
  venue_id          uuid        not null references public.venues(id) on delete cascade,
  email             text        not null check (email = lower(email)),
  token             uuid        not null unique default gen_random_uuid(),
  status            text        not null default 'pending'
                                check (status in ('pending', 'accepted', 'revoked')),
  invited_by        uuid        not null references auth.users(id),
  created_at        timestamptz not null default now(),
  sent_at           timestamptz,
  accepted_at       timestamptz,
  accepted_by       uuid        references auth.users(id),
  previous_owner_id uuid
);

-- Una invitación viva por local: invitar otro correo revoca la anterior.
create unique index if not exists venue_owner_invites_one_pending
  on public.venue_owner_invites (venue_id) where status = 'pending';
create index if not exists venue_owner_invites_email_idx
  on public.venue_owner_invites (email) where status = 'pending';

-- Sin policies: solo se lee y escribe por las funciones de abajo.
alter table public.venue_owner_invites enable row level security;

-- Búsqueda sin acentos ni mayúsculas. No hay extensión unaccent en la base.
create or replace function public._sin_acentos(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(lower(coalesce(p, '')), 'áéíóúüñàèìòùâêîôûäëïö', 'aeiouunaeiouaeiouaeio');
$$;

-- 2. admin_buscar_locales ------------------------------------------------------------
create or replace function public.admin_buscar_locales(p_q text default null)
returns table (
  venue_id          uuid,
  name              text,
  type              text,
  pais              text,
  address           text,
  comuna            text,
  ciudad            text,
  image             text,
  owner_id          uuid,
  owner_nombre      text,
  owner_role        text,
  owner_email       text,
  invite_email      text,
  invite_token      uuid,
  invite_created_at timestamptz,
  invite_sent_at    timestamptz,
  eventos           int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := nullif(public._sin_acentos(trim(coalesce(p_q, ''))), '');
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede buscar locales';
  end if;

  return query
    select v.id,
           v.name,
           v.type,
           v.pais::text,
           coalesce(da.address, v.address),
           coalesce(da.comuna, v.comuna),
           coalesce(da.ciudad, v.ciudad),
           v.image,
           v.owner_id,
           p.nombre,
           p.role,
           u.email::text,
           i.email,
           i.token,
           i.created_at,
           i.sent_at,
           (select count(*)::int from public.events e where e.venue_id = v.id)
      from public.venues v
      left join lateral (
        select a.address, a.comuna, a.ciudad
          from public.venue_addresses a
         where a.venue_id = v.id and a.activa
         order by a.created_at desc
         limit 1
      ) da on true
      left join public.profiles p on p.id = v.owner_id
      left join auth.users u on u.id = v.owner_id
      left join public.venue_owner_invites i on i.venue_id = v.id and i.status = 'pending'
     where v_q is null
        or public._sin_acentos(v.name) like '%' || v_q || '%'
        or public._sin_acentos(v.address) like '%' || v_q || '%'
        or public._sin_acentos(v.comuna) like '%' || v_q || '%'
        or public._sin_acentos(v.ciudad) like '%' || v_q || '%'
        or exists (
          select 1 from public.venue_addresses a
           where a.venue_id = v.id
             and (public._sin_acentos(a.address) like '%' || v_q || '%'
               or public._sin_acentos(a.comuna)  like '%' || v_q || '%'
               or public._sin_acentos(a.ciudad)  like '%' || v_q || '%')
        )
     order by v.name
     limit 50;
end;
$$;

-- 3. admin_invitar_dueno_local -------------------------------------------------------
create or replace function public.admin_invitar_dueno_local(p_venue_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email     text := lower(trim(coalesce(p_email, '')));
  v_venue     public.venues%rowtype;
  v_cuenta    uuid;
  v_rol       text;
  v_otro      text;
  v_pendiente public.venue_owner_invites%rowtype;
  v_token     uuid;
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede invitar dueños de local';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'correo inválido';
  end if;

  select * into v_venue from public.venues where id = p_venue_id;
  if not found then
    raise exception 'no existe ese local';
  end if;

  select u.id, p.role into v_cuenta, v_rol
    from auth.users u left join public.profiles p on p.id = u.id
   where lower(u.email) = v_email
   limit 1;

  if v_cuenta is not null then
    if v_rol = 'musician' then
      raise exception 'ese correo es de una cuenta de músico; usa otro correo';
    end if;
    if v_venue.owner_id = v_cuenta then
      raise exception 'ese correo ya es el dueño de este local';
    end if;
    select name into v_otro from public.venues
     where owner_id = v_cuenta and id <> p_venue_id limit 1;
    if v_otro is not null then
      raise exception 'esa cuenta ya administra %', v_otro;
    end if;
  end if;

  select * into v_pendiente from public.venue_owner_invites
   where venue_id = p_venue_id and status = 'pending';
  if found then
    if v_pendiente.email = v_email then
      return v_pendiente.token;  -- reenviar = volver a llamar
    end if;
    update public.venue_owner_invites set status = 'revoked' where id = v_pendiente.id;
  end if;

  insert into public.venue_owner_invites (venue_id, email, invited_by)
  values (p_venue_id, v_email, auth.uid())
  returning token into v_token;
  return v_token;
end;
$$;

-- 4. Marcar enviada / revocar ----------------------------------------------------------
create or replace function public.admin_marcar_invitacion_enviada(p_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede marcar invitaciones';
  end if;
  update public.venue_owner_invites set sent_at = now()
   where token = p_token and status = 'pending';
end;
$$;

create or replace function public.admin_revocar_invitacion_local(p_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede cancelar invitaciones';
  end if;
  update public.venue_owner_invites set status = 'revoked'
   where token = p_token and status = 'pending';
end;
$$;

-- 5. invitacion_local_publica: lo que ve /invitacion/<token> -------------------------
create or replace function public.invitacion_local_publica(p_token uuid)
returns table (
  venue_name text,
  venue_type text,
  address    text,
  comuna     text,
  image      text,
  pais       text,
  email      text,
  status     text
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.name,
         v.type,
         coalesce(da.address, v.address),
         coalesce(da.comuna, v.comuna),
         v.image,
         v.pais::text,
         i.email,
         i.status
    from public.venue_owner_invites i
    join public.venues v on v.id = i.venue_id
    left join lateral (
      select a.address, a.comuna
        from public.venue_addresses a
       where a.venue_id = v.id and a.activa
       order by a.created_at desc
       limit 1
    ) da on true
   where i.token = p_token;
$$;

-- 6. El reclamo (interna) -------------------------------------------------------------
-- Devuelve el motivo si no aplica, o null si aplicó. NUNCA lanza: corre dentro de un
-- trigger de auth.users, y una excepción ahí rechaza el login entero (spec 106).
create or replace function public._aplicar_invitacion_local(p_invite_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv   public.venue_owner_invites%rowtype;
  v_rol   text;
  v_otro  text;
  v_antes uuid;
begin
  select * into v_inv from public.venue_owner_invites
   where id = p_invite_id and status = 'pending'
   for update;
  if not found then
    return 'esta invitación ya no está vigente';
  end if;

  select role into v_rol from public.profiles where id = p_user_id;
  if v_rol = 'musician' then
    return 'esta cuenta es de músico; entra con una cuenta de local';
  end if;
  select name into v_otro from public.venues
   where owner_id = p_user_id and id <> v_inv.venue_id limit 1;
  if v_otro is not null then
    return 'esta cuenta ya administra ' || v_otro;
  end if;

  -- Las dos fuentes de rol: profiles (datos) y user_metadata (navegación).
  if v_rol is distinct from 'local' then
    update public.profiles set role = 'local' where id = p_user_id;
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"local"}'::jsonb
     where id = p_user_id;
  end if;

  select owner_id into v_antes from public.venues where id = v_inv.venue_id for update;
  update public.venues set owner_id = p_user_id where id = v_inv.venue_id;

  -- Lo que events_claim_owner habría hecho si el local hubiera tenido este dueño.
  insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
  select e.id, p_user_id, 'admin', false, 'venue_owner'
    from public.events e
   where e.venue_id = v_inv.venue_id and e.created_by is distinct from p_user_id
  on conflict (event_id, user_id) do nothing;

  -- El dueño anterior pierde solo lo que tenía por ser dueño del local.
  if v_antes is not null and v_antes <> p_user_id then
    delete from public.event_collaborators ec
     using public.events e
     where e.id = ec.event_id
       and e.venue_id = v_inv.venue_id
       and ec.user_id = v_antes
       and ec.source = 'venue_owner';
  end if;

  update public.venue_owner_invites
     set status = 'accepted', accepted_at = now(), accepted_by = p_user_id,
         previous_owner_id = v_antes
   where id = v_inv.id;
  return null;
exception when others then
  -- Cualquier fallo inesperado no puede tumbar el login: se informa y no se aplica.
  return 'no se pudo aplicar la invitación: ' || sqlerrm;
end;
$$;

revoke all on function public._aplicar_invitacion_local(uuid, uuid) from public, anon, authenticated;

-- 7a. Trigger en auth.users -----------------------------------------------------------
create or replace function public.claim_venue_owner_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.venue_owner_invites
     where status = 'pending' and email = lower(new.email)
  loop
    perform public._aplicar_invitacion_local(v_id, new.id);
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists claim_venue_owner_invites_insert_trg on auth.users;
create trigger claim_venue_owner_invites_insert_trg
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.claim_venue_owner_invites();

drop trigger if exists claim_venue_owner_invites_update_trg on auth.users;
create trigger claim_venue_owner_invites_update_trg
  after update of email_confirmed_at, last_sign_in_at on auth.users
  for each row
  when (new.email_confirmed_at is not null
        and (new.email_confirmed_at is distinct from old.email_confirmed_at
             or new.last_sign_in_at is distinct from old.last_sign_in_at))
  execute function public.claim_venue_owner_invites();

-- 7b. Reclamo con la sesión abierta ----------------------------------------------------
create or replace function public.reclamar_invitacion_local(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv        public.venue_owner_invites%rowtype;
  v_email      text;
  v_confirmado timestamptz;
  v_motivo     text;
begin
  if auth.uid() is null then
    raise exception 'necesitas entrar para activar el local';
  end if;
  select * into v_inv from public.venue_owner_invites where token = p_token;
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

  v_motivo := public._aplicar_invitacion_local(v_inv.id, auth.uid());
  if v_motivo is not null then
    raise exception '%', v_motivo;
  end if;
  return true;
end;
$$;

-- Permisos ------------------------------------------------------------------------------
revoke all on function public.admin_buscar_locales(text)                 from public, anon;
revoke all on function public.admin_invitar_dueno_local(uuid, text)      from public, anon;
revoke all on function public.admin_marcar_invitacion_enviada(uuid)      from public, anon;
revoke all on function public.admin_revocar_invitacion_local(uuid)       from public, anon;
revoke all on function public.reclamar_invitacion_local(uuid)            from public, anon;
revoke all on function public.claim_venue_owner_invites()                from public, anon, authenticated;
grant execute on function public.admin_buscar_locales(text)              to authenticated;
grant execute on function public.admin_invitar_dueno_local(uuid, text)   to authenticated;
grant execute on function public.admin_marcar_invitacion_enviada(uuid)   to authenticated;
grant execute on function public.admin_revocar_invitacion_local(uuid)    to authenticated;
grant execute on function public.reclamar_invitacion_local(uuid)         to authenticated;
grant execute on function public.invitacion_local_publica(uuid)          to anon, authenticated;
