-- Spec W-347 — la cuenta de músico es la banda del evento (datos).
-- Ver sonopolisWeb/specs/w347-datos-cuenta-de-musico-es-la-banda.md
--
-- Un evento apunta a la CUENTA del músico (events.musico_id / event_artists.musico_id)
-- cuando la banda está en Sonópolis, y a una ficha (artist_id) solo cuando la banda no
-- tiene cuenta. Al conectar o reclamar una ficha, sus eventos pasan a la cuenta y la
-- ficha desaparece.
--
-- Es ADITIVO: no borra columnas. La app móvil sigue leyendo y escribiendo
-- events.artist_id; lo que escriba se normaliza (apartado 3).

-- 1. Columnas -------------------------------------------------------------------------

-- 1a. events.musico_id: la banda principal, cuando es una cuenta.
alter table public.events
  add column if not exists musico_id uuid references public.profiles(id) on delete set null;

create index if not exists events_musico_idx on public.events (musico_id) where musico_id is not null;

alter table public.events
  add constraint events_una_banda_principal check (artist_id is null or musico_id is null);

-- 1b. event_artists: una fila adicional es una ficha O una cuenta (nunca las dos).
-- Antes de cambiar la PK se buscó en las funciones vivas (pg_proc.prosrc) cualquier
-- `on conflict (event_id, artist_id)`: no hay ninguna.
alter table public.event_artists
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.event_artists drop constraint event_artists_pkey;
alter table public.event_artists add constraint event_artists_pkey primary key (id);

alter table public.event_artists alter column artist_id drop not null;

alter table public.event_artists
  add column if not exists musico_id uuid references public.profiles(id) on delete cascade;

alter table public.event_artists
  add constraint event_artists_ficha_o_cuenta check (num_nonnulls(artist_id, musico_id) = 1);

create unique index if not exists event_artists_evento_ficha_uq
  on public.event_artists (event_id, artist_id) where artist_id is not null;
create unique index if not exists event_artists_evento_musico_uq
  on public.event_artists (event_id, musico_id) where musico_id is not null;
create index if not exists event_artists_musico_idx
  on public.event_artists (musico_id) where musico_id is not null;

-- 2. La cuenta debe ser de músico --------------------------------------------------------
-- Una sola función para las dos tablas. Sin lista de columnas más corta que
-- (musico_id, artist_id): la normalización del apartado 3 puede poner musico_id en un
-- UPDATE que solo menciona artist_id, y ahí también hay que revisar el rol.
create or replace function public.musico_id_debe_ser_de_musico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.musico_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.musico_id is not distinct from old.musico_id then
    return new;
  end if;
  if not exists (select 1 from public.profiles p where p.id = new.musico_id and p.role = 'musician') then
    raise exception 'esa cuenta no es de músico';
  end if;
  return new;
end;
$$;

-- Los triggers BEFORE de una tabla corren en orden alfabético: el prefijo 1_ (normalizar)
-- va antes que 2_ (revisar el rol) y que los demás (event_artists_guard_principal_trg,
-- events_guard_*).
drop trigger if exists events_2_cuenta_de_musico_trg on public.events;
create trigger events_2_cuenta_de_musico_trg
  before insert or update of musico_id, artist_id on public.events
  for each row execute function public.musico_id_debe_ser_de_musico();

drop trigger if exists event_artists_2_cuenta_de_musico_trg on public.event_artists;
create trigger event_artists_2_cuenta_de_musico_trg
  before insert or update of musico_id, artist_id on public.event_artists
  for each row execute function public.musico_id_debe_ser_de_musico();

revoke all on function public.musico_id_debe_ser_de_musico() from public, anon, authenticated;

-- 3. Normalización: ningún evento apunta a una ficha con cuenta ------------------------------
-- Si new.artist_id es una ficha con profile_id, se escribe la cuenta (musico_id) y artist_id
-- queda nulo. Así lo que escriba la app móvil, que todavía puede crear fichas con cuenta,
-- queda igual que lo que escribe la web.
create or replace function public.events_normalizar_ficha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  if new.artist_id is null then
    return new;
  end if;
  -- La app móvil solo conoce artist_id: si cambia la banda de un evento que ya tenía una
  -- cuenta (musico_id) y no toca musico_id, la banda nueva reemplaza a la cuenta. Sin esto
  -- el check events_una_banda_principal le rompería la edición.
  if tg_op = 'UPDATE'
     and new.musico_id is not distinct from old.musico_id
     and new.artist_id is distinct from old.artist_id then
    new.musico_id := null;
  end if;
  -- Con las dos puestas a la vez, no se decide por quien escribe: el check lanza.
  if new.musico_id is not null then
    return new;
  end if;
  select a.profile_id into v_profile from public.artists a where a.id = new.artist_id;
  if v_profile is not null then
    new.musico_id := v_profile;
    new.artist_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists events_1_normalizar_ficha_trg on public.events;
