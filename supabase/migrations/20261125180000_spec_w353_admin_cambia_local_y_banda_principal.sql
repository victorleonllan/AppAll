-- Spec W-353 (sonopolisWeb) — El admin cambia el local y la banda principal de un evento.
-- Ver sonopolisWeb/specs/w353-datos-admin-cambia-local-y-banda-principal.md
--
-- events_claim_owner (W-347) reparte los permisos del evento solo en el INSERT: el dueño del
-- local queda admin ('venue_owner') y la cuenta de la banda principal también ('artist'). Un
-- UPDATE de venue_id / musico_id / artist_id no reasigna nada. Estas dos funciones, solo para
-- el admin de Sonópolis, cambian esas columnas y reasignan los permisos como si el evento se
-- hubiera creado así. Las bandas adicionales no necesitan nada: los triggers de
-- event_artists (W-347) ya lo hacen al agregar y quitar.

-- 0. admin_ediciones (W-341) solo aceptaba profiles, venues y artists: se suma events.
alter table public.admin_ediciones drop constraint if exists admin_ediciones_tabla_check;
alter table public.admin_ediciones add constraint admin_ediciones_tabla_check
  check (tabla in ('profiles', 'venues', 'artists', 'events'));

-- 1. Cambiar el local -------------------------------------------------------------------------
create or replace function public.admin_cambiar_local_evento(p_event uuid, p_venue uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev        public.events%rowtype;
  v_nuevo     public.venues%rowtype;
  v_dueno_ant uuid;
  v_fila      public.events%rowtype;
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede hacer esto';
  end if;

  select * into v_ev from public.events where id = p_event for update;
  if not found then
    raise exception 'no existe ese evento';
  end if;
  select * into v_nuevo from public.venues where id = p_venue;
  if not found then
    raise exception 'no existe ese local';
  end if;

  if v_ev.venue_id is not distinct from p_venue then
    return to_jsonb(v_ev);
  end if;

  select owner_id into v_dueno_ant from public.venues where id = v_ev.venue_id;

  update public.events
     set venue_id = p_venue, venue_name = v_nuevo.name
   where id = p_event
  returning * into v_fila;

  -- El dueño del local anterior sale solo si entró por ser dueño del local: si además creó
  -- el evento, su fila es owner/claim y no se toca.
  if v_dueno_ant is not null then
    delete from public.event_collaborators
     where event_id = p_event and user_id = v_dueno_ant and source = 'venue_owner';
  end if;

  -- Mismo insert que events_claim_owner (W-347).
  if v_nuevo.owner_id is not null and v_nuevo.owner_id <> v_ev.created_by then
    insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
    values (p_event, v_nuevo.owner_id, 'admin', false, 'venue_owner')
    on conflict (event_id, user_id) do nothing;
  end if;

  perform public._admin_registrar('events', p_event, 'editar',
    jsonb_build_object('venue_id', v_ev.venue_id, 'venue_name', v_ev.venue_name),
    jsonb_build_object('venue_id', v_fila.venue_id, 'venue_name', v_fila.venue_name));

  return to_jsonb(v_fila);
end $$;

-- 2. Cambiar la banda principal --------------------------------------------------------------
create or replace function public.admin_cambiar_principal_evento(p_event uuid, p_musico uuid, p_artist uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev         public.events%rowtype;
  v_nombre     text;
  v_cuenta_ant uuid;
  v_cuenta_new uuid;
  v_fila       public.events%rowtype;
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede hacer esto';
  end if;
  if (p_musico is null) = (p_artist is null) then
    raise exception 'elige una cuenta o una ficha';
  end if;

  select * into v_ev from public.events where id = p_event for update;
  if not found then
    raise exception 'no existe ese evento';
  end if;

  if p_musico is not null then
    select nombre into v_nombre from public.profiles where id = p_musico and role = 'musician';
    if not found then
      raise exception 'esa cuenta no es de músico';
    end if;
    v_cuenta_new := p_musico;
  else
    select name, profile_id into v_nombre, v_cuenta_new from public.artists where id = p_artist;
    if not found then
      raise exception 'no existe esa ficha';
    end if;
  end if;

  if v_ev.musico_id is not distinct from p_musico and v_ev.artist_id is not distinct from p_artist then
    return to_jsonb(v_ev);
  end if;

  v_cuenta_ant := coalesce(v_ev.musico_id,
                           (select a.profile_id from public.artists a where a.id = v_ev.artist_id));

  -- Una banda no es principal y adicional a la vez.
  delete from public.event_artists
   where event_id = p_event
     and ((p_musico is not null and musico_id = p_musico)
          or (p_artist is not null and artist_id = p_artist));

  update public.events
     set musico_id = p_musico, artist_id = p_artist, artist_name = coalesce(nullif(v_nombre, ''), v_ev.artist_name)
   where id = p_event
  returning * into v_fila;

  -- Los triggers de W-347 pueden haber convertido una ficha con cuenta en la cuenta.
  v_cuenta_new := coalesce(v_fila.musico_id,
                           (select a.profile_id from public.artists a where a.id = v_fila.artist_id));

  -- La cuenta anterior deja de ser admin salvo que siga en el evento (regla de
  -- event_artists_release_admin, W-347).
  if v_cuenta_ant is not null and v_cuenta_ant is distinct from v_cuenta_new
     and not exists (select 1 from public.event_artists ea
                      where ea.event_id = p_event
                        and (ea.musico_id = v_cuenta_ant
                             or ea.artist_id in (select a.id from public.artists a where a.profile_id = v_cuenta_ant))) then
    delete from public.event_collaborators
     where event_id = p_event and user_id = v_cuenta_ant and source = 'artist';
  end if;

  if v_cuenta_new is not null and v_cuenta_new <> v_ev.created_by then
    insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
    values (p_event, v_cuenta_new, 'admin', false, 'artist')
    on conflict (event_id, user_id) do nothing;
  end if;

  perform public._admin_registrar('events', p_event, 'editar',
    jsonb_build_object('musico_id', v_ev.musico_id, 'artist_id', v_ev.artist_id, 'artist_name', v_ev.artist_name),
    jsonb_build_object('musico_id', v_fila.musico_id, 'artist_id', v_fila.artist_id, 'artist_name', v_fila.artist_name));

  return to_jsonb(v_fila);
end $$;

revoke all on function public.admin_cambiar_local_evento(uuid, uuid)            from public, anon;
revoke all on function public.admin_cambiar_principal_evento(uuid, uuid, uuid)  from public, anon;
grant execute on function public.admin_cambiar_local_evento(uuid, uuid)           to authenticated;
grant execute on function public.admin_cambiar_principal_evento(uuid, uuid, uuid) to authenticated;
