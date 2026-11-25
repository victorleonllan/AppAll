-- Pruebas de W-341 (el admin edita músicos, bandas y locales, y conecta bandas con cuentas).
-- Ver sonopolisWeb/specs/w341-datos-admin-edita-y-conecta-bandas.md
--
-- Corre DENTRO de una transacción que se revierte: no deja nada.
--   supabase/tests/correr.sh supabase/tests/w341_admin_edita_y_conecta_bandas.sql [migración.sql]
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

-- Cuentas: A (admin de Sonópolis), M1 y M2 (músicos), L (local, dueño de un local).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-4000-a341-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'admin@prueba-w341.test', '{"role":"musician","nombre":"Admin W341"}', now(), now(), now()),
 ('00000000-0000-4000-a341-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm1@prueba-w341.test', '{"role":"musician","nombre":"Músico M1 W341"}', now(), now(), now()),
 ('00000000-0000-4000-a341-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'm2@prueba-w341.test', '{"role":"musician","nombre":"Músico M2 W341"}', now(), now(), now()),
 ('00000000-0000-4000-a341-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'l@prueba-w341.test', '{"role":"local","nombre":"Local L W341"}', now(), now(), now());

insert into public.platform_admins (user_id) values ('00000000-0000-4000-a341-00000000000a');

insert into public.venues (id, name, type, pais, owner_id) values
 ('00000000-0000-4000-b341-000000000001', 'Bar de L W341', 'bar', 'CL', '00000000-0000-4000-a341-000000000003');

-- Fichas de banda sin cuenta (las creó el local, como al cargar un evento).
--   F1..F4: pruebas de vincular / desvincular.   U1, U2, X: unir.   V1, V2: unir con invitaciones.
--   C1, C2: dos fichas de cuentas distintas.
insert into public.artists (id, name, genero, created_by) values
 ('00000000-0000-4000-c341-000000000001', 'Ficha Uno W341',   null,   '00000000-0000-4000-a341-000000000003'),
 ('00000000-0000-4000-c341-000000000002', 'Ficha Dos W341',   null,   '00000000-0000-4000-a341-000000000003'),
 ('00000000-0000-4000-c341-000000000003', 'Ficha Tres W341',  null,   '00000000-0000-4000-a341-000000000003'),
 ('00000000-0000-4000-c341-000000000004', 'Ficha Cuatro W341', null,  '00000000-0000-4000-a341-000000000003');
insert into public.artists (id, name, genero, comuna, created_by) values
 ('00000000-0000-4000-c341-0000000000a1', 'Origen U1 W341',  'Rock', 'Ñuñoa',      '00000000-0000-4000-a341-000000000003'),
 ('00000000-0000-4000-c341-0000000000a2', 'Destino U2 W341', null,   'Providencia', '00000000-0000-4000-a341-000000000003'),
 ('00000000-0000-4000-c341-0000000000a3', 'Otra X W341',     null,   null,          '00000000-0000-4000-a341-000000000003'),
 ('00000000-0000-4000-c341-0000000000b1', 'Origen V1 W341',  null,   null,          '00000000-0000-4000-a341-000000000003'),
 ('00000000-0000-4000-c341-0000000000b2', 'Destino V2 W341', null,   null,          '00000000-0000-4000-a341-000000000003'),
 ('00000000-0000-4000-c341-0000000000c1', 'Cuenta C1 W341',  null,   null,          '00000000-0000-4000-a341-000000000003'),
 ('00000000-0000-4000-c341-0000000000c2', 'Cuenta C2 W341',  null,   null,          '00000000-0000-4000-a341-000000000003');

-- Eventos (creados por L). Los triggers de events dejan a L como owner.
--   E1: principal F1, adicional F2.
--   E2: principal F3, adicionales F1 y F4.
insert into public.events (id, artist_name, artist_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais) values
 ('00000000-0000-4000-d341-000000000001', 'Ficha Uno W341',  '00000000-0000-4000-c341-000000000001', '00000000-0000-4000-b341-000000000001', 'Bar de L W341', current_date + 7, '21:00', 'Rock', 5000, '00000000-0000-4000-a341-000000000003', 'CL'),
 ('00000000-0000-4000-d341-000000000002', 'Ficha Tres W341', '00000000-0000-4000-c341-000000000003', '00000000-0000-4000-b341-000000000001', 'Bar de L W341', current_date + 8, '21:00', 'Rock', 5000, '00000000-0000-4000-a341-000000000003', 'CL');
insert into public.event_artists (event_id, artist_id, orden) values
 ('00000000-0000-4000-d341-000000000001', '00000000-0000-4000-c341-000000000002', 1),
 ('00000000-0000-4000-d341-000000000002', '00000000-0000-4000-c341-000000000001', 1),
 ('00000000-0000-4000-d341-000000000002', '00000000-0000-4000-c341-000000000004', 2);

-- 1. Quien no es admin recibe el error en cada una de las seis funciones -------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a341-000000000001","role":"authenticated"}', true);

select pg_temp.falla($q$select public.admin_editar_perfil_musico('00000000-0000-4000-a341-000000000001', '{"bio":"x"}')$q$,
                     'solo el admin de Sonópolis puede hacer esto');
select pg_temp.falla($q$select public.admin_editar_local('00000000-0000-4000-b341-000000000001', '{"name":"x"}')$q$,
                     'solo el admin de Sonópolis puede hacer esto');
select pg_temp.falla($q$select public.admin_editar_banda('00000000-0000-4000-c341-000000000001', '{"name":"x"}')$q$,
                     'solo el admin de Sonópolis puede hacer esto');
select pg_temp.falla($q$select public.admin_vincular_banda('00000000-0000-4000-c341-000000000001', '00000000-0000-4000-a341-000000000001')$q$,
                     'solo el admin de Sonópolis puede hacer esto');
select pg_temp.falla($q$select public.admin_desvincular_banda('00000000-0000-4000-c341-000000000001')$q$,
                     'solo el admin de Sonópolis puede hacer esto');
select pg_temp.falla($q$select public.admin_unir_bandas('00000000-0000-4000-c341-000000000001', '00000000-0000-4000-c341-000000000002')$q$,
                     'solo el admin de Sonópolis puede hacer esto');

-- El registro tampoco lo lee ni lo escribe quien no es admin.
select pg_temp.ok((select count(*) from public.admin_ediciones) = 0, 'un no-admin no lee admin_ediciones');
select pg_temp.falla($q$insert into public.admin_ediciones (tabla, fila_id, accion) values ('artists', gen_random_uuid(), 'editar')$q$,
                     'permission denied');

-- 2. Editar -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a341-00000000000a","role":"authenticated"}', true);

-- Músico: una columna permitida (y los tipos se convierten: array, entero, booleano).
select pg_temp.ok((public.admin_editar_perfil_musico('00000000-0000-4000-a341-000000000001',
        '{"nombre":"M1 Editado","bio":"Bio nueva","generos":["rock","pop"],"integrantes":4,"available":false}')
        ->>'nombre') = 'M1 Editado', 'editar_perfil_musico devuelve la fila actualizada');
reset role;
select pg_temp.ok((select nombre = 'M1 Editado' and bio = 'Bio nueva' and generos = array['rock','pop']
                          and integrantes = 4 and available = false and role = 'musician'
                     from public.profiles where id = '00000000-0000-4000-a341-000000000001'),
                  'editar_perfil_musico cambió la fila y no tocó el rol');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a341-00000000000a","role":"authenticated"}', true);

-- Columnas fuera de la lista.
select pg_temp.falla($q$select public.admin_editar_perfil_musico('00000000-0000-4000-a341-000000000001', '{"role":"local"}')$q$,
                     'campo no editable: role');
select pg_temp.falla($q$select public.admin_editar_perfil_musico('00000000-0000-4000-a341-000000000001', '{"sonopolis_pro_hasta":"2030-01-01"}')$q$,
                     'campo no editable: sonopolis_pro_hasta');
select pg_temp.falla($q$select public.admin_editar_perfil_musico('00000000-0000-4000-a341-000000000001', '{"bio":"ok","role":"local"}')$q$,
                     'campo no editable: role');
select pg_temp.falla($q$select public.admin_editar_local('00000000-0000-4000-b341-000000000001', '{"owner_id":"00000000-0000-4000-a341-000000000001"}')$q$,
                     'campo no editable: owner_id');
select pg_temp.falla($q$select public.admin_editar_local('00000000-0000-4000-b341-000000000001', '{"lat":1}')$q$,
                     'campo no editable: lat');
select pg_temp.falla($q$select public.admin_editar_banda('00000000-0000-4000-c341-000000000001', '{"profile_id":"00000000-0000-4000-a341-000000000001"}')$q$,
                     'campo no editable: profile_id');
select pg_temp.falla($q$select public.admin_editar_banda('00000000-0000-4000-c341-000000000001', '[]')$q$,
                     'p_datos debe ser un objeto json');

-- Una cuenta de local no se edita como músico; lo que no existe, tampoco.
select pg_temp.falla($q$select public.admin_editar_perfil_musico('00000000-0000-4000-a341-000000000003', '{"bio":"x"}')$q$,
                     'esa cuenta no es de músico');
select pg_temp.falla($q$select public.admin_editar_perfil_musico(gen_random_uuid(), '{"bio":"x"}')$q$,
                     'no existe esa cuenta');
select pg_temp.falla($q$select public.admin_editar_local(gen_random_uuid(), '{"name":"x"}')$q$,
                     'no existe ese local');
select pg_temp.falla($q$select public.admin_editar_banda(gen_random_uuid(), '{"name":"x"}')$q$,
                     'no existe esa ficha');

-- Local y ficha de banda.
select pg_temp.ok((public.admin_editar_local('00000000-0000-4000-b341-000000000001',
        '{"name":"Bar Renombrado W341","aforo":120,"tiene_escenario":true,"horarios":"Jue a Sáb"}')
        ->>'name') = 'Bar Renombrado W341', 'editar_local devuelve la fila actualizada');
select pg_temp.ok((public.admin_editar_banda('00000000-0000-4000-c341-000000000002',
        '{"name":"Ficha Dos Editada","genero":"Jazz","instagram":"@dos"}')
        ->>'genero') = 'Jazz', 'editar_banda devuelve la fila actualizada');
reset role;
select pg_temp.ok((select name = 'Bar Renombrado W341' and aforo = 120 and tiene_escenario
                          and horarios = 'Jue a Sáb' and owner_id = '00000000-0000-4000-a341-000000000003'
                     from public.venues where id = '00000000-0000-4000-b341-000000000001'),
                  'editar_local cambió la fila y no movió al dueño');
select pg_temp.ok((select name = 'Ficha Dos Editada' and genero = 'Jazz' and instagram = '@dos' and profile_id is null
                     from public.artists where id = '00000000-0000-4000-c341-000000000002'),
                  'editar_banda cambió la ficha');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a341-00000000000a","role":"authenticated"}', true);

-- 3. Vincular ------------------------------------------------------------------------------
-- F1 con M1: M1 queda admin de E1 (F1 es principal) y de E2 (F1 es adicional).
select public.admin_vincular_banda('00000000-0000-4000-c341-000000000001', '00000000-0000-4000-a341-000000000001');
-- F4 también con M1: en E2 ya es admin, no se duplica.
select public.admin_vincular_banda('00000000-0000-4000-c341-000000000004', '00000000-0000-4000-a341-000000000001');
reset role;
select pg_temp.ok((select profile_id = '00000000-0000-4000-a341-000000000001'
                     from public.artists where id = '00000000-0000-4000-c341-000000000001'),
                  'vincular: la ficha quedó con la cuenta');
select pg_temp.ok((select count(*) = 1 from public.event_collaborators
                    where event_id = '00000000-0000-4000-d341-000000000001'
                      and user_id = '00000000-0000-4000-a341-000000000001'
                      and role = 'admin' and can_delete = false and source = 'artist'),
                  'vincular: M1 admin del evento donde F1 es principal');
select pg_temp.ok((select count(*) = 1 from public.event_collaborators
                    where event_id = '00000000-0000-4000-d341-000000000002'
                      and user_id = '00000000-0000-4000-a341-000000000001'
                      and role = 'admin' and source = 'artist'),
                  'vincular: M1 admin del evento donde F1 es adicional (sin duplicar)');
select pg_temp.ok((select role = 'owner' from public.event_collaborators
                    where event_id = '00000000-0000-4000-d341-000000000001'
                      and user_id = '00000000-0000-4000-a341-000000000003'),
                  'vincular: no toca al owner del evento');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a341-00000000000a","role":"authenticated"}', true);

select pg_temp.falla($q$select public.admin_vincular_banda('00000000-0000-4000-c341-000000000001', '00000000-0000-4000-a341-000000000002')$q$,
                     'esa ficha ya está conectada a una cuenta; desconéctala primero');
select pg_temp.falla($q$select public.admin_vincular_banda('00000000-0000-4000-c341-000000000002', '00000000-0000-4000-a341-000000000003')$q$,
                     'esa cuenta no es de músico');
select pg_temp.falla($q$select public.admin_vincular_banda('00000000-0000-4000-c341-000000000002', gen_random_uuid())$q$,
                     'no existe esa cuenta');
select pg_temp.falla($q$select public.admin_vincular_banda(gen_random_uuid(), '00000000-0000-4000-a341-000000000002')$q$,
                     'no existe esa ficha');

-- 4. Desvincular ---------------------------------------------------------------------------
-- F1 se suelta de M1: pierde E1, pero conserva E2 porque ahí sigue con F4 (adicional).
select public.admin_desvincular_banda('00000000-0000-4000-c341-000000000001');
reset role;
select pg_temp.ok((select profile_id is null from public.artists where id = '00000000-0000-4000-c341-000000000001'),
                  'desvincular: la ficha quedó sin cuenta');
select pg_temp.ok(not exists (select 1 from public.event_collaborators
                               where event_id = '00000000-0000-4000-d341-000000000001'
                                 and user_id = '00000000-0000-4000-a341-000000000001'),
                  'desvincular: M1 deja de ser admin del evento de F1');
select pg_temp.ok(exists (select 1 from public.event_collaborators
                           where event_id = '00000000-0000-4000-d341-000000000002'
                             and user_id = '00000000-0000-4000-a341-000000000001' and source = 'artist'),
                  'desvincular: M1 sigue admin del evento donde tiene otra ficha (F4)');
select pg_temp.ok(exists (select 1 from public.event_collaborators
                           where event_id = '00000000-0000-4000-d341-000000000001'
                             and user_id = '00000000-0000-4000-a341-000000000003' and role = 'owner'),
                  'desvincular: el owner sigue');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a341-00000000000a","role":"authenticated"}', true);
select pg_temp.falla($q$select public.admin_desvincular_banda('00000000-0000-4000-c341-000000000001')$q$,
                     'esa ficha no está conectada a ninguna cuenta');

-- 5. Unir ----------------------------------------------------------------------------------
-- Dos cuentas distintas: error, y no se movió nada.
select public.admin_vincular_banda('00000000-0000-4000-c341-0000000000c1', '00000000-0000-4000-a341-000000000001');
select public.admin_vincular_banda('00000000-0000-4000-c341-0000000000c2', '00000000-0000-4000-a341-000000000002');
select pg_temp.falla($q$select public.admin_unir_bandas('00000000-0000-4000-c341-0000000000c1', '00000000-0000-4000-c341-0000000000c2')$q$,
                     'las dos fichas son de cuentas distintas');
select pg_temp.falla($q$select public.admin_unir_bandas('00000000-0000-4000-c341-0000000000c1', '00000000-0000-4000-c341-0000000000c1')$q$,
                     'elige dos fichas distintas');
select pg_temp.falla($q$select public.admin_unir_bandas('00000000-0000-4000-c341-0000000000c1', gen_random_uuid())$q$,
                     'no existe la ficha de destino');
select pg_temp.falla($q$select public.admin_unir_bandas(gen_random_uuid(), '00000000-0000-4000-c341-0000000000c1')$q$,
                     'no existe la ficha de origen');
reset role;
select pg_temp.ok((select count(*) = 2 from public.artists
                    where id in ('00000000-0000-4000-c341-0000000000c1', '00000000-0000-4000-c341-0000000000c2')),
                  'unir con dos cuentas distintas no borra nada');

-- Datos de la unión. U1 (origen) tiene cuenta M2; U2 (destino) no tiene.
--   EU1: principal U1, adicional U2     → queda principal U2, sin fila adicional.
--   EU2: solo U1 (principal)            → queda principal U2.
--   EU3: principal X, adicional U1      → U2 pasa a adicional (una sola fila).
--   EU4: principal U2, adicional U1     → la fila adicional de U1 sobra.
--   Invitación pendiente de U1.
insert into public.events (id, artist_name, artist_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais) values
 ('00000000-0000-4000-d341-0000000000a1', 'U1', '00000000-0000-4000-c341-0000000000a1', '00000000-0000-4000-b341-000000000001', 'Bar de L W341', current_date + 10, '21:00', 'Rock', 5000, '00000000-0000-4000-a341-000000000003', 'CL'),
 ('00000000-0000-4000-d341-0000000000a2', 'U1', '00000000-0000-4000-c341-0000000000a1', '00000000-0000-4000-b341-000000000001', 'Bar de L W341', current_date + 11, '21:00', 'Rock', 5000, '00000000-0000-4000-a341-000000000003', 'CL'),
 ('00000000-0000-4000-d341-0000000000a3', 'X',  '00000000-0000-4000-c341-0000000000a3', '00000000-0000-4000-b341-000000000001', 'Bar de L W341', current_date + 12, '21:00', 'Rock', 5000, '00000000-0000-4000-a341-000000000003', 'CL'),
 ('00000000-0000-4000-d341-0000000000a4', 'U2', '00000000-0000-4000-c341-0000000000a2', '00000000-0000-4000-b341-000000000001', 'Bar de L W341', current_date + 13, '21:00', 'Rock', 5000, '00000000-0000-4000-a341-000000000003', 'CL');
insert into public.event_artists (event_id, artist_id, orden) values
 ('00000000-0000-4000-d341-0000000000a1', '00000000-0000-4000-c341-0000000000a2', 1),
 ('00000000-0000-4000-d341-0000000000a3', '00000000-0000-4000-c341-0000000000a1', 1),
 ('00000000-0000-4000-d341-0000000000a4', '00000000-0000-4000-c341-0000000000a1', 1);
insert into public.sonopolis_invites (email, nombre, artist_id, invited_by) values
 ('u1@prueba-w341.test', 'Origen U1 W341', '00000000-0000-4000-c341-0000000000a1', '00000000-0000-4000-a341-000000000003');
-- U1 se conecta con M2 (admin de EU1, EU2, EU3, EU4 por ser U1 principal o adicional).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a341-00000000000a","role":"authenticated"}', true);
select public.admin_vincular_banda('00000000-0000-4000-c341-0000000000a1', '00000000-0000-4000-a341-000000000002');
reset role;
select pg_temp.ok((select count(*) = 4 from public.event_collaborators
                    where user_id = '00000000-0000-4000-a341-000000000002' and source = 'artist'
                      and event_id in ('00000000-0000-4000-d341-0000000000a1', '00000000-0000-4000-d341-0000000000a2',
                                       '00000000-0000-4000-d341-0000000000a3', '00000000-0000-4000-d341-0000000000a4')),
                  'unir (preparación): M2 admin de los cuatro eventos de U1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a341-00000000000a","role":"authenticated"}', true);
select pg_temp.ok((public.admin_unir_bandas('00000000-0000-4000-c341-0000000000a1', '00000000-0000-4000-c341-0000000000a2')
                   = '{"eventos_principal":2,"eventos_adicional":1,"invitaciones":1}'::jsonb),
                  'unir devuelve el resumen');
reset role;
select pg_temp.ok(not exists (select 1 from public.artists where id = '00000000-0000-4000-c341-0000000000a1'),
                  'unir: la origen desapareció');
select pg_temp.ok((select count(*) = 3 from public.events
                    where artist_id = '00000000-0000-4000-c341-0000000000a2'
                      and id in ('00000000-0000-4000-d341-0000000000a1', '00000000-0000-4000-d341-0000000000a2',
                                 '00000000-0000-4000-d341-0000000000a4')),
                  'unir: la destino quedó principal de EU1, EU2 y EU4');
select pg_temp.ok((select artist_id = '00000000-0000-4000-c341-0000000000a3' from public.events
                    where id = '00000000-0000-4000-d341-0000000000a3'),
                  'unir: EU3 conserva su principal');
select pg_temp.ok((select count(*) = 0 from public.event_artists
                    where event_id in ('00000000-0000-4000-d341-0000000000a1', '00000000-0000-4000-d341-0000000000a4')),
                  'unir: sin filas adicionales duplicadas en EU1 y EU4');
select pg_temp.ok((select count(*) = 1 and min(artist_id::text) = '00000000-0000-4000-c341-0000000000a2'
                     from public.event_artists where event_id = '00000000-0000-4000-d341-0000000000a3'),
                  'unir: la destino quedó como adicional de EU3, una sola vez');
select pg_temp.ok((select artist_id = '00000000-0000-4000-c341-0000000000a2' from public.sonopolis_invites
                    where email = 'u1@prueba-w341.test'),
                  'unir: la invitación pasó a la destino');
select pg_temp.ok((select genero = 'Rock' and comuna = 'Providencia'
                          and profile_id = '00000000-0000-4000-a341-000000000002'
                     from public.artists where id = '00000000-0000-4000-c341-0000000000a2'),
                  'unir: completa los campos vacíos (genero), no pisa los llenos (comuna) y hereda la cuenta');
select pg_temp.ok((select count(*) = 4 from public.event_collaborators
                    where user_id = '00000000-0000-4000-a341-000000000002' and source = 'artist'
                      and event_id in ('00000000-0000-4000-d341-0000000000a1', '00000000-0000-4000-d341-0000000000a2',
                                       '00000000-0000-4000-d341-0000000000a3', '00000000-0000-4000-d341-0000000000a4')),
                  'unir: M2 sigue admin de los cuatro eventos (los deletes de release_admin se repusieron)');

-- Unir con una invitación pendiente en cada ficha: la de la origen se revoca (no choca con
-- sonopolis_invites_one_pending_artist) y la de la destino sigue viva.
insert into public.sonopolis_invites (email, nombre, artist_id, invited_by) values
 ('v1@prueba-w341.test', 'Origen V1 W341',  '00000000-0000-4000-c341-0000000000b1', '00000000-0000-4000-a341-000000000003'),
 ('v2@prueba-w341.test', 'Destino V2 W341', '00000000-0000-4000-c341-0000000000b2', '00000000-0000-4000-a341-000000000003');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a341-00000000000a","role":"authenticated"}', true);
select pg_temp.ok((public.admin_unir_bandas('00000000-0000-4000-c341-0000000000b1', '00000000-0000-4000-c341-0000000000b2')
                   ->>'invitaciones') = '1', 'unir con dos invitaciones pendientes funciona');
reset role;
select pg_temp.ok((select status = 'revoked' from public.sonopolis_invites where email = 'v1@prueba-w341.test'),
                  'unir: la invitación pendiente de la origen quedó revocada');
select pg_temp.ok((select status = 'pending' and artist_id = '00000000-0000-4000-c341-0000000000b2'
                     from public.sonopolis_invites where email = 'v2@prueba-w341.test'),
                  'unir: la invitación pendiente de la destino sigue viva');

-- 6. Cada función dejó su fila en admin_ediciones ----------------------------------------------
select pg_temp.ok((select count(*) = 1 from public.admin_ediciones
                    where tabla = 'profiles' and accion = 'editar'
                      and fila_id = '00000000-0000-4000-a341-000000000001'
                      and antes->>'nombre' = 'Músico M1 W341' and despues->>'nombre' = 'M1 Editado'
                      and por = '00000000-0000-4000-a341-00000000000a'),
                  'admin_ediciones: editar_perfil_musico (antes y después)');
select pg_temp.ok((select count(*) = 1 from public.admin_ediciones
                    where tabla = 'venues' and accion = 'editar'
                      and fila_id = '00000000-0000-4000-b341-000000000001'
                      and antes->>'name' = 'Bar de L W341' and despues->>'name' = 'Bar Renombrado W341'),
                  'admin_ediciones: editar_local');
select pg_temp.ok((select count(*) = 1 from public.admin_ediciones
                    where tabla = 'artists' and accion = 'editar'
                      and fila_id = '00000000-0000-4000-c341-000000000002'
                      and antes->>'name' = 'Ficha Dos W341' and despues->>'name' = 'Ficha Dos Editada'),
                  'admin_ediciones: editar_banda');
select pg_temp.ok((select count(*) = 1 from public.admin_ediciones
                    where tabla = 'artists' and accion = 'vincular'
                      and fila_id = '00000000-0000-4000-c341-000000000004'
                      and antes->>'profile_id' is null
                      and despues->>'profile_id' = '00000000-0000-4000-a341-000000000001'),
                  'admin_ediciones: vincular_banda');
select pg_temp.ok((select count(*) = 1 from public.admin_ediciones
                    where tabla = 'artists' and accion = 'desvincular'
                      and fila_id = '00000000-0000-4000-c341-000000000001'
                      and antes->>'profile_id' = '00000000-0000-4000-a341-000000000001'
                      and despues->>'profile_id' is null),
                  'admin_ediciones: desvincular_banda');
select pg_temp.ok((select count(*) = 1 from public.admin_ediciones
                    where tabla = 'artists' and accion = 'unir'
                      and fila_id = '00000000-0000-4000-c341-0000000000a2'
                      and antes->>'id' = '00000000-0000-4000-c341-0000000000a1'
                      and antes->>'name' = 'Origen U1 W341'
                      and (despues->'resumen'->>'eventos_principal')::int = 2),
                  'admin_ediciones: unir_bandas guarda la ficha origen completa');
-- Los intentos fallidos y los de quien no es admin no dejaron nada: 3 editar + 5 vincular
-- (F1, F4, C1, C2, U1) + 1 desvincular + 2 unir.
select pg_temp.ok((select count(*) = 11 from public.admin_ediciones),
                  'admin_ediciones: solo las acciones que sí se hicieron');

-- El admin sí lee el registro.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a341-00000000000a","role":"authenticated"}', true);
select pg_temp.ok((select count(*) = 11 from public.admin_ediciones), 'el admin lee admin_ediciones');
reset role;

select 'W-341: todo OK' as resultado;