create trigger events_1_normalizar_ficha_trg
  before insert or update of artist_id on public.events
  for each row execute function public.events_normalizar_ficha();

create or replace function public.event_artists_normalizar_ficha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  if new.artist_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.musico_id is not distinct from old.musico_id
     and new.artist_id is distinct from old.artist_id then
    new.musico_id := null;
  end if;
  if new.musico_id is not null then
    return new;
  end if;
  select a.profile_id into v_profile from public.artists a where a.id = new.artist_id;
  if v_profile is null then
    return new;
  end if;
  -- Esa cuenta ya está en el evento (principal o adicional): la fila no se escribe.
  if exists (select 1 from public.events e where e.id = new.event_id and e.musico_id = v_profile)
     or exists (select 1 from public.event_artists x
                 where x.event_id = new.event_id and x.musico_id = v_profile
                   and x.id is distinct from new.id) then
    return null;
  end if;
  new.musico_id := v_profile;
  new.artist_id := null;
  return new;
end;
$$;

drop trigger if exists event_artists_1_normalizar_ficha_trg on public.event_artists;
create trigger event_artists_1_normalizar_ficha_trg
  before insert or update of artist_id on public.event_artists
  for each row execute function public.event_artists_normalizar_ficha();

revoke all on function public.events_normalizar_ficha()         from public, anon, authenticated;
revoke all on function public.event_artists_normalizar_ficha()  from public, anon, authenticated;

-- 4. Funciones que cambian --------------------------------------------------------------------

-- 4a. events_claim_owner: además de la banda con ficha reclamada, la cuenta (musico_id)
-- queda admin del evento, salvo que sea quien lo creó.
create or replace function public.events_claim_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
  values (new.id, new.created_by, 'owner', true, 'claim');

  -- El dueño del local, si existe y no es el mismo que creó.
  insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
  select new.id, v.owner_id, 'admin', false, 'venue_owner'
    from public.venues v
   where v.id = new.venue_id and v.owner_id is not null and v.owner_id <> new.created_by
  on conflict do nothing;

  -- El músico real detrás de la ficha (spec 061): solo si la ficha ya tiene cuenta.
  insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
  select new.id, a.profile_id, 'admin', false, 'artist'
    from public.artists a
   where a.id = new.artist_id
     and a.profile_id is not null
     and a.profile_id <> new.created_by
  on conflict do nothing;

  -- W-347: la banda principal es una cuenta.
  insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
  select new.id, new.musico_id, 'admin', false, 'artist'
   where new.musico_id is not null
     and new.musico_id <> new.created_by
  on conflict do nothing;

  return new;
end;
$$;

-- 4b. Banda adicional: con musico_id, la misma regla de W-307 (solo da admin quien maneja
-- el equipo: un editor no fabrica un admin agregando una cuenta).
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

  insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
  select new.event_id, new.musico_id, 'admin', false, 'artist'
   where new.musico_id is not null
  on conflict (event_id, user_id) do nothing;
  return new;
end;
$$;

-- 4c. Al sacar una banda: la cuenta pierde solo lo que tenía por ser banda del evento
-- (source = 'artist'), salvo que siga como principal (events.musico_id o una ficha suya)
-- o con otra fila adicional en el evento.
create or replace function public.event_artists_release_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  v_profile := coalesce(old.musico_id,
                        (select a.profile_id from public.artists a where a.id = old.artist_id));
  if v_profile is null then
    return old;
  end if;
  if exists (select 1 from public.events e
              where e.id = old.event_id
                and (e.musico_id = v_profile
                     or e.artist_id in (select a.id from public.artists a where a.profile_id = v_profile)))
     or exists (select 1 from public.event_artists ea
                 where ea.event_id = old.event_id and ea.id <> old.id
                   and (ea.musico_id = v_profile
                        or ea.artist_id in (select a.id from public.artists a where a.profile_id = v_profile))) then
    return old;
  end if;
  delete from public.event_collaborators
   where event_id = old.event_id and user_id = v_profile and source = 'artist';
  return old;
end;
$$;

