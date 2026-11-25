-- Pruebas de W-347 (la cuenta de músico es la banda del evento).
-- Ver sonopolisWeb/specs/w347-datos-cuenta-de-musico-es-la-banda.md
--
-- Corre DENTRO de una transacción que se revierte: no deja nada.
--   supabase/tests/correr.sh supabase/tests/w347_cuenta_de_musico_es_la_banda.sql [migración.sql]
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

-- Cuentas: A (admin de Sonópolis), L (local, dueño de un local y creador de los eventos),
-- M1 y M2 (músicos), ED (músico que será editor, no admin, de un evento de L).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-4000-a347-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'admin@prueba-w347.test', '{"role":"musician","nombre":"Admin W347"}', now(), now(), now()),
 ('00000000-0000-4000-a347-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm1@prueba-w347.test', '{"role":"musician","nombre":"Músico M1 W347"}', now(), now(), now()),
 ('00000000-0000-4000-a347-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm2@prueba-w347.test', '{"role":"musician","nombre":"Músico M2 W347"}', now(), now(), now()),
 ('00000000-0000-4000-a347-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'l@prueba-w347.test', '{"role":"local","nombre":"Local L W347"}', now(), now(), now()),
 ('00000000-0000-4000-a347-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'ed@prueba-w347.test', '{"role":"musician","nombre":"Editor ED W347"}', now(), now(), now());

insert into public.platform_admins (user_id) values ('00000000-0000-4000-a347-00000000000a');

insert into public.venues (id, name, type, pais, owner_id) values
 ('00000000-0000-4000-b347-000000000001', 'Bar de L W347', 'bar', 'CL', '00000000-0000-4000-a347-000000000003');

-- Fichas (las creó L):
--   F0: sin cuenta, de relleno.   FC: con cuenta (M2), como la dejaría la app móvil.
--   FS: sin cuenta, con evento principal y adicional, para la invitación.   FQ: principal del otro evento.
--   FV: sin cuenta, para admin_vincular_banda.   FW: sin cuenta, adicional de un evento de FV.
insert into public.artists (id, name, created_by, profile_id) values
 ('00000000-0000-4000-c347-000000000000', 'Ficha Cero W347',   '00000000-0000-4000-a347-000000000003', null),
 ('00000000-0000-4000-c347-0000000000cc', 'Ficha Cuenta W347', '00000000-0000-4000-a347-000000000003', '00000000-0000-4000-a347-000000000002'),
 ('00000000-0000-4000-c347-0000000000a1', 'Ficha FS W347',     '00000000-0000-4000-a347-000000000003', null),
 ('00000000-0000-4000-c347-0000000000a2', 'Ficha FQ W347',     '00000000-0000-4000-a347-000000000003', null),
 ('00000000-0000-4000-c347-0000000000b1', 'Ficha FV W347',     '00000000-0000-4000-a347-000000000003', null),
 ('00000000-0000-4000-c347-0000000000b2', 'Ficha FW W347',     '00000000-0000-4000-a347-000000000003', null);

-- 1. Un evento con la cuenta como banda principal ---------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a347-000000000003","role":"authenticated"}', true);

insert into public.events (id, artist_name, musico_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais) values
 ('00000000-0000-4000-d347-000000000001', 'Músico M1 W347', '00000000-0000-4000-a347-000000000001',
  '00000000-0000-4000-b347-000000000001', 'Bar de L W347', current_date + 7, '21:00', 'Rock', 5000,
  '00000000-0000-4000-a347-000000000003', 'CL');
reset role;
select pg_temp.ok(exists (select 1 from public.event_collaborators
                           where event_id = '00000000-0000-4000-d347-000000000001'
                             and user_id = '00000000-0000-4000-a347-000000000001'
                             and role = 'admin' and can_delete = false and source = 'artist'),
                  'evento con musico_id: la cuenta queda admin');
select pg_temp.ok(exists (select 1 from public.event_collaborators
                           where event_id = '00000000-0000-4000-d347-000000000001'
                             and user_id = '00000000-0000-4000-a347-000000000003' and role = 'owner'),
                  'evento con musico_id: el creador sigue owner');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a347-000000000003","role":"authenticated"}', true);

-- Una cuenta de local no es banda.
select pg_temp.falla($q$insert into public.events (id, artist_name, musico_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais) values
 (gen_random_uuid(), 'X', '00000000-0000-4000-a347-000000000003', '00000000-0000-4000-b347-000000000001', 'Bar de L W347',
  current_date + 7, '21:00', 'Rock', 5000, '00000000-0000-4000-a347-000000000003', 'CL')$q$,
  'esa cuenta no es de músico');
-- Una ficha y una cuenta a la vez, no.
select pg_temp.falla($q$insert into public.events (id, artist_name, artist_id, musico_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais) values
 (gen_random_uuid(), 'X', '00000000-0000-4000-c347-000000000000', '00000000-0000-4000-a347-000000000001',
  '00000000-0000-4000-b347-000000000001', 'Bar de L W347', current_date + 7, '21:00', 'Rock', 5000,
  '00000000-0000-4000-a347-000000000003', 'CL')$q$,
  'events_una_banda_principal');

-- 2. Una cuenta como banda adicional -------------------------------------------------------------
-- L (owner) agrega a M2: queda admin. Sacarla le quita el admin.
insert into public.event_artists (event_id, musico_id, orden) values
 ('00000000-0000-4000-d347-000000000001', '00000000-0000-4000-a347-000000000002', 1);
reset role;
select pg_temp.ok(exists (select 1 from public.event_collaborators
                           where event_id = '00000000-0000-4000-d347-000000000001'
                             and user_id = '00000000-0000-4000-a347-000000000002'
                             and role = 'admin' and source = 'artist'),
                  'adicional con musico_id: quien maneja el equipo le da admin');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a347-000000000003","role":"authenticated"}', true);

-- La misma cuenta dos veces en el mismo evento, no.
select pg_temp.falla($q$insert into public.event_artists (event_id, musico_id) values
 ('00000000-0000-4000-d347-000000000001', '00000000-0000-4000-a347-000000000002')$q$,
  'event_artists_evento_musico_uq');
-- La principal no se repite como adicional.
select pg_temp.falla($q$insert into public.event_artists (event_id, musico_id) values
 ('00000000-0000-4000-d347-000000000001', '00000000-0000-4000-a347-000000000001')$q$,
  'esa banda ya es la principal del evento');
-- Una cuenta de local no entra al lineup.
select pg_temp.falla($q$insert into public.event_artists (event_id, musico_id) values
 ('00000000-0000-4000-d347-000000000001', '00000000-0000-4000-a347-000000000003')$q$,
  'esa cuenta no es de músico');
-- Ficha y cuenta a la vez, o ninguna, no.
select pg_temp.falla($q$insert into public.event_artists (event_id, artist_id, musico_id) values
 ('00000000-0000-4000-d347-000000000001', '00000000-0000-4000-c347-000000000000', '00000000-0000-4000-a347-000000000004')$q$,
  'event_artists_ficha_o_cuenta');
select pg_temp.falla($q$insert into public.event_artists (event_id) values ('00000000-0000-4000-d347-000000000001')$q$,
  'event_artists_ficha_o_cuenta');

delete from public.event_artists
 where event_id = '00000000-0000-4000-d347-000000000001' and musico_id = '00000000-0000-4000-a347-000000000002';
reset role;
select pg_temp.ok(not exists (select 1 from public.event_collaborators
                               where event_id = '00000000-0000-4000-d347-000000000001'
                                 and user_id = '00000000-0000-4000-a347-000000000002'),
                  'sacar a la cuenta adicional le quita el admin');

-- Salvo que siga como principal: M2 entra como adicional de E2 (principal F0) y después
-- pasa a ser la principal; al sacar su fila adicional conserva el admin.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a347-000000000003","role":"authenticated"}', true);
insert into public.events (id, artist_name, artist_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais) values
 ('00000000-0000-4000-d347-000000000002', 'Ficha Cero W347', '00000000-0000-4000-c347-000000000000',
  '00000000-0000-4000-b347-000000000001', 'Bar de L W347', current_date + 8, '21:00', 'Rock', 5000,
  '00000000-0000-4000-a347-000000000003', 'CL');
insert into public.event_artists (event_id, musico_id) values
 ('00000000-0000-4000-d347-000000000002', '00000000-0000-4000-a347-000000000002');
update public.events set musico_id = '00000000-0000-4000-a347-000000000002', artist_id = null
 where id = '00000000-0000-4000-d347-000000000002';
delete from public.event_artists
 where event_id = '00000000-0000-4000-d347-000000000002' and musico_id = '00000000-0000-4000-a347-000000000002';
reset role;
select pg_temp.ok(exists (select 1 from public.event_collaborators
                           where event_id = '00000000-0000-4000-d347-000000000002'
                             and user_id = '00000000-0000-4000-a347-000000000002' and source = 'artist'),
                  'sacar la fila adicional conserva el admin si la cuenta sigue como principal');

-- Un editor (no maneja el equipo) agrega a una cuenta: queda en el lineup, sin admin.
insert into public.event_collaborators (event_id, user_id, role, can_delete, source) values
 ('00000000-0000-4000-d347-000000000001', '00000000-0000-4000-a347-000000000004', 'editor', false, 'invited');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a347-000000000004","role":"authenticated"}', true);
insert into public.event_artists (event_id, musico_id) values
 ('00000000-0000-4000-d347-000000000001', '00000000-0000-4000-a347-000000000002');
reset role;
select pg_temp.ok(exists (select 1 from public.event_artists
                           where event_id = '00000000-0000-4000-d347-000000000001'
                             and musico_id = '00000000-0000-4000-a347-000000000002'),
                  'un editor sí agrega la cuenta al lineup');
select pg_temp.ok(not exists (select 1 from public.event_collaborators
                               where event_id = '00000000-0000-4000-d347-000000000001'
                                 and user_id = '00000000-0000-4000-a347-000000000002'),
                  'un editor no fabrica un admin agregando una cuenta');

-- 3. Normalización: ningún evento apunta a una ficha con cuenta ---------------------------------
-- FC es la ficha de M2. Un evento y una fila adicional escritos con FC quedan con la cuenta.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a347-000000000003","role":"authenticated"}', true);
insert into public.events (id, artist_name, artist_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais) values
 ('00000000-0000-4000-d347-000000000003', 'Ficha Cuenta W347', '00000000-0000-4000-c347-0000000000cc',
  '00000000-0000-4000-b347-000000000001', 'Bar de L W347', current_date + 9, '21:00', 'Rock', 5000,
  '00000000-0000-4000-a347-000000000003', 'CL');
insert into public.event_artists (event_id, artist_id) values
 ('00000000-0000-4000-d347-000000000001', '00000000-0000-4000-c347-0000000000cc');  -- M2 ya está (paso 2)
reset role;
select pg_temp.ok((select artist_id is null and musico_id = '00000000-0000-4000-a347-000000000002'
                     from public.events where id = '00000000-0000-4000-d347-000000000003'),
                  'normalización: el evento con la ficha de M2 queda con musico_id = M2');
select pg_temp.ok(exists (select 1 from public.event_collaborators
                           where event_id = '00000000-0000-4000-d347-000000000003'
                             and user_id = '00000000-0000-4000-a347-000000000002' and source = 'artist'),
                  'normalización: M2 queda admin del evento escrito con su ficha');
select pg_temp.ok((select count(*) = 1 from public.event_artists
                    where event_id = '00000000-0000-4000-d347-000000000001'
                      and musico_id = '00000000-0000-4000-a347-000000000002'),
                  'normalización: si la cuenta ya está en el evento, la fila de su ficha no se escribe');
select pg_temp.ok(not exists (select 1 from public.event_artists
                               where event_id = '00000000-0000-4000-d347-000000000001'
                                 and artist_id = '00000000-0000-4000-c347-0000000000cc'),
                  'normalización: no queda ninguna fila adicional con la ficha de la cuenta');

-- Una fila adicional nueva con la ficha de M2 pasa a la cuenta.
insert into public.event_artists (event_id, artist_id) values
 ('00000000-0000-4000-d347-000000000002', '00000000-0000-4000-c347-0000000000cc');  -- E2: M2 ya es la principal
select pg_temp.ok((select count(*) = 0 from public.event_artists
                    where event_id = '00000000-0000-4000-d347-000000000002'),
                  'normalización: la ficha de la cuenta principal no entra como adicional');
insert into public.event_artists (event_id, artist_id) values
 ('00000000-0000-4000-d347-000000000003', '00000000-0000-4000-c347-0000000000cc');  -- E3: M2 ya es la principal
select pg_temp.ok((select count(*) = 0 from public.event_artists
                    where event_id = '00000000-0000-4000-d347-000000000003'),
                  'normalización: tampoco en el evento creado con su ficha');
-- Sin cuenta ya en el evento: la fila queda con musico_id.
delete from public.event_artists
 where event_id = '00000000-0000-4000-d347-000000000001' and musico_id = '00000000-0000-4000-a347-000000000002';
insert into public.event_artists (event_id, artist_id) values
 ('00000000-0000-4000-d347-000000000001', '00000000-0000-4000-c347-0000000000cc');
select pg_temp.ok((select artist_id is null and musico_id = '00000000-0000-4000-a347-000000000002'
                     from public.event_artists where event_id = '00000000-0000-4000-d347-000000000001'),
                  'normalización: la fila adicional escrita con la ficha de M2 queda con musico_id');

-- La app móvil cambia la banda de un evento que tenía una cuenta: solo escribe artist_id,
-- y la banda nueva reemplaza a la cuenta (sin esto, el check le rompería la edición).
update public.events set artist_id = '00000000-0000-4000-c347-000000000000'
 where id = '00000000-0000-4000-d347-000000000001';
select pg_temp.ok((select artist_id = '00000000-0000-4000-c347-000000000000' and musico_id is null
                     from public.events where id = '00000000-0000-4000-d347-000000000001'),
                  'la app móvil puede cambiar la banda de un evento con cuenta (artist_id reemplaza a musico_id)');
-- Y si cambia a la ficha de una cuenta, queda la cuenta.
update public.events set artist_id = '00000000-0000-4000-c347-0000000000cc'
 where id = '00000000-0000-4000-d347-000000000001';
select pg_temp.ok((select artist_id is null and musico_id = '00000000-0000-4000-a347-000000000002'
                     from public.events where id = '00000000-0000-4000-d347-000000000001'),
                  'la app móvil cambia a la ficha de una cuenta: queda musico_id');

-- 4. Invitación W-302 sobre una ficha suelta -------------------------------------------------------
-- FS es principal de E4 y adicional de E5 (principal FQ). Se invita a su banda; al aceptar, los
-- dos eventos pasan a la cuenta, la cuenta es admin de los dos y la ficha desaparece.
insert into public.events (id, artist_name, artist_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais) values
 ('00000000-0000-4000-d347-000000000004', 'Ficha FS W347', '00000000-0000-4000-c347-0000000000a1',
  '00000000-0000-4000-b347-000000000001', 'Bar de L W347', current_date + 10, '21:00', 'Rock', 5000,
  '00000000-0000-4000-a347-000000000003', 'CL'),
 ('00000000-0000-4000-d347-000000000005', 'Ficha FQ W347', '00000000-0000-4000-c347-0000000000a2',
  '00000000-0000-4000-b347-000000000001', 'Bar de L W347', current_date + 11, '21:00', 'Rock', 5000,
  '00000000-0000-4000-a347-000000000003', 'CL');
insert into public.event_artists (event_id, artist_id, orden) values
 ('00000000-0000-4000-d347-000000000005', '00000000-0000-4000-c347-0000000000a1', 1);
insert into public.sonopolis_invites (email, nombre, artist_id, invited_by) values
 ('fs@prueba-w347.test', 'Ficha FS W347', '00000000-0000-4000-c347-0000000000a1', '00000000-0000-4000-a347-000000000003');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-4000-a347-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'fs@prueba-w347.test', '{"role":"musician","nombre":"Banda FS W347"}', now(), now(), now());

select pg_temp.ok((select status = 'accepted' and artist_id is null and accepted_by = '00000000-0000-4000-a347-0000000000f1'
                     from public.sonopolis_invites where email = 'fs@prueba-w347.test'),
                  'invitación: queda aceptada y sin ficha');
select pg_temp.ok((select artist_id is null and musico_id = '00000000-0000-4000-a347-0000000000f1'
                     from public.events where id = '00000000-0000-4000-d347-000000000004'),
                  'invitación: el evento donde la ficha era principal pasa a la cuenta');
select pg_temp.ok((select count(*) = 1 from public.event_artists
                    where event_id = '00000000-0000-4000-d347-000000000005'
                      and musico_id = '00000000-0000-4000-a347-0000000000f1' and artist_id is null),
                  'invitación: el evento donde era adicional también');
select pg_temp.ok((select count(*) = 2 from public.event_collaborators
                    where user_id = '00000000-0000-4000-a347-0000000000f1' and role = 'admin' and source = 'artist'
                      and event_id in ('00000000-0000-4000-d347-000000000004', '00000000-0000-4000-d347-000000000005')),
                  'invitación: la cuenta es admin de los dos eventos');
select pg_temp.ok(not exists (select 1 from public.artists where id = '00000000-0000-4000-c347-0000000000a1'),
                  'invitación: la ficha ya no existe');
select pg_temp.ok(not exists (select 1 from public.artists where profile_id = '00000000-0000-4000-a347-0000000000f1'),
                  'invitación: no se crea otra ficha para la cuenta');
select pg_temp.ok((select role = 'musician' from public.profiles where id = '00000000-0000-4000-a347-0000000000f1'),
                  'invitación: la cuenta es de músico');

-- 5. admin_vincular_banda / admin_desvincular_banda ---------------------------------------------------
-- FV es principal de E6 y FW adicional de E7 (principal FV): vincular FV con M1 deja a M1 como
-- principal de E6 y E7, el admin de los dos, y la ficha desaparece. La fila adicional de FW no se toca.
insert into public.events (id, artist_name, artist_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais) values
 ('00000000-0000-4000-d347-000000000006', 'Ficha FV W347', '00000000-0000-4000-c347-0000000000b1',
  '00000000-0000-4000-b347-000000000001', 'Bar de L W347', current_date + 12, '21:00', 'Rock', 5000,
  '00000000-0000-4000-a347-000000000003', 'CL'),
 ('00000000-0000-4000-d347-000000000007', 'Ficha FV W347', '00000000-0000-4000-c347-0000000000b1',
  '00000000-0000-4000-b347-000000000001', 'Bar de L W347', current_date + 13, '21:00', 'Rock', 5000,
  '00000000-0000-4000-a347-000000000003', 'CL');
insert into public.event_artists (event_id, artist_id, orden) values
 ('00000000-0000-4000-d347-000000000007', '00000000-0000-4000-c347-0000000000b2', 1);

-- Quien no es admin, no.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a347-000000000001","role":"authenticated"}', true);
select pg_temp.falla($q$select public.admin_vincular_banda('00000000-0000-4000-c347-0000000000b1', '00000000-0000-4000-a347-000000000001')$q$,
                     'solo el admin de Sonópolis puede hacer esto');
select pg_temp.falla($q$select public.admin_desvincular_banda('00000000-0000-4000-c347-0000000000b1')$q$,
                     'solo el admin de Sonópolis puede hacer esto');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a347-00000000000a","role":"authenticated"}', true);
select pg_temp.falla($q$select public.admin_vincular_banda('00000000-0000-4000-c347-0000000000b1', '00000000-0000-4000-a347-000000000003')$q$,
                     'esa cuenta no es de músico');
select pg_temp.falla($q$select public.admin_vincular_banda('00000000-0000-4000-c347-0000000000b1', gen_random_uuid())$q$,
                     'no existe esa cuenta');
select pg_temp.falla($q$select public.admin_vincular_banda(gen_random_uuid(), '00000000-0000-4000-a347-000000000001')$q$,
                     'no existe esa ficha');
select pg_temp.falla($q$select public.admin_vincular_banda('00000000-0000-4000-c347-0000000000cc', '00000000-0000-4000-a347-000000000001')$q$,
                     'esa ficha ya está conectada a una cuenta; desconéctala primero');

select public.admin_vincular_banda('00000000-0000-4000-c347-0000000000b1', '00000000-0000-4000-a347-000000000001');
reset role;
select pg_temp.ok((select count(*) = 2 from public.events
                    where musico_id = '00000000-0000-4000-a347-000000000001' and artist_id is null
                      and id in ('00000000-0000-4000-d347-000000000006', '00000000-0000-4000-d347-000000000007')),
                  'vincular: los dos eventos de la ficha pasan a la cuenta');
select pg_temp.ok((select count(*) = 2 from public.event_collaborators
                    where user_id = '00000000-0000-4000-a347-000000000001' and role = 'admin' and source = 'artist'
                      and event_id in ('00000000-0000-4000-d347-000000000006', '00000000-0000-4000-d347-000000000007')),
                  'vincular: la cuenta es admin de los dos');
select pg_temp.ok(not exists (select 1 from public.artists where id = '00000000-0000-4000-c347-0000000000b1'),
                  'vincular: la ficha ya no existe');
select pg_temp.ok(exists (select 1 from public.event_artists
                           where event_id = '00000000-0000-4000-d347-000000000007'
                             and artist_id = '00000000-0000-4000-c347-0000000000b2'),
                  'vincular: la fila adicional de otra ficha no se toca');
select pg_temp.ok((select count(*) = 1 from public.admin_ediciones
                    where tabla = 'artists' and accion = 'vincular'
                      and fila_id = '00000000-0000-4000-c347-0000000000b1'
                      and antes->>'name' = 'Ficha FV W347' and antes->>'profile_id' is null
                      and (despues->>'eventos_principal')::int = 2
                      and por = '00000000-0000-4000-a347-00000000000a'),
                  'vincular deja su fila en admin_ediciones: antes = la ficha, despues = el resumen');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a347-00000000000a","role":"authenticated"}', true);
select pg_temp.falla($q$select public.admin_desvincular_banda('00000000-0000-4000-c347-0000000000cc')$q$,
                     'una banda con cuenta ya no tiene ficha; no hay qué desconectar');
reset role;

-- 6. El CRM y el muro leen la cuenta -------------------------------------------------------------------
-- Un comprador de E6 (principal M1) entra a la base de M1 y del local.
insert into public.tickets (evento_id, status, monto, cantidad, moneda, pais_cobro, pasarela, guest_email, comprador_email)
values ('00000000-0000-4000-d347-000000000006', 'completed', 5000, 2, 'CLP', 'CL', 'mercadopago',
        'fan1@prueba-w347.test', 'fan1@prueba-w347.test');
select pg_temp.ok(exists (select 1 from privado.crm_base
                           where tenant_type = 'musician' and tenant_id = '00000000-0000-4000-a347-000000000001'
                             and email = 'fan1@prueba-w347.test' and entradas = 2),
                  'crm_base: el comprador entra a la base de la cuenta principal');
select pg_temp.ok(exists (select 1 from privado.crm_base
                           where tenant_type = 'venue' and tenant_id = '00000000-0000-4000-b347-000000000001'
                             and email = 'fan1@prueba-w347.test'),
                  'crm_base: y a la del local');
-- Un comprador de E5 (adicional: la cuenta de FS) entra a la base de esa cuenta.
insert into public.tickets (evento_id, status, monto, cantidad, moneda, pais_cobro, pasarela, guest_email, comprador_email)
values ('00000000-0000-4000-d347-000000000005', 'completed', 5000, 1, 'CLP', 'CL', 'mercadopago',
        'fan2@prueba-w347.test', 'fan2@prueba-w347.test');
select pg_temp.ok(exists (select 1 from privado.crm_base
                           where tenant_type = 'musician' and tenant_id = '00000000-0000-4000-a347-0000000000f1'
                             and email = 'fan2@prueba-w347.test'),
                  'crm_base: el comprador entra a la base de la cuenta adicional');

-- Muro: un evento pasado con flyer es del músico principal y del adicional (por cuenta).
update public.events set comienza_at = now() - interval '3 days', imagen = 'x.jpg'
 where id in ('00000000-0000-4000-d347-000000000006', '00000000-0000-4000-d347-000000000005');
select pg_temp.ok(public.muro_evento_es_de('musician', '00000000-0000-4000-a347-000000000001', '00000000-0000-4000-d347-000000000006'),
                  'muro: el evento es de la cuenta principal (musico_id)');
select pg_temp.ok(public.muro_evento_es_de('musician', '00000000-0000-4000-a347-0000000000f1', '00000000-0000-4000-d347-000000000005'),
                  'muro: el evento es de la cuenta adicional (event_artists.musico_id)');
select pg_temp.ok(not public.muro_evento_es_de('musician', '00000000-0000-4000-a347-000000000004', '00000000-0000-4000-d347-000000000006'),
                  'muro: no es de una cuenta que no toca en él');

-- 7. Criterio de la migración ----------------------------------------------------------------------------
-- Ningún evento apunta a una ficha con cuenta (la migración convirtió las de hoy). Las dos
-- fichas con cuenta de estas pruebas (FC) se normalizan al escribir el evento, así que tampoco cuentan.
select pg_temp.ok((select count(*) from public.events e join public.artists a on a.id = e.artist_id
                    where a.profile_id is not null) = 0,
                  'después de la migración ningún evento apunta a una ficha con cuenta');
select pg_temp.ok((select count(*) from public.event_artists ea join public.artists a on a.id = ea.artist_id
                    where a.profile_id is not null) = 0,
                  'después de la migración ninguna fila adicional apunta a una ficha con cuenta');

select 'W-347: todo OK' as resultado;
