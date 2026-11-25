-- Pruebas de W-344 (punto de la portada del músico y del local).
-- Ver sonopolisWeb/specs/w344-datos-punto-de-la-portada.md
--
-- Corre DENTRO de una transacción que se revierte: no deja nada.
--   supabase/tests/correr.sh supabase/tests/w344_punto_de_la_portada.sql [migración.sql]
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

-- Cuentas: A (músico, con su local) y B (otro músico, con otro local).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-4000-a344-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'a@prueba-w344.test', '{"role":"musician","nombre":"Banda A W344"}', now(), now(), now()),
 ('00000000-0000-4000-a344-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'b@prueba-w344.test', '{"role":"musician","nombre":"Banda B W344"}', now(), now(), now());

insert into public.venues (id, name, type, pais, owner_id, image) values
 ('00000000-0000-4000-b344-000000000001', 'Bar de A W344', 'bar', 'CL', '00000000-0000-4000-a344-000000000001', 'https://x.test/a1.jpg'),
 ('00000000-0000-4000-b344-000000000002', 'Bar de B W344', 'bar', 'CL', '00000000-0000-4000-a344-000000000002', 'https://x.test/b1.jpg');

-- Las filas existentes quedan en el centro (el default no mueve nada) ----------------------
select pg_temp.ok((select count(*) from public.profiles where portada_x <> 50 or portada_y <> 50) = 0,
                  'todos los perfiles quedan en 50, 50');
select pg_temp.ok((select count(*) from public.venues where portada_x <> 50 or portada_y <> 50) = 0,
                  'todos los locales quedan en 50, 50');

-- A entra --------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a344-000000000001","role":"authenticated"}', true);

-- El dueño cambia el punto de su perfil y de su local.
update public.profiles set portada_x = 20, portada_y = 30 where id = '00000000-0000-4000-a344-000000000001';
select pg_temp.ok((select portada_x = 20 and portada_y = 30 from public.profiles
                   where id = '00000000-0000-4000-a344-000000000001'), 'A guarda el punto de su perfil');
update public.venues set portada_x = 10, portada_y = 90 where id = '00000000-0000-4000-b344-000000000001';
select pg_temp.ok((select portada_x = 10 and portada_y = 90 from public.venues
                   where id = '00000000-0000-4000-b344-000000000001'), 'A guarda el punto de su local');

-- Otro usuario no puede cambiar el punto de un perfil ni de un local ajeno (0 filas, RLS).
do $$
declare n int;
begin
  update public.profiles set portada_x = 1, portada_y = 1 where id = '00000000-0000-4000-a344-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLA: A actualizó % fila(s) del perfil de B', n; end if;
  update public.venues set portada_x = 1, portada_y = 1 where id = '00000000-0000-4000-b344-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLA: A actualizó % fila(s) del local de B', n; end if;
end $$;

-- Fuera de rango: lanza el error del check.
select pg_temp.falla($q$update public.profiles set portada_x = 101 where id = '00000000-0000-4000-a344-000000000001'$q$,
                     'portada_x_check');
select pg_temp.falla($q$update public.profiles set portada_y = -1 where id = '00000000-0000-4000-a344-000000000001'$q$,
                     'portada_y_check');
select pg_temp.falla($q$update public.venues set portada_x = 101 where id = '00000000-0000-4000-b344-000000000001'$q$,
                     'portada_x_check');
select pg_temp.falla($q$update public.venues set portada_y = -1 where id = '00000000-0000-4000-b344-000000000001'$q$,
                     'portada_y_check');

-- Cambiar la foto sin punto nuevo vuelve a 50, 50 (A está en 20, 30 / 10, 90).
update public.profiles set foto = 'https://x.test/foto-nueva.jpg' where id = '00000000-0000-4000-a344-000000000001';
select pg_temp.ok((select portada_x = 50 and portada_y = 50 and foto = 'https://x.test/foto-nueva.jpg' from public.profiles
                   where id = '00000000-0000-4000-a344-000000000001'), 'foto nueva sin punto: el perfil vuelve a 50, 50');
update public.venues set image = 'https://x.test/a2.jpg' where id = '00000000-0000-4000-b344-000000000001';
select pg_temp.ok((select portada_x = 50 and portada_y = 50 and image = 'https://x.test/a2.jpg' from public.venues
                   where id = '00000000-0000-4000-b344-000000000001'), 'imagen nueva sin punto: el local vuelve a 50, 50');

-- Cambiar la foto CON punto nuevo guarda ese punto.
update public.profiles set foto = 'https://x.test/foto-3.jpg', portada_x = 70, portada_y = 15
  where id = '00000000-0000-4000-a344-000000000001';
select pg_temp.ok((select portada_x = 70 and portada_y = 15 from public.profiles
                   where id = '00000000-0000-4000-a344-000000000001'), 'foto nueva con punto: el perfil guarda el punto');
update public.venues set image = 'https://x.test/a3.jpg', portada_x = 5, portada_y = 95
  where id = '00000000-0000-4000-b344-000000000001';
select pg_temp.ok((select portada_x = 5 and portada_y = 95 from public.venues
                   where id = '00000000-0000-4000-b344-000000000001'), 'imagen nueva con punto: el local guarda el punto');

-- Un UPDATE que no toca la foto no mueve el punto.
update public.profiles set nombre = 'Banda A W344 v2' where id = '00000000-0000-4000-a344-000000000001';
select pg_temp.ok((select portada_x = 70 and portada_y = 15 from public.profiles
                   where id = '00000000-0000-4000-a344-000000000001'), 'sin tocar la foto el punto no se mueve');

select 'W-344: todas las pruebas pasaron' as resultado;
