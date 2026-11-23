-- Pruebas de W-336 (el músico invita al dueño del local que registró) y de la ficha
-- propia de W-337 (un músico crea su ficha de banda ya enlazada a su cuenta).
-- Ver sonopolisWeb/specs/w336…, w337….
--
-- Corre DENTRO de una transacción que se revierte: no deja nada.
--   supabase/tests/correr.sh supabase/tests/w336_musico_invita_dueno_de_local.sql [migración.sql]
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

create temp table tok (k text primary key, t uuid);
grant all on tok to authenticated;

-- Cuentas: M (músico, crea el evento), M2 (otro músico), L (local con su propio local).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-4000-a336-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm@prueba-w336.test', '{"role":"musician","nombre":"Banda M W336"}', now(), now(), now()),
 ('00000000-0000-4000-a336-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm2@prueba-w336.test', '{"role":"musician","nombre":"Banda M2 W336"}', now(), now(), now()),
 ('00000000-0000-4000-a336-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'l@prueba-w336.test', '{"role":"local","nombre":"Local L W336"}', now(), now(), now());

insert into public.venues (id, name, type, pais, owner_id) values
 ('00000000-0000-4000-b336-000000000003', 'Bar de L W336', 'bar', 'CL', '00000000-0000-4000-a336-000000000003');

-- M entra ---------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a336-000000000001","role":"authenticated"}', true);

-- W-337: la ficha propia nace enlazada a la cuenta de quien la crea (policy de W-307).
insert into public.artists (id, name, created_by, profile_id) values
 ('00000000-0000-4000-c336-000000000001', 'Banda M W336',
  '00000000-0000-4000-a336-000000000001', '00000000-0000-4000-a336-000000000001');
select pg_temp.falla($q$insert into public.artists (name, created_by, profile_id) values
  ('Falsa', '00000000-0000-4000-a336-000000000001', '00000000-0000-4000-a336-000000000002')$q$,
  'row-level security');

-- M registra el local al vuelo (como FormEvento) y crea su evento siendo él la banda.
insert into public.venues (id, name, type, pais, owner_id) values
 ('00000000-0000-4000-b336-000000000001', 'Bar Nuevo W336', 'bar', 'CL', '00000000-0000-4000-a336-000000000001');
insert into public.events (id, artist_name, artist_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais)
values ('00000000-0000-4000-d336-000000000001', 'Banda M W336', '00000000-0000-4000-c336-000000000001',
        '00000000-0000-4000-b336-000000000001', 'Bar Nuevo W336', current_date + 7, '21:00', 'Rock', 5000,
        '00000000-0000-4000-a336-000000000001', 'CL');
select pg_temp.ok(public.event_role_of('00000000-0000-4000-d336-000000000001') = 'owner',
                  'M sigue owner aunque también es la banda');

-- W-336: M invita al dueño real del local que registró.
insert into tok values ('m', public.invitar_dueno_local('00000000-0000-4000-b336-000000000001', ' Dueno@Prueba-W336.test '));
select pg_temp.ok((select t from tok where k = 'm') is not null, 'M obtiene token');
select public.marcar_invitacion_local_enviada((select t from tok where k = 'm'));
select pg_temp.falla($q$select public.invitar_dueno_local('00000000-0000-4000-b336-000000000001', 'dueno@prueba-w336.test')$q$,
                     'espera unos minutos');
select pg_temp.falla($q$select public.invitar_dueno_local('00000000-0000-4000-b336-000000000003', 'x@prueba-w336.test')$q$,
                     'solo puedes invitar al dueño de un local que tú registraste');
select pg_temp.falla($q$select public.invitar_dueno_local('00000000-0000-4000-b336-000000000001', 'm2@prueba-w336.test')$q$,
                     'cuenta de músico');
select pg_temp.falla($q$select public.invitar_dueno_local('00000000-0000-4000-b336-000000000001', 'l@prueba-w336.test')$q$,
                     'esa cuenta ya administra');
select pg_temp.falla($q$select public.invitar_dueno_local('00000000-0000-4000-b336-000000000001', 'no-es-correo')$q$,
                     'correo inválido');

-- M2 no puede invitar por el local de M ni marcar su invitación.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a336-000000000002","role":"authenticated"}', true);
select pg_temp.falla($q$select public.invitar_dueno_local('00000000-0000-4000-b336-000000000001', 'otro@prueba-w336.test')$q$,
                     'solo puedes invitar al dueño de un local que tú registraste');

-- L (cuenta de local) tampoco regala su propio local desde acá.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a336-000000000003","role":"authenticated"}', true);
select pg_temp.falla($q$select public.invitar_dueno_local('00000000-0000-4000-b336-000000000003', 'otro@prueba-w336.test')$q$,
                     'solo puedes invitar al dueño de un local que tú registraste');

-- El dueño se registra con el correo invitado: reclama el local (trigger de W-230).
reset role;
-- (venue_owner_invites no se lee como authenticated: RLS solo admin.)
select pg_temp.ok((select email from public.venue_owner_invites where token = (select t from tok where k = 'm'))
                  = 'dueno@prueba-w336.test', 'el correo se guarda normalizado');
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-4000-a336-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'dueno@prueba-w336.test', '{"role":"local","nombre":"Dueño W336"}', now(), now(), now());
select pg_temp.ok((select owner_id from public.venues where id = '00000000-0000-4000-b336-000000000001')
                  = '00000000-0000-4000-a336-000000000004', 'el dueño invitado queda dueño del local');
select pg_temp.ok((select role from public.event_collaborators
                    where event_id = '00000000-0000-4000-d336-000000000001'
                      and user_id = '00000000-0000-4000-a336-000000000004') = 'admin',
                  'el dueño queda admin del evento de M');
select pg_temp.ok((select role from public.event_collaborators
                    where event_id = '00000000-0000-4000-d336-000000000001'
                      and user_id = '00000000-0000-4000-a336-000000000001') = 'owner',
                  'M sigue owner del evento');

select 'OK: W-336/W-337 pruebas verdes' as resultado;
