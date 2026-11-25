-- Spec W-350 (sonopolisWeb) — El admin escribe donde escribe el dueño, con las mismas columnas.
-- Ver sonopolisWeb/specs/w350-datos-admin-edita-como-el-dueno.md
--
-- El admin de Sonópolis guarda desde los mismos formularios del músico y del local
-- (perfil, fotos, direcciones, pin, punto de la portada). Policies de admin en cada camino
-- de escritura del dueño + un guardia de columnas que deja cambiar solo lo que esos
-- formularios escriben. Los eventos no cambian: can_edit_event ya incluye al admin (078).

-- 1. Policies de escritura del admin ---------------------------------------------------------

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.es_admin_sonopolis() and role = 'musician')
  with check (public.es_admin_sonopolis() and role = 'musician');

drop policy if exists venues_update_admin on public.venues;
create policy venues_update_admin on public.venues
  for update to authenticated
  using (public.es_admin_sonopolis())
  with check (public.es_admin_sonopolis());

drop policy if exists venue_addresses_insert_admin on public.venue_addresses;
create policy venue_addresses_insert_admin on public.venue_addresses
  for insert to authenticated
  with check (public.es_admin_sonopolis());

drop policy if exists venue_addresses_update_admin on public.venue_addresses;
create policy venue_addresses_update_admin on public.venue_addresses
  for update to authenticated
  using (public.es_admin_sonopolis())
  with check (public.es_admin_sonopolis());

drop policy if exists venue_addresses_delete_admin on public.venue_addresses;
create policy venue_addresses_delete_admin on public.venue_addresses
  for delete to authenticated
  using (public.es_admin_sonopolis());

-- Storage: espejo de media_*_perfiles / media_*_locales (spec 053) con el admin en vez del
-- dueño. La carpeta se compara como texto (no ::uuid) para que un nombre que no es uuid
-- falle la policy en vez de lanzar un error de cast. `objects.name` calificado: dentro de
-- la subconsulta, `name` a secas se resolvería como `venues.name`.
drop policy if exists media_insert_perfiles_admin on storage.objects;
create policy media_insert_perfiles_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'perfiles'
    and public.es_admin_sonopolis()
    and exists (select 1 from public.profiles p
                 where p.id::text = (storage.foldername(objects.name))[2]
                   and p.role = 'musician')
  );

drop policy if exists media_update_perfiles_admin on storage.objects;
create policy media_update_perfiles_admin on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'perfiles'
    and public.es_admin_sonopolis()
    and exists (select 1 from public.profiles p
                 where p.id::text = (storage.foldername(objects.name))[2]
                   and p.role = 'musician')
  );

drop policy if exists media_insert_locales_admin on storage.objects;
create policy media_insert_locales_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'locales'
    and public.es_admin_sonopolis()
    and exists (select 1 from public.venues v
                 where v.id::text = (storage.foldername(objects.name))[2])
  );

drop policy if exists media_update_locales_admin on storage.objects;
create policy media_update_locales_admin on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'locales'
    and public.es_admin_sonopolis()
    and exists (select 1 from public.venues v
                 where v.id::text = (storage.foldername(objects.name))[2])
  );

-- 2. Registro de las ediciones directas del admin -------------------------------------------
-- El guardia es security invoker (ver abajo) y no puede ejecutar _admin_registrar (W-341),
-- que nadie puede ejecutar. Esta envoltura sí la ejecuta authenticated, pero solo registra
-- si la sesión es admin y solo para estas dos tablas.
create or replace function public._admin_registrar_edicion(
  p_tabla text, p_fila uuid, p_antes jsonb, p_despues jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede hacer esto';
  end if;
  if p_tabla not in ('profiles', 'venues') then
    raise exception 'tabla no registrable: %', p_tabla;
  end if;
  perform public._admin_registrar(p_tabla, p_fila, 'editar', p_antes, p_despues);
end $$;

revoke all on function public._admin_registrar_edicion(text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public._admin_registrar_edicion(text, uuid, jsonb, jsonb) to authenticated;

-- 3. Guardia de columnas ---------------------------------------------------------------------
-- Actúa solo en escrituras directas de una sesión (current_user = authenticated) de un admin
-- sobre una fila que no es suya. Dentro de una función security definer current_user es su
-- dueño y esa función ya trae sus propias guardas (admin_dar_pro W-211, admin_editar_* W-341),
-- por eso este trigger es security invoker: con definer, current_user sería siempre el dueño
-- de esta función y no se podría distinguir.
create or replace function public.guard_edicion_admin()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nuevo   jsonb := to_jsonb(new);
  v_viejo   jsonb := to_jsonb(old);
  v_dueno   uuid;
  v_lista   text[];
  v_clave   text;
  v_antes   jsonb := '{}'::jsonb;
  v_despues jsonb := '{}'::jsonb;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  v_dueno := case tg_table_name
               when 'profiles' then (v_viejo->>'id')::uuid
               else (v_viejo->>'owner_id')::uuid
             end;
  if auth.uid() is not distinct from v_dueno or not public.es_admin_sonopolis() then
    return new;
  end if;

  -- Lo que escriben los formularios y acciones del dueño (mapPerfilMusicoToDB, mapVenueToDB
  -- sin owner_id, pin, portada) y lo que copia el trigger de W-062 desde la dirección activa.
  v_lista := case tg_table_name
    when 'profiles' then array[
      'nombre', 'tipo_proyecto', 'bio', 'instagram', 'spotify', 'youtube', 'tiktok',
      'sitio_web', 'foto', 'avatar', 'ciudad', 'pais', 'generos', 'integrantes',
      'duracion_show', 'telefono', 'email_contacto', 'rider_tecnico', 'portada_x',
      'portada_y', 'updated_at']
    else array[
      'name', 'type', 'description', 'estilo', 'ciudad', 'comuna', 'pais', 'aforo',
      'telefono', 'email_contacto', 'instagram', 'sitio_web', 'horarios', 'tiene_escenario',
      'tiene_sonido', 'tiene_backline', 'image', 'avatar', 'lat', 'lng', 'address',
      'portada_x', 'portada_y', 'updated_at']
  end;

  for v_clave in select jsonb_object_keys(v_nuevo) loop
    if (v_nuevo->v_clave) is distinct from (v_viejo->v_clave) then
      if not (v_clave = any (v_lista)) then
        raise exception 'campo no editable por el admin: %', v_clave;
      end if;
      if v_clave <> 'updated_at' then
        v_antes   := v_antes   || jsonb_build_object(v_clave, v_viejo->v_clave);
        v_despues := v_despues || jsonb_build_object(v_clave, v_nuevo->v_clave);
      end if;
    end if;
  end loop;

  if v_antes <> '{}'::jsonb then
    perform public._admin_registrar_edicion(tg_table_name, (v_viejo->>'id')::uuid, v_antes, v_despues);
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_edicion_admin_trg on public.profiles;
create trigger profiles_guard_edicion_admin_trg
  before update on public.profiles
  for each row execute function public.guard_edicion_admin();

drop trigger if exists venues_guard_edicion_admin_trg on public.venues;
create trigger venues_guard_edicion_admin_trg
  before update on public.venues
  for each row execute function public.guard_edicion_admin();
