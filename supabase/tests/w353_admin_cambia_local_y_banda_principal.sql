-- Pruebas de W-353 (el admin cambia el local y la banda principal de un evento).
-- Ver sonopolisWeb/specs/w353-datos-admin-cambia-local-y-banda-principal.md
--
-- Corre DENTRO de una transacción que se revierte: no deja nada.
--   supabase/tests/correr.sh supabase/tests/w353_admin_cambia_local_y_banda_principal.sql [migración.sql]
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

create function pg_temp.como(usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', usuario, 'role', 'authenticated')::text, true);
end $$;

-- ¿Es colaborador del evento? Devuelve el rol o null. Se lee como postgres (sin RLS).
create function pg_temp.rol(evento uuid, usuario uuid) returns text language sql as $$
  select role || '/' || source from public.event_collaborators where event_id = evento and user_id = usuario
$$;

-- Cuentas: A admin (rol fan), L1 y L2 locales con su local, M1..M3 músicos.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-4000-a353-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'admin@prueba-w353.test', '{"role":"fan","nombre":"Admin W353"}', now(), now(), now()),
 ('00000000-0000-4000-a353-00000000001a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'l1@prueba-w353.test', '{"role":"local","nombre":"Local L1 W353"}', now(), now(), now()),
 ('00000000-0000-4000-a353-00000000002a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'l2@prueba-w353.test', '{"role":"local","nombre":"Local L2 W353"}', now(), now(), now()),
 ('00000000-0000-4000-a353-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm1@prueba-w353.test', '{"role":"musician","nombre":"Músico M1 W353"}', now(), now(), now()),
 ('00000000-0000-4000-a353-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm2@prueba-w353.test', '{"role":"musician","nombre":"Músico M2 W353"}', now(), now(), now()),
 ('00000000-0000-4000-a353-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm3@prueba-w353.test', '{"role":"musician","nombre":"Músico M3 W353"}', now(), now(), now());

insert into public.platform_admins (user_id) values ('00000000-0000-4000-a353-00000000000a');

insert into public.venues (id, name, type, pais, owner_id) values
 ('00000000-0000-4000-b353-000000000001', 'Bar Uno W353', 'bar', 'CL', '00000000-0000-4000-a353-00000000001a'),
 ('00000000-0000-4000-b353-000000000002', 'Bar Dos W353', 'bar', 'CL', '00000000-0000-4000-a353-00000000002a');

insert into public.artists (id, name, created_by) values
 ('00000000-0000-4000-c353-000000000001', 'Ficha F1 W353', '00000000-0000-4000-a353-00000000001a');

-- E1: lo creó L1 en su Bar Uno, principal la ficha F1.   → L1 owner.
-- E2: lo creó M1 en el Bar Uno, principal M1.             → M1 owner, L1 admin/venue_owner.
-- E3: lo creó M1 sin local.                                → M1 owner.
insert into public.events (id, artist_name, artist_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais) values
 ('00000000-0000-4000-d353-000000000001', 'Ficha F1 W353', '00000000-0000-4000-c353-000000000001',
  '00000000-0000-4000-b353-000000000001', 'Bar Uno W353', current_date + 7, '21:00', 'Rock', 5000,
  '00000000-0000-4000-a353-00000000001a', 'CL');
insert into public.events (id, artist_name, musico_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais) values
 ('00000000-0000-4000-d353-000000000002', 'Músico M1 W353', '00000000-0000-4000-a353-000000000001',
  '00000000-0000-4000-b353-000000000001', 'Bar Uno W353', current_date + 8, '21:00', 'Rock', 5000,
  '00000000-0000-4000-a353-000000000001', 'CL'),
 ('00000000-0000-4000-d353-000000000003', 'Músico M1 W353', '00000000-0000-4000-a353-000000000001',
  null, 'Por definir', current_date + 9, '21:00', 'Rock', 5000,
  '00000000-0000-4000-a353-000000000001', 'CL');

select pg_temp.ok(pg_temp.rol('00000000-0000-4000-d353-000000000002', '00000000-0000-4000-a353-00000000001a') = 'admin/venue_owner',
                  'arranque: el dueño del local es admin de E2');

-- 1. Quien no es admin, aunque sea dueño del evento, recibe el error ------------------------
set local role authenticated;
select pg_temp.como('00000000-0000-4000-a353-00000000001a');
select pg_temp.falla($q$select public.admin_cambiar_local_evento('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-b353-000000000002')$q$,
                     'solo el admin de Sonópolis puede hacer esto');
select pg_temp.falla($q$select public.admin_cambiar_principal_evento('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-a353-000000000002', null)$q$,
                     'solo el admin de Sonópolis puede hacer esto');

-- 2. Cambiar el local ------------------------------------------------------------------------
select pg_temp.como('00000000-0000-4000-a353-00000000000a');

-- E1: el creador es el dueño del local viejo → sigue owner; el dueño del nuevo entra.
select pg_temp.ok((public.admin_cambiar_local_evento('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-b353-000000000002')
                   ->>'venue_name') = 'Bar Dos W353', 'cambiar local devuelve la fila con el nombre nuevo');
-- E2: el dueño del local viejo (venue_owner) sale; el del nuevo entra.
select public.admin_cambiar_local_evento('00000000-0000-4000-d353-000000000002', '00000000-0000-4000-b353-000000000002');
-- E3: un evento sin local recibe uno.
select public.admin_cambiar_local_evento('00000000-0000-4000-d353-000000000003', '00000000-0000-4000-b353-000000000001');
-- El mismo local otra vez: nada.
select public.admin_cambiar_local_evento('00000000-0000-4000-d353-000000000003', '00000000-0000-4000-b353-000000000001');

select pg_temp.falla($q$select public.admin_cambiar_local_evento(gen_random_uuid(), '00000000-0000-4000-b353-000000000001')$q$,
                     'no existe ese evento');
select pg_temp.falla($q$select public.admin_cambiar_local_evento('00000000-0000-4000-d353-000000000001', gen_random_uuid())$q$,
                     'no existe ese local');
reset role;

select pg_temp.ok((select venue_id = '00000000-0000-4000-b353-000000000002' and venue_name = 'Bar Dos W353' and pais = 'CL'
                     from public.events where id = '00000000-0000-4000-d353-000000000001'),
                  'E1 quedó en el Bar Dos, sin tocar el país');
select pg_temp.ok(pg_temp.rol('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-a353-00000000001a') = 'owner/claim',
                  'E1: el creador, dueño del local viejo, sigue owner');
select pg_temp.ok(pg_temp.rol('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-a353-00000000002a') = 'admin/venue_owner',
                  'E1: el dueño del local nuevo es admin');
select pg_temp.ok(pg_temp.rol('00000000-0000-4000-d353-000000000002', '00000000-0000-4000-a353-00000000001a') is null,
                  'E2: el dueño del local viejo ya no es colaborador');
select pg_temp.ok(pg_temp.rol('00000000-0000-4000-d353-000000000002', '00000000-0000-4000-a353-00000000002a') = 'admin/venue_owner',
                  'E2: el dueño del local nuevo es admin');
select pg_temp.ok(pg_temp.rol('00000000-0000-4000-d353-000000000002', '00000000-0000-4000-a353-000000000001') = 'owner/claim',
                  'E2: el creador sigue owner');
select pg_temp.ok((select venue_id = '00000000-0000-4000-b353-000000000001' from public.events where id = '00000000-0000-4000-d353-000000000003')
                  and pg_temp.rol('00000000-0000-4000-d353-000000000003', '00000000-0000-4000-a353-00000000001a') = 'admin/venue_owner',
                  'E3: el evento sin local recibió uno y su dueño es admin');

-- 3. Cambiar la banda principal --------------------------------------------------------------
set local role authenticated;
select pg_temp.como('00000000-0000-4000-a353-00000000000a');

-- E1: de la ficha F1 a la cuenta M2.
select pg_temp.ok((public.admin_cambiar_principal_evento('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-a353-000000000002', null)
                   ->>'artist_name') = 'Músico M2 W353', 'cambiar principal devuelve la fila con el nombre nuevo');
-- M3 entra como adicional (con la sesión del admin: el trigger lo hace admin del evento).
insert into public.event_artists (event_id, musico_id, orden) values
 ('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-a353-000000000003', 1);
-- De M2 a M3, que estaba de adicional.
select public.admin_cambiar_principal_evento('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-a353-000000000003', null);
-- M2 vuelve como adicional; la principal pasa de M3 a la ficha F1: M2 conserva su admin.
insert into public.event_artists (event_id, musico_id, orden) values
 ('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-a353-000000000002', 1);
select public.admin_cambiar_principal_evento('00000000-0000-4000-d353-000000000001', null, '00000000-0000-4000-c353-000000000001');
-- La misma otra vez: nada.
select public.admin_cambiar_principal_evento('00000000-0000-4000-d353-000000000001', null, '00000000-0000-4000-c353-000000000001');

select pg_temp.falla($q$select public.admin_cambiar_principal_evento('00000000-0000-4000-d353-000000000001', null, null)$q$,
                     'elige una cuenta o una ficha');
select pg_temp.falla($q$select public.admin_cambiar_principal_evento('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-a353-000000000002', '00000000-0000-4000-c353-000000000001')$q$,
                     'elige una cuenta o una ficha');
select pg_temp.falla($q$select public.admin_cambiar_principal_evento('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-a353-00000000002a', null)$q$,
                     'esa cuenta no es de músico');
select pg_temp.falla($q$select public.admin_cambiar_principal_evento('00000000-0000-4000-d353-000000000001', null, gen_random_uuid())$q$,
                     'no existe esa ficha');
reset role;

select pg_temp.ok((select artist_id = '00000000-0000-4000-c353-000000000001' and musico_id is null and artist_name = 'Ficha F1 W353'
                     from public.events where id = '00000000-0000-4000-d353-000000000001'),
                  'E1 terminó con la ficha F1 de principal');
select pg_temp.ok(pg_temp.rol('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-a353-000000000003') is null,
                  'M3, que dejó de ser principal y no es adicional, ya no es admin');
select pg_temp.ok(pg_temp.rol('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-a353-000000000002') = 'admin/artist',
                  'M2, adicional, conserva su admin');
select pg_temp.ok((select count(*) = 1 from public.event_artists where event_id = '00000000-0000-4000-d353-000000000001'),
                  'E1 tiene una sola adicional (M2): la fila adicional de M3 se borró al hacerla principal');
select pg_temp.ok(pg_temp.rol('00000000-0000-4000-d353-000000000001', '00000000-0000-4000-a353-00000000001a') = 'owner/claim',
                  'el creador de E1 sigue owner después de todo');

-- 4. Registro ---------------------------------------------------------------------------------
-- 3 cambios de local (E1, E2, E3; el repetido no) + 3 de principal (el repetido no).
select pg_temp.ok((select count(*) = 6 from public.admin_ediciones
                    where por = '00000000-0000-4000-a353-00000000000a' and tabla = 'events' and accion = 'editar'),
                  'admin_ediciones: una fila por cambio real');
select pg_temp.ok((select count(*) = 1 from public.admin_ediciones
                    where por = '00000000-0000-4000-a353-00000000000a' and fila_id = '00000000-0000-4000-d353-000000000003'
                      and antes->>'venue_id' is null and despues->>'venue_name' = 'Bar Uno W353'),
                  'admin_ediciones: E3 guarda antes y después del local');

select 'W-353: todo OK' as resultado;