-- 4d. Una banda (ficha o cuenta) no es principal y adicional a la vez.
create or replace function public.event_artists_guard_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.events e
              where e.id = new.event_id
                and ((new.artist_id is not null and e.artist_id = new.artist_id)
                     or (new.musico_id is not null and e.musico_id = new.musico_id))) then
    raise exception 'esa banda ya es la principal del evento';
  end if;
  return new;
end;
$$;

drop trigger if exists event_artists_guard_principal_trg on public.event_artists;
create trigger event_artists_guard_principal_trg
  before insert or update of artist_id, musico_id on public.event_artists
  for each row execute function public.event_artists_guard_principal();

revoke all on function public.event_artists_claim_admin()     from public, anon, authenticated;
revoke all on function public.event_artists_release_admin()   from public, anon, authenticated;
revoke all on function public.event_artists_guard_principal() from public, anon, authenticated;
revoke all on function public.events_claim_owner()            from public, anon, authenticated;

-- 5. _convertir_ficha_en_cuenta ---------------------------------------------------------------
-- La ficha origen desaparece y sus eventos pasan a la cuenta. Mismo orden que
-- admin_unir_bandas (W-341), con la cuenta como destino. Ayuda interna: nadie la llama
-- desde el cliente.
create or replace function public._convertir_ficha_en_cuenta(p_artist uuid, p_profile uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ficha public.artists%rowtype;
  v_ev_p  int;
  v_ev_a  int;
  v_inv   int;
begin
  select * into v_ficha from public.artists where id = p_artist for update;
  if not found then
    raise exception 'no existe esa ficha';
  end if;
  if v_ficha.profile_id is not null and v_ficha.profile_id <> p_profile then
    raise exception 'esa ficha es de otra cuenta';
  end if;

  -- 1. Donde la ficha es principal y la cuenta adicional: la fila adicional sobra (la
  --    cuenta pasa a principal en el paso 2).
  delete from public.event_artists ea
   where ea.musico_id = p_profile
     and exists (select 1 from public.events e
                  where e.id = ea.event_id and e.artist_id = p_artist);

  -- 2. Los eventos de la ficha pasan a la cuenta como principal.
  update public.events set musico_id = p_profile, artist_id = null where artist_id = p_artist;
  get diagnostics v_ev_p = row_count;

  -- 3. Las filas adicionales de la ficha en eventos donde la cuenta ya está (principal,
  --    incluidos los del paso 2, o adicional) sobran.
  delete from public.event_artists ea
   where ea.artist_id = p_artist
     and (exists (select 1 from public.events e
                   where e.id = ea.event_id and e.musico_id = p_profile)
          or exists (select 1 from public.event_artists x
                      where x.event_id = ea.event_id and x.musico_id = p_profile));

  -- 4. Las demás filas adicionales de la ficha pasan a la cuenta.
  update public.event_artists set musico_id = p_profile, artist_id = null where artist_id = p_artist;
  get diagnostics v_ev_a = row_count;

  -- 5. Invitaciones de la ficha: las pendientes se revocan (la banda ya tiene cuenta) y todas
  --    quedan sin ficha. Se revoca ANTES de soltar la ficha: sonopolis_invites_one_pending_email
  --    solo admite una pendiente por (quién invita, correo) cuando artist_id es nulo. La
  --    invitación que se está aplicando en W-302 ya está aceptada antes de llamar acá.
  update public.sonopolis_invites set status = 'revoked'
   where artist_id = p_artist and status = 'pending';
  update public.sonopolis_invites set artist_id = null where artist_id = p_artist;
  get diagnostics v_inv = row_count;

  -- 6. La cuenta queda admin de cada evento donde ahora está, principal o adicional, salvo
  --    los que creó. Los deletes de los pasos 1 y 3 pudieron quitarle el admin
  --    (event_artists_release_admin): acá se le devuelve.
  insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
  select e.id, p_profile, 'admin', false, 'artist'
    from public.events e
   where e.created_by is distinct from p_profile
     and (e.musico_id = p_profile
          or exists (select 1 from public.event_artists ea
                      where ea.event_id = e.id and ea.musico_id = p_profile))
  on conflict (event_id, user_id) do nothing;

  -- 7. La ficha desaparece.
  delete from public.artists where id = p_artist;

  return jsonb_build_object(
    'eventos_principal', v_ev_p,
    'eventos_adicional', v_ev_a,
    'invitaciones',      v_inv);
end;
$$;

revoke all on function public._convertir_ficha_en_cuenta(uuid, uuid) from public, anon, authenticated;

-- 6. _aplicar_invitacion_sonopolis (W-302) ---------------------------------------------------
-- Igual que antes, salvo el bloque de la ficha: en vez de poner artists.profile_id (y crear
-- una ficha si no había), la ficha de la invitación se convierte en la cuenta. Si la
-- invitación no traía ficha, la cuenta ya ES la banda: no se crea ninguna ficha.
-- Devuelve el motivo si no aplica, null si aplicó. NUNCA lanza: corre dentro de un trigger de
-- auth.users (ver W-230).
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

  -- La invitación queda aceptada ANTES de convertir la ficha: _convertir_ficha_en_cuenta
  -- revoca las invitaciones pendientes de la ficha y esta no debe ser una de ellas.
  update public.sonopolis_invites
     set status = 'accepted', accepted_at = now(), accepted_by = p_user_id
   where id = v_inv.id;

  -- La ficha que trae la invitación, si sigue libre: sus eventos pasan a la cuenta, la
  -- cuenta queda admin de cada uno y la ficha desaparece.
  if v_inv.artist_id is not null and exists (
       select 1 from public.artists where id = v_inv.artist_id and profile_id is null) then
    perform public._convertir_ficha_en_cuenta(v_inv.artist_id, p_user_id);
  end if;

  return null;
exception when others then
  return 'no se pudo aplicar la invitación: ' || sqlerrm;
end;
$$;

revoke all on function public._aplicar_invitacion_sonopolis(uuid, uuid) from public, anon, authenticated;

-- 7. admin_vincular_banda / admin_desvincular_banda (W-341) ---------------------------------
-- Mismas validaciones y errores; vincular ahora convierte y es irreversible: la ficha ya no
-- existe. En admin_ediciones: antes = la ficha completa, despues = el resumen.
create or replace function public.admin_vincular_banda(p_artist uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.artists%rowtype;
  v_rol   text;
  v_res   jsonb;
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede hacer esto';
  end if;

  select * into v_antes from public.artists where id = p_artist for update;
  if not found then
    raise exception 'no existe esa ficha';
  end if;
  if v_antes.profile_id is not null then
    raise exception 'esa ficha ya está conectada a una cuenta; desconéctala primero';
  end if;

  select role into v_rol from public.profiles where id = p_profile;
  if not found then
    raise exception 'no existe esa cuenta';
  end if;
  if v_rol is distinct from 'musician' then
    raise exception 'esa cuenta no es de músico';
  end if;

  v_res := public._convertir_ficha_en_cuenta(p_artist, p_profile);

  perform public._admin_registrar('artists', p_artist, 'vincular', to_jsonb(v_antes), v_res);
end;
$$;

-- Se queda la firma para no romper llamadas viejas. Una banda con cuenta ya no tiene ficha.
create or replace function public.admin_desvincular_banda(p_artist uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede hacer esto';
  end if;
  raise exception 'una banda con cuenta ya no tiene ficha; no hay qué desconectar';
end;
$$;

revoke all on function public.admin_vincular_banda(uuid, uuid)  from public, anon;
revoke all on function public.admin_desvincular_banda(uuid)     from public, anon;
grant execute on function public.admin_vincular_banda(uuid, uuid)  to authenticated;
grant execute on function public.admin_desvincular_banda(uuid)     to authenticated;

-- 8. Muro (spec 185) ---------------------------------------------------------------------------
-- Un evento es de la cuenta si es su created_by, si musico_id es la cuenta, o si está en
-- event_artists.musico_id; se mantiene la rama de fichas con profile_id (la app móvil puede
-- crear alguna). muro_eventos_pasados llama a esta y no cambia.
create or replace function public.muro_evento_es_de(
  p_tenant_type text,
  p_tenant_id   uuid,
  p_event_id    uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.events e
     where e.id = p_event_id
       and e.status not in ('draft', 'cancelled')
       and coalesce(e.visible_en_cartelera, true)
       and e.comienza_at < now()
       and e.imagen is not null
       and e.imagen <> ''
       and (
         (p_tenant_type = 'venue' and e.venue_id = p_tenant_id)
         or (p_tenant_type = 'musician' and (
               e.created_by = p_tenant_id
               or e.musico_id = p_tenant_id
               or exists (
                    select 1 from public.event_artists ea
                     where ea.event_id = e.id and ea.musico_id = p_tenant_id)
               or exists (
                    select 1 from public.artists a
                     where a.id = e.artist_id and a.profile_id = p_tenant_id)))
       )
  );
$$;

-- 9. CRM (W-301) -------------------------------------------------------------------------------
-- privado.crm_base reparte los compradores de un evento entre el local y cada banda con
-- cuenta. Leía solo artists.profile_id: con la banda como cuenta (musico_id) sus compradores
-- dejarían de llegar a su base. Se suman las dos ramas de musico_id; el resto es idéntico a W-301.
create or replace view privado.crm_base with (security_invoker = true) as
with eventos_tenant as (
  -- 1. El músico que creó el evento.
  select e.id as event_id, 'musician'::text as tenant_type, e.created_by as tenant_id
    from public.events e
    join public.profiles p on p.id = e.created_by
   where p.role = 'musician'
  union
  -- 2. El local donde ocurre.
  select e.id, 'venue', e.venue_id
    from public.events e
   where e.venue_id is not null
  union
  -- 3. La banda principal con cuenta: la cuenta (W-347) o la ficha reclamada (app móvil).
  select e.id, 'musician', e.musico_id
    from public.events e
   where e.musico_id is not null
  union
  select e.id, 'musician', a.profile_id
    from public.events e
    join public.artists a on a.id = e.artist_id
   where a.profile_id is not null
  union
  -- 4. Las bandas adicionales (W-300) con cuenta: la cuenta (W-347) o la ficha reclamada.
  select ea.event_id, 'musician', ea.musico_id
    from public.event_artists ea
   where ea.musico_id is not null
  union
  select ea.event_id, 'musician', a.profile_id
    from public.event_artists ea
    join public.artists a on a.id = ea.artist_id
   where a.profile_id is not null
),
-- Desde aquí, sin cambios respecto de W-301.
fuentes as (
  select et.tenant_type,
         et.tenant_id,
         lower(t.comprador_email) as email,
         null::text               as phone_e164,
         t.user_id                as user_id,
         'comprador'::text        as origen,
         t.created_at             as visto_at,
         t.cantidad               as cantidad,
         t.monto                  as monto
    from public.tickets t
    join eventos_tenant et on et.event_id = t.evento_id
   where t.status = 'completed' and t.comprador_email is not null

  union all
  select o.tenant_type, o.tenant_id, lower(o.email), o.phone_e164, o.user_id,
         'whatsapp', o.opted_in_at, 0, 0
    from public.whatsapp_opt_ins o
   where o.revoked_at is null

  union all
  select 'venue', f.venue_id, lower(privado.email_de_cuenta(f.follower_id)), null, f.follower_id,
         'seguidor', f.created_at, 0, 0
    from public.follows_venues f

  union all
  select 'musician', f.musician_id, lower(privado.email_de_cuenta(f.follower_id)), null, f.follower_id,
         'seguidor', f.created_at, 0, 0
    from public.follows_musicians f
)
select tenant_type,
       tenant_id,
       coalesce(email, phone_e164, 'u:' || user_id::text) as contacto_key,
       max(email)      as email,
       max(phone_e164) as phone_e164,
       (array_agg(user_id) filter (where user_id is not null))[1] as user_id,
       array_agg(distinct origen order by origen)                 as origenes,
       min(visto_at)                                              as primer_contacto,
       max(visto_at) filter (where origen = 'comprador')          as ultima_compra,
       coalesce(sum(cantidad) filter (where origen = 'comprador'), 0) as entradas,
       coalesce(sum(monto)    filter (where origen = 'comprador'), 0) as total_gastado,
       bool_or(origen = 'whatsapp')                               as acepta_whatsapp
  from fuentes
 group by 1, 2, 3;

grant select on privado.crm_base to authenticated, service_role;

-- 10. Paso de los datos de hoy -----------------------------------------------------------------
-- Cada ficha con cuenta se convierte. Al terminar ningún evento apunta a una ficha con cuenta
-- y esas fichas ya no existen. Si algo falla (p. ej. una cuenta que no es de músico), la
-- migración entera se cae: no queda nada a medias.
do $$
declare
  r record;
begin
  for r in select id, profile_id from public.artists where profile_id is not null order by created_at loop
    perform public._convertir_ficha_en_cuenta(r.id, r.profile_id);
  end loop;

  if exists (select 1 from public.events e join public.artists a on a.id = e.artist_id
              where a.profile_id is not null)
     or exists (select 1 from public.event_artists ea join public.artists a on a.id = ea.artist_id
                 where a.profile_id is not null) then
    raise exception 'W-347: quedaron eventos apuntando a fichas con cuenta';
  end if;
end;
$$;
