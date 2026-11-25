-- Spec W-341 — el admin edita músicos, bandas y locales, y conecta bandas con cuentas.
-- Ver sonopolisWeb/specs/w341-datos-admin-edita-y-conecta-bandas.md
--
-- Mismo criterio que W-211 (admin_dar_pro): NO se abre una policy de UPDATE para el
-- admin sobre profiles / venues / artists, porque abriría todas las columnas (rol, dueño,
-- fecha de Pro). Todo va por funciones security definer que revisan es_admin_sonopolis()
-- ADENTRO, en Postgres, y que solo tocan una lista fija de columnas.
--
-- Cada función deja una fila en admin_ediciones (qué había antes, qué quedó): si el admin
-- se equivoca, se sabe cómo estaba. Mismo motivo que pro_cambios (W-211).

-- 1. Registro de cambios --------------------------------------------------------------
create table if not exists public.admin_ediciones (
  id         uuid        primary key default gen_random_uuid(),
  tabla      text        not null check (tabla in ('profiles', 'venues', 'artists')),
  fila_id    uuid        not null,
  accion     text        not null check (accion in ('editar', 'vincular', 'desvincular', 'unir')),
  antes      jsonb,
  despues    jsonb,
  por        uuid        references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists admin_ediciones_fila_idx
  on public.admin_ediciones (tabla, fila_id, created_at desc);

alter table public.admin_ediciones enable row level security;

-- Solo el admin lee el registro. Escribir: solo las funciones de abajo (security definer).
drop policy if exists admin_ediciones_select_admin on public.admin_ediciones;
create policy admin_ediciones_select_admin on public.admin_ediciones
  for select to authenticated using (public.es_admin_sonopolis());

revoke all on public.admin_ediciones from public, anon, authenticated;
grant select on public.admin_ediciones to authenticated;

-- 2. Ayudas internas (nadie las llama desde el cliente) --------------------------------

-- Cada clave de p_datos debe estar en la lista permitida: si no, falla en voz alta para
-- que la web nunca crea que guardó algo que se ignoró.
create or replace function public._admin_validar_campos(p_datos jsonb, p_permitidos text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_clave text;
begin
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'p_datos debe ser un objeto json';
  end if;
  for v_clave in select jsonb_object_keys(p_datos) loop
    if not (v_clave = any (p_permitidos)) then
      raise exception 'campo no editable: %', v_clave;
    end if;
  end loop;
end;
$$;

create or replace function public._admin_registrar(
  p_tabla text, p_fila uuid, p_accion text, p_antes jsonb, p_despues jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_ediciones (tabla, fila_id, accion, antes, despues, por)
  values (p_tabla, p_fila, p_accion, p_antes, p_despues, auth.uid());
$$;

-- La cuenta de la ficha queda admin de cada evento donde esa ficha toca (principal o
-- adicional), con el mismo insert del reclamo de W-302. Ningún trigger lo hace al cambiar
-- artists.profile_id. No pisa a quien creó el evento.
create or replace function public._admin_conectar_colaboradores(p_artist uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
  select e.id, a.profile_id, 'admin', false, 'artist'
    from public.artists a
    join public.events e
      on e.artist_id = a.id
      or exists (select 1 from public.event_artists ea
                  where ea.event_id = e.id and ea.artist_id = a.id)
   where a.id = p_artist
     and a.profile_id is not null
     and e.created_by is distinct from a.profile_id
  on conflict (event_id, user_id) do nothing;
$$;

revoke all on function public._admin_validar_campos(jsonb, text[])              from public, anon, authenticated;
revoke all on function public._admin_registrar(text, uuid, text, jsonb, jsonb)  from public, anon, authenticated;
revoke all on function public._admin_conectar_colaboradores(uuid)               from public, anon, authenticated;

-- 3. Editar ----------------------------------------------------------------------------

-- 3a. Cuenta de músico (profiles). Fuera de la lista a propósito: role, foto/avatar
-- (van a Storage) y sonopolis_pro_hasta (lo cambia admin_dar_pro, W-211).
create or replace function public.admin_editar_perfil_musico(p_id uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes   public.profiles%rowtype;
  v_nuevo   public.profiles%rowtype;
  v_despues jsonb;
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede hacer esto';
  end if;
  perform public._admin_validar_campos(p_datos, array[
    'nombre', 'tipo_proyecto', 'bio', 'instagram', 'spotify', 'youtube', 'tiktok',
    'sitio_web', 'ciudad', 'pais', 'generos', 'integrantes', 'duracion_show', 'telefono',
    'email_contacto', 'rider_tecnico', 'available']);

  select * into v_antes from public.profiles where id = p_id for update;
  if not found then
    raise exception 'no existe esa cuenta';
  end if;
  if v_antes.role is distinct from 'musician' then
    raise exception 'esa cuenta no es de músico';
  end if;

  -- jsonb_populate_record convierte cada valor al tipo de su columna, partiendo de la
  -- fila actual: lo que no viene en p_datos se queda igual.
  v_nuevo := jsonb_populate_record(v_antes, p_datos);

  update public.profiles p set
    nombre         = v_nuevo.nombre,
    tipo_proyecto  = v_nuevo.tipo_proyecto,
    bio            = v_nuevo.bio,
    instagram      = v_nuevo.instagram,
    spotify        = v_nuevo.spotify,
    youtube        = v_nuevo.youtube,
    tiktok         = v_nuevo.tiktok,
    sitio_web      = v_nuevo.sitio_web,
    ciudad         = v_nuevo.ciudad,
    pais           = v_nuevo.pais,
    generos        = v_nuevo.generos,
    integrantes    = v_nuevo.integrantes,
    duracion_show  = v_nuevo.duracion_show,
    telefono       = v_nuevo.telefono,
    email_contacto = v_nuevo.email_contacto,
    rider_tecnico  = v_nuevo.rider_tecnico,
    available      = v_nuevo.available,
    updated_at     = now()
   where p.id = p_id
  returning to_jsonb(p) into v_despues;

  perform public._admin_registrar('profiles', p_id, 'editar', to_jsonb(v_antes), v_despues);
  return v_despues;
end;
$$;

-- 3b. Local (venues). Fuera de la lista: owner_id (lo mueve la invitación de W-230),
-- sonopolis_pro_hasta (W-211), fotos, y address/lat/lng: el trigger de W-062 los copia
-- desde venue_addresses, así que editarlos en venues se pisaría solo.
create or replace function public.admin_editar_local(p_id uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes   public.venues%rowtype;
  v_nuevo   public.venues%rowtype;
  v_despues jsonb;
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede hacer esto';
  end if;
  perform public._admin_validar_campos(p_datos, array[
    'name', 'type', 'description', 'estilo', 'ciudad', 'comuna', 'pais', 'aforo',
    'telefono', 'email_contacto', 'instagram', 'sitio_web', 'horarios',
    'tiene_escenario', 'tiene_sonido', 'tiene_backline']);

  select * into v_antes from public.venues where id = p_id for update;
  if not found then
    raise exception 'no existe ese local';
  end if;

  v_nuevo := jsonb_populate_record(v_antes, p_datos);

  update public.venues v set
    name            = v_nuevo.name,
    type            = v_nuevo.type,
    description     = v_nuevo.description,
    estilo          = v_nuevo.estilo,
    ciudad          = v_nuevo.ciudad,
    comuna          = v_nuevo.comuna,
    pais            = v_nuevo.pais,
    aforo           = v_nuevo.aforo,
    telefono        = v_nuevo.telefono,
    email_contacto  = v_nuevo.email_contacto,
    instagram       = v_nuevo.instagram,
    sitio_web       = v_nuevo.sitio_web,
    horarios        = v_nuevo.horarios,
    tiene_escenario = v_nuevo.tiene_escenario,
    tiene_sonido    = v_nuevo.tiene_sonido,
    tiene_backline  = v_nuevo.tiene_backline,
    updated_at      = now()
   where v.id = p_id
  returning to_jsonb(v) into v_despues;

  perform public._admin_registrar('venues', p_id, 'editar', to_jsonb(v_antes), v_despues);
  return v_despues;
end;
$$;

-- 3c. Ficha de banda (artists). Fuera de la lista: profile_id (lo mueven vincular /
-- desvincular), created_by e image (Storage).
create or replace function public.admin_editar_banda(p_id uuid, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes   public.artists%rowtype;
  v_nuevo   public.artists%rowtype;
  v_despues jsonb;
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede hacer esto';
  end if;
  perform public._admin_validar_campos(p_datos, array[
    'name', 'genero', 'comuna', 'contacto', 'instagram']);

  select * into v_antes from public.artists where id = p_id for update;
  if not found then
    raise exception 'no existe esa ficha';
  end if;

  v_nuevo := jsonb_populate_record(v_antes, p_datos);

  update public.artists a set
    name      = v_nuevo.name,
    genero    = v_nuevo.genero,
    comuna    = v_nuevo.comuna,
    contacto  = v_nuevo.contacto,
    instagram = v_nuevo.instagram
   where a.id = p_id
  returning to_jsonb(a) into v_despues;

  perform public._admin_registrar('artists', p_id, 'editar', to_jsonb(v_antes), v_despues);
  return v_despues;
end;
$$;

-- 4. Conectar una ficha con una cuenta -------------------------------------------------
create or replace function public.admin_vincular_banda(p_artist uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes   public.artists%rowtype;
  v_rol     text;
  v_despues jsonb;
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

  -- El guardia de W-307 (artists_guard_profile_id) deja pasar esto: corre como dueño de
  -- la función y, además, quien llama es admin.
  update public.artists a set profile_id = p_profile
   where a.id = p_artist
  returning to_jsonb(a) into v_despues;

  perform public._admin_conectar_colaboradores(p_artist);
  perform public._admin_registrar('artists', p_artist, 'vincular', to_jsonb(v_antes), v_despues);
end;
$$;

create or replace function public.admin_desvincular_banda(p_artist uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes   public.artists%rowtype;
  v_despues jsonb;
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede hacer esto';
  end if;

  select * into v_antes from public.artists where id = p_artist for update;
  if not found then
    raise exception 'no existe esa ficha';
  end if;
  if v_antes.profile_id is null then
    raise exception 'esa ficha no está conectada a ninguna cuenta';
  end if;

  update public.artists a set profile_id = null
   where a.id = p_artist
  returning to_jsonb(a) into v_despues;

  -- La cuenta pierde solo lo que tenía por ser banda de esos eventos (source = 'artist'),
  -- salvo donde sigue con otra ficha suya, principal o adicional: la misma regla de
  -- event_artists_release_admin (W-307). La ficha ya quedó sin cuenta, así que el
  -- «otra ficha» de los exists no la cuenta.
  delete from public.event_collaborators c
   where c.user_id = v_antes.profile_id
     and c.source = 'artist'
     and c.event_id in (select e.id from public.events e where e.artist_id = p_artist
                        union
                        select ea.event_id from public.event_artists ea where ea.artist_id = p_artist)
     and not exists (select 1 from public.events e
                       join public.artists a on a.id = e.artist_id
                      where e.id = c.event_id and a.profile_id = v_antes.profile_id)
     and not exists (select 1 from public.event_artists ea
                       join public.artists a on a.id = ea.artist_id
                      where ea.event_id = c.event_id and a.profile_id = v_antes.profile_id);

  perform public._admin_registrar('artists', p_artist, 'desvincular', to_jsonb(v_antes), v_despues);
end;
$$;

-- 5. Unir dos fichas de la misma banda -------------------------------------------------
-- La ficha origen desaparece y todo lo suyo pasa a la destino. El orden de los pasos
-- evita los choques con la PK de event_artists y con event_artists_guard_principal (W-300).
-- En admin_ediciones: fila_id es la ficha destino (la que queda), antes es la ficha
-- origen COMPLETA (para rehacerla a mano si hizo falta) y despues trae la destino ya
-- unida y el resumen.
create or replace function public.admin_unir_bandas(p_origen uuid, p_destino uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o       public.artists%rowtype;
  v_d       public.artists%rowtype;
  v_ev_p    int;
  v_ev_a    int;
  v_inv     int;
  v_res     jsonb;
  v_despues jsonb;
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede hacer esto';
  end if;
  if p_origen is null or p_destino is null or p_origen = p_destino then
    raise exception 'elige dos fichas distintas';
  end if;

  select * into v_o from public.artists where id = p_origen  for update;
  if not found then
    raise exception 'no existe la ficha de origen';
  end if;
  select * into v_d from public.artists where id = p_destino for update;
  if not found then
    raise exception 'no existe la ficha de destino';
  end if;
  if v_o.profile_id is not null and v_d.profile_id is not null
     and v_o.profile_id <> v_d.profile_id then
    raise exception 'las dos fichas son de cuentas distintas';
  end if;

  -- 1. Donde la origen es principal y la destino adicional: la fila adicional de la
  --    destino sobra (la destino pasa a principal en el paso 2).
  delete from public.event_artists ea
   where ea.artist_id = p_destino
     and exists (select 1 from public.events e
                  where e.id = ea.event_id and e.artist_id = p_origen);

  -- 2. Los eventos de la origen pasan a la destino como principal.
  update public.events set artist_id = p_destino where artist_id = p_origen;
  get diagnostics v_ev_p = row_count;

  -- 3. Las filas adicionales de la origen en eventos donde la destino ya está (principal,
  --    incluidos los del paso 2, o adicional) sobran.
  delete from public.event_artists ea
   where ea.artist_id = p_origen
     and (exists (select 1 from public.events e
                   where e.id = ea.event_id and e.artist_id = p_destino)
          or exists (select 1 from public.event_artists x
                      where x.event_id = ea.event_id and x.artist_id = p_destino));

  -- 4. Las demás filas adicionales de la origen pasan a la destino.
  update public.event_artists set artist_id = p_destino where artist_id = p_origen;
  get diagnostics v_ev_a = row_count;

  -- 5. Invitaciones. Solo puede haber una pendiente por ficha
  --    (sonopolis_invites_one_pending_artist): si la destino ya tiene una, la de la
  --    origen se revoca antes de moverla, o el update chocaría con ese índice.
  if exists (select 1 from public.sonopolis_invites
              where artist_id = p_destino and status = 'pending') then
    update public.sonopolis_invites set status = 'revoked'
     where artist_id = p_origen and status = 'pending';
  end if;
  update public.sonopolis_invites set artist_id = p_destino where artist_id = p_origen;
  get diagnostics v_inv = row_count;

  -- 6. Los campos vacíos de la destino se completan con los de la origen. Si la destino
  --    no tiene cuenta y la origen sí, la destino se queda con esa cuenta.
  update public.artists d set
    genero     = coalesce(d.genero,     v_o.genero),
    comuna     = coalesce(d.comuna,     v_o.comuna),
    contacto   = coalesce(d.contacto,   v_o.contacto),
    instagram  = coalesce(d.instagram,  v_o.instagram),
    image      = coalesce(d.image,      v_o.image),
    profile_id = coalesce(d.profile_id, v_o.profile_id)
   where d.id = p_destino;

  -- 7. La origen desaparece. Ya no la referencia nada (events y event_artists se movieron
  --    arriba; sonopolis_invites también).
  delete from public.artists where id = p_origen;

  -- 8. Si la destino tiene cuenta, queda admin de todos los eventos donde ahora toca. Los
  --    deletes de los pasos 1 y 3 pudieron quitarle (release_admin) el admin de algún
  --    evento: acá se le devuelve.
  perform public._admin_conectar_colaboradores(p_destino);

  v_res := jsonb_build_object(
    'eventos_principal', v_ev_p,
    'eventos_adicional', v_ev_a,
    'invitaciones',      v_inv);

  select to_jsonb(a) into v_despues from public.artists a where a.id = p_destino;
  perform public._admin_registrar('artists', p_destino, 'unir', to_jsonb(v_o),
    jsonb_build_object('destino', v_despues, 'resumen', v_res));
  return v_res;
end;
$$;

-- Permisos -------------------------------------------------------------------------------
revoke all on function public.admin_editar_perfil_musico(uuid, jsonb) from public, anon;
revoke all on function public.admin_editar_local(uuid, jsonb)         from public, anon;
revoke all on function public.admin_editar_banda(uuid, jsonb)         from public, anon;
revoke all on function public.admin_vincular_banda(uuid, uuid)        from public, anon;
revoke all on function public.admin_desvincular_banda(uuid)           from public, anon;
revoke all on function public.admin_unir_bandas(uuid, uuid)           from public, anon;
grant execute on function public.admin_editar_perfil_musico(uuid, jsonb) to authenticated;
grant execute on function public.admin_editar_local(uuid, jsonb)         to authenticated;
grant execute on function public.admin_editar_banda(uuid, jsonb)         to authenticated;
grant execute on function public.admin_vincular_banda(uuid, uuid)        to authenticated;
grant execute on function public.admin_desvincular_banda(uuid)           to authenticated;
grant execute on function public.admin_unir_bandas(uuid, uuid)           to authenticated;
