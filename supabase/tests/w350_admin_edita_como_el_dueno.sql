-- Pruebas de W-350 (el admin escribe donde escribe el dueño, con las mismas columnas).
-- Ver sonopolisWeb/specs/w350-datos-admin-edita-como-el-dueno.md
--
-- Corre DENTRO de una transacción que se revierte: no deja nada.
--   supabase/tests/correr.sh supabase/tests/w350_admin_edita_como_el_dueno.sql [migración.sql]
-- Si algo falla, lanza 'FALLA: …' y la transacción entera se cae.

create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FALLA: %', msg; end if;
end $$;

create function pg_temp.falla(sql text, esperado text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FALLA: se esperaba error «%» y no hubo error: %', esperado, sql;
exception when others then
  if sqlerrm like 'FALLA:%' then raise; end if;
  if position(esperado in sqlerrm) = 0 then
    raise exception 'FALLA: se esperaba «%», llegó «%»', esperado, sqlerrm;
  end if;
end $$;

-- Filas que afecta una sentencia (RLS no da error al filtrar: da 0 filas).
create function pg_temp.filas(sql text) returns int language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end $$;

create function pg_temp.como(usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
end $$;

-- Cuentas: A (admin, rol fan, como el de producción), M1 y M2 (músicos), F (fan), L (local).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-4000-a350-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'admin@prueba-w350.test', '{"role":"fan","nombre":"Admin W350"}', now(), now(), now()),
 ('00000000-0000-4000-a350-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm1@prueba-w350.test', '{"role":"musician","nombre":"Músico M1 W350"}', now(), now(), now()),
 ('00000000-0000-4000-a350-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm2@prueba-w350.test', '{"role":"musician","nombre":"Músico M2 W350"}', now(), now(), now()),
 ('00000000-0000-4000-a350-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'f@prueba-w350.test', '{"role":"fan","nombre":"Fan F W350"}', now(), now(), now()),
 ('00000000-0000-4000-a350-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'l@prueba-w350.test', '{"role":"local","nombre":"Local L W350"}', now(), now(), now());

insert into public.platform_admins (user_id) values ('00000000-0000-4000-a350-00000000000a');

insert into public.venues (id, name, type, pais, owner_id) values
 ('00000000-0000-4000-b350-000000000001', 'Bar de L W350', 'bar', 'CL', '00000000-0000-4000-a350-000000000004');
insert into public.venue_addresses (id, venue_id, address, comuna, ciudad, activa) values
 ('00000000-0000-4000-e350-000000000001', '00000000-0000-4000-b350-000000000001', 'Calle Vieja 1', 'Ñuñoa', 'Santiago', true);

select pg_temp.ok((select role = 'musician' from public.profiles where id = '00000000-0000-4000-a350-000000000001'),
                  'arranque: M1 es músico');
select pg_temp.ok((select role is distinct from 'musician' from public.profiles where id = '00000000-0000-4000-a350-000000000003'),
                  'arranque: F no es músico');

-- 1. Quien no es admin ni dueño no escribe nada ajeno ---------------------------------------
set local role authenticated;
select pg_temp.como('00000000-0000-4000-a350-000000000002');

select pg_temp.ok(pg_temp.filas($q$update public.profiles set bio = 'hack' where id = '00000000-0000-4000-a350-000000000001'$q$) = 0,
                  'un músico no edita el perfil de otro');
select pg_temp.ok(pg_temp.filas($q$update public.venues set name = 'hack' where id = '00000000-0000-4000-b350-000000000001'$q$) = 0,
                  'un músico no edita un local ajeno');
select pg_temp.ok(pg_temp.filas($q$update public.venue_addresses set address = 'hack' where id = '00000000-0000-4000-e350-000000000001'$q$) = 0,
                  'un músico no edita la dirección de un local ajeno');
select pg_temp.falla($q$insert into public.venue_addresses (venue_id, address, comuna, ciudad) values ('00000000-0000-4000-b350-000000000001', 'hack', 'x', 'y')$q$,
                     'row-level security');
select pg_temp.falla($q$insert into storage.objects (bucket_id, name) values ('media', 'perfiles/00000000-0000-4000-a350-000000000001/w350-hack.jpg')$q$,
                     'row-level security');
select pg_temp.falla($q$insert into storage.objects (bucket_id, name) values ('media', 'locales/00000000-0000-4000-b350-000000000001/w350-hack.jpg')$q$,
                     'row-level security');

-- 2. El admin edita una cuenta de músico ----------------------------------------------------
select pg_temp.como('00000000-0000-4000-a350-00000000000a');

select pg_temp.ok(pg_temp.filas($q$update public.profiles
                                     set nombre = 'M1 por el admin', avatar = 'https://x/a.jpg', portada_x = 20,
                                         updated_at = now()
                                   where id = '00000000-0000-4000-a350-000000000001'$q$) = 1,
                  'el admin edita nombre, avatar y portada de un músico');

-- Columnas fuera de la lista.
select pg_temp.falla($q$update public.profiles set role = 'fan' where id = '00000000-0000-4000-a350-000000000001'$q$,
                     'campo no editable por el admin: role');
select pg_temp.falla($q$update public.profiles set bio = 'ok', sonopolis_pro_hasta = now() + interval '1 year' where id = '00000000-0000-4000-a350-000000000001'$q$,
                     'sonopolis_pro_hasta');
select pg_temp.falla($q$update public.profiles set available = not coalesce(available, false) where id = '00000000-0000-4000-a350-000000000001'$q$,
                     'campo no editable por el admin: available');

-- Cuentas que no son de músico: 0 filas.
select pg_temp.ok(pg_temp.filas($q$update public.profiles set bio = 'x' where id = '00000000-0000-4000-a350-000000000003'$q$) = 0,
                  'el admin no edita una cuenta fan');
select pg_temp.ok(pg_temp.filas($q$update public.profiles set bio = 'x' where id = '00000000-0000-4000-a350-000000000004'$q$) = 0,
                  'el admin no edita la cuenta de un local por profiles');

-- 3. El admin edita un local, sus direcciones y su pin --------------------------------------
select pg_temp.ok(pg_temp.filas($q$update public.venues
                                     set name = 'Bar por el admin W350', horarios = 'Jue a Sáb', lat = -33.45, lng = -70.6,
                                         portada_y = 80, updated_at = now()
                                   where id = '00000000-0000-4000-b350-000000000001'$q$) = 1,
                  'el admin edita nombre, horario, pin y portada del local');
select pg_temp.falla($q$update public.venues set owner_id = '00000000-0000-4000-a350-00000000000a' where id = '00000000-0000-4000-b350-000000000001'$q$,
                     'campo no editable por el admin: owner_id');
select pg_temp.falla($q$update public.venues set sonopolis_pro_hasta = now() where id = '00000000-0000-4000-b350-000000000001'$q$,
                     'sonopolis_pro_hasta');

-- Segunda dirección, activarla (el trigger de W-062 copia a venues) y borrar la vieja.
insert into public.venue_addresses (id, venue_id, address, comuna, ciudad, activa) values
 ('00000000-0000-4000-e350-000000000002', '00000000-0000-4000-b350-000000000001', 'Calle Nueva 2', 'Providencia', 'Santiago', false);
select public.activar_direccion_venue('00000000-0000-4000-e350-000000000002');
select pg_temp.ok(pg_temp.filas($q$delete from public.venue_addresses where id = '00000000-0000-4000-e350-000000000001'$q$) = 1,
                  'el admin borra la dirección vieja');

-- Storage.
insert into storage.objects (bucket_id, name) values
 ('media', 'perfiles/00000000-0000-4000-a350-000000000001/w350-admin.jpg'),
 ('media', 'locales/00000000-0000-4000-b350-000000000001/w350-admin.jpg');
select pg_temp.falla($q$insert into storage.objects (bucket_id, name) values ('media', 'perfiles/00000000-0000-4000-a350-000000000003/w350-admin.jpg')$q$,
                     'row-level security');
select pg_temp.falla($q$insert into storage.objects (bucket_id, name) values ('media', 'perfiles/no-es-uuid/w350-admin.jpg')$q$,
                     'row-level security');

-- 4. El dueño sigue igual ---------------------------------------------------------------------
select pg_temp.como('00000000-0000-4000-a350-000000000001');
select pg_temp.ok(pg_temp.filas($q$update public.profiles set bio = 'Bio del dueño', available = false
                                   where id = '00000000-0000-4000-a350-000000000001'$q$) = 1,
                  'el dueño edita su perfil, incluso columnas fuera de la lista del admin');
select pg_temp.falla($q$update public.profiles set sonopolis_pro_hasta = now() where id = '00000000-0000-4000-a350-000000000001'$q$,
                     'sonopolis_pro_hasta solo se cambia desde el servidor');

select pg_temp.como('00000000-0000-4000-a350-000000000004');
select pg_temp.ok(pg_temp.filas($q$update public.venues set description = 'Del dueño' where id = '00000000-0000-4000-b350-000000000001'$q$) = 1,
                  'el dueño edita su local');

-- El registro no se escribe a mano si no se es admin.
select pg_temp.falla($q$select public._admin_registrar_edicion('venues', '00000000-0000-4000-b350-000000000001', '{}', '{}')$q$,
                     'solo el admin de Sonópolis puede hacer esto');
reset role;

-- 5. Resultados en la base -------------------------------------------------------------------
select pg_temp.ok((select nombre = 'M1 por el admin' and avatar = 'https://x/a.jpg' and portada_x = 20
                          and role = 'musician' and bio = 'Bio del dueño' and sonopolis_pro_hasta is null
                     from public.profiles where id = '00000000-0000-4000-a350-000000000001'),
                  'el perfil quedó con lo del admin y lo del dueño, sin cambiar rol ni Pro');
select pg_temp.ok((select name = 'Bar por el admin W350' and address = 'Calle Nueva 2' and comuna = 'Providencia'
                          and owner_id = '00000000-0000-4000-a350-000000000004' and description = 'Del dueño'
                     from public.venues where id = '00000000-0000-4000-b350-000000000001'),
                  'el local quedó con la dirección nueva y el mismo dueño');
select pg_temp.ok((select count(*) = 2 from storage.objects where name like '%/w350-admin.jpg'),
                  'las dos fotos del admin quedaron en Storage');

-- Registro: una fila por edición directa del admin, solo con las columnas que cambiaron.
select pg_temp.ok((select count(*) = 1 from public.admin_ediciones
                    where por = '00000000-0000-4000-a350-00000000000a' and tabla = 'profiles'
                      and fila_id = '00000000-0000-4000-a350-000000000001' and accion = 'editar'
                      and despues = '{"nombre":"M1 por el admin","avatar":"https://x/a.jpg","portada_x":20}'::jsonb
                      and antes->>'nombre' = 'Músico M1 W350'),
                  'admin_ediciones: el perfil, solo nombre, avatar y portada_x');
select pg_temp.ok((select count(*) >= 2 from public.admin_ediciones
                    where por = '00000000-0000-4000-a350-00000000000a' and tabla = 'venues'
                      and fila_id = '00000000-0000-4000-b350-000000000001'),
                  'admin_ediciones: el local (edición directa y la dirección copiada por W-062)');
select pg_temp.ok((select count(*) = 0 from public.admin_ediciones
                    where por in ('00000000-0000-4000-a350-000000000001', '00000000-0000-4000-a350-000000000004')),
                  'las ediciones del dueño no dejan registro');
select pg_temp.ok((select count(*) = 0 from public.admin_ediciones
                    where por = '00000000-0000-4000-a350-00000000000a' and despues ? 'role'),
                  'los intentos rechazados no dejan registro');

select 'W-350: todo OK' as resultado;
