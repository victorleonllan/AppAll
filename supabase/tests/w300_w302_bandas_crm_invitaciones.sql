-- Pruebas de W-300 (bandas del evento), W-301 (compradores para todos) y W-302
-- (invitar a Sonópolis). Ver sonopolisWeb/specs/w300…, w301…, w302….
--
-- Corre DENTRO de una transacción que el que la llama revierte: no deja nada.
--   BEGIN; <este archivo>; ROLLBACK;
-- (scripts/pruebas/datos-invitaciones.sh de sonopolisWeb lo arma y lo corre.)
-- Si algo falla, lanza 'FALLA: …' y la transacción entera se cae.
--
-- Caso: un local nuevo (L) crea un evento con dos bandas nuevas (B1 principal,
-- B2 adicional), las invita, ellas se registran, y cada uno ve a los compradores
-- en su propia base. Después B1 toca en otro local y solo su base crece.

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

-- Cuentas ------------------------------------------------------------------------------
-- L: local (confirmado). X: otro local. Las bandas se registran más abajo.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values
 ('00000000-0000-4000-a000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'local@prueba-w302.test', '{"role":"local","nombre":"Local Prueba"}', now(), now(), now()),
 ('00000000-0000-4000-a000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'otro-local@prueba-w302.test', '{"role":"local","nombre":"Otro Local"}', now(), now(), now());

select pg_temp.ok((select role from public.profiles where id = '00000000-0000-4000-a000-000000000001') = 'local',
                  'handle_new_user crea al local con rol local');

insert into public.venues (id, name, type, pais, owner_id) values
 ('00000000-0000-4000-b000-000000000001', 'Bar Prueba W302', 'bar', 'CL', '00000000-0000-4000-a000-000000000001'),
 ('00000000-0000-4000-b000-000000000002', 'Sala Otra W302',  'sala', 'CL', '00000000-0000-4000-a000-000000000005');

-- Una ficha de banda ajena (creada por X) para probar permisos.
insert into public.artists (id, name, created_by) values
 ('00000000-0000-4000-c000-000000000009', 'Banda Ajena', '00000000-0000-4000-a000-000000000005');

-- W-300: el local crea el evento con dos bandas ------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

insert into public.artists (id, name, created_by) values
 ('00000000-0000-4000-c000-000000000001', 'Banda Uno W302', '00000000-0000-4000-a000-000000000001'),
 ('00000000-0000-4000-c000-000000000002', 'Banda Dos W302', '00000000-0000-4000-a000-000000000001');

insert into public.events (id, artist_name, artist_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais)
values ('00000000-0000-4000-d000-000000000001', 'Banda Uno W302 + Banda Dos W302',
        '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', 'Bar Prueba W302',
        '2026-12-20', '21:00', 'rock', '5000', '00000000-0000-4000-a000-000000000001', 'CL');

insert into public.event_artists (event_id, artist_id, orden)
values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000002', 1);

select pg_temp.falla($q$insert into public.event_artists (event_id, artist_id)
  values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000001')$q$,
  'ya es la principal');

-- X no edita el evento de L: no puede tocar su lineup.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
select pg_temp.falla($q$insert into public.event_artists (event_id, artist_id)
  values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000009')$q$,
  'row-level security');

-- Cualquiera (incluso anon) ve el lineup de un evento publicado.
reset role;
set local role anon;
select pg_temp.ok((select count(*) from public.event_artists
                    where event_id = '00000000-0000-4000-d000-000000000001') = 1,
                  'anon ve la banda adicional de un evento publicado');
reset role;

-- Una compra del evento.
insert into public.tickets (evento_id, status, monto, cantidad, moneda, pais_cobro, pasarela, guest_email, comprador_email)
values ('00000000-0000-4000-d000-000000000001', 'completed', 5000, 2, 'CLP', 'CL', 'mercadopago',
        'fan1@prueba-w302.test', 'fan1@prueba-w302.test');

-- W-301 antes de que las bandas tengan cuenta: el comprador queda en la base del local.
select pg_temp.ok(exists (select 1 from privado.crm_base
                           where tenant_type = 'venue' and tenant_id = '00000000-0000-4000-b000-000000000001'
                             and email = 'fan1@prueba-w302.test' and entradas = 2),
                  'el comprador entra a la base del local');

-- W-302: el local invita a las dos bandas ----------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

insert into tok values ('b1', public.invitar_a_sonopolis('B1@Prueba-W302.test', null,
  '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001'));
select pg_temp.ok((select t from tok where k = 'b1') = public.invitar_a_sonopolis('b1@prueba-w302.test', null,
  '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-d000-000000000001'),
  'reenviar al mismo correo devuelve el mismo token');

-- Otro correo para la misma ficha revoca el anterior.
insert into tok values ('b2-viejo', public.invitar_a_sonopolis('equivocado@prueba-w302.test', null,
  '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-d000-000000000001'));
insert into tok values ('b2', public.invitar_a_sonopolis('b2@prueba-w302.test', null,
  '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-d000-000000000001'));
select pg_temp.ok((select status from public.sonopolis_invites where token = (select t from tok where k = 'b2-viejo')) = 'revoked',
                  'invitar otro correo a la misma ficha revoca la invitación anterior');

-- Sin ficha (botón del panel del local).
insert into tok values ('b3', public.invitar_a_sonopolis('b3@prueba-w302.test', 'Banda Tres W302'));

-- Quien invita ve sus invitaciones; X no las ve.
select pg_temp.ok((select count(*) from public.sonopolis_invites) = 4, 'el local ve sus 4 invitaciones');

select pg_temp.falla($q$select public.invitar_a_sonopolis('x@prueba-w302.test', null, '00000000-0000-4000-c000-000000000009')$q$,
  'solo quien registró');
select pg_temp.falla($q$select public.invitar_a_sonopolis('no-es-correo', 'Algo')$q$, 'correo inválido');
select pg_temp.falla($q$select public.invitar_a_sonopolis('otro-local@prueba-w302.test', 'Algo')$q$, 'cuenta de local');
select pg_temp.falla($q$select public.invitar_a_sonopolis('x2@prueba-w302.test', 'Algo', null, '00000000-0000-4000-d000-999999999999')$q$,
  'no puedes invitar desde ese evento');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
select pg_temp.ok((select count(*) from public.sonopolis_invites) = 0, 'otro local no ve invitaciones ajenas');
select pg_temp.falla(format('select public.revocar_invitacion_sonopolis(%L)', (select t from tok where k = 'b3')),
  'no es tuya');
reset role;

-- La página pública dice quién invita (el nombre del local).
select pg_temp.ok((select invitado_por from public.invitacion_sonopolis_publica((select t from tok where k = 'b1'))) = 'Bar Prueba W302',
                  'la invitación pública muestra el nombre del local que invita');
select pg_temp.ok((select evento_titulo from public.invitacion_sonopolis_publica((select t from tok where k = 'b1'))) like 'Banda Uno%',
                  'la invitación pública muestra el evento');

-- B1 se registra con el enlace (rol músico en metadata), primero sin confirmar ----------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-4000-a000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'b1@prueba-w302.test', '{"role":"musician","nombre":"Banda Uno W302"}', null, now(), now());
select pg_temp.ok((select status from public.sonopolis_invites where token = (select t from tok where k = 'b1')) = 'pending',
                  'sin correo confirmado la invitación no se reclama');

update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-a000-000000000002';
select pg_temp.ok((select status from public.sonopolis_invites where token = (select t from tok where k = 'b1')) = 'accepted',
                  'al confirmar el correo se reclama');
select pg_temp.ok((select profile_id from public.artists where id = '00000000-0000-4000-c000-000000000001') = '00000000-0000-4000-a000-000000000002',
                  'B1 reclama la ficha que creó el local');
select pg_temp.ok((select role from public.profiles where id = '00000000-0000-4000-a000-000000000002') = 'musician', 'B1 es músico');
select pg_temp.ok(exists (select 1 from public.event_collaborators where event_id = '00000000-0000-4000-d000-000000000001'
                            and user_id = '00000000-0000-4000-a000-000000000002' and role = 'admin' and source = 'artist'),
                  'B1 queda admin del evento');
select pg_temp.ok((select count(*) from public.artists where profile_id = '00000000-0000-4000-a000-000000000002') = 1,
                  'B1 no queda con dos fichas');

-- B2 entra como fan, ya confirmado (p. ej. Google): la invitación lo pasa a músico ----
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-4000-a000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'b2@prueba-w302.test', '{}', now(), now(), now());
select pg_temp.ok((select role from public.profiles where id = '00000000-0000-4000-a000-000000000003') = 'musician',
                  'B2 pasa de fan a músico en profiles');
select pg_temp.ok((select raw_user_meta_data->>'role' from auth.users where id = '00000000-0000-4000-a000-000000000003') = 'musician',
                  'B2 pasa a músico en user_metadata');
select pg_temp.ok((select nombre from public.profiles where id = '00000000-0000-4000-a000-000000000003') = 'Banda Dos W302',
                  'B2 sin nombre toma el nombre de la invitación');
select pg_temp.ok((select profile_id from public.artists where id = '00000000-0000-4000-c000-000000000002') = '00000000-0000-4000-a000-000000000003',
                  'B2 reclama la ficha adicional');
select pg_temp.ok(exists (select 1 from public.event_collaborators where event_id = '00000000-0000-4000-d000-000000000001'
                            and user_id = '00000000-0000-4000-a000-000000000003' and role = 'admin'),
                  'B2 (banda adicional) queda admin del evento');

-- B3 (invitación sin ficha) recibe una ficha propia.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-4000-a000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'b3@prueba-w302.test', '{"role":"musician","nombre":"Banda Tres W302"}', now(), now(), now());
select pg_temp.ok(exists (select 1 from public.artists where profile_id = '00000000-0000-4000-a000-000000000004' and name = 'Banda Tres W302'),
                  'B3 sin ficha recibe una ficha propia con el nombre invitado');

-- W-301: el comprador del evento compartido está en las tres bases --------------------
select pg_temp.ok((select count(*) from privado.crm_base where email = 'fan1@prueba-w302.test') = 3,
                  'el comprador queda en la base del local, de B1 y de B2');

-- Cada uno lo ve con su propia sesión (RLS de tickets vía event_collaborators).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select pg_temp.ok((select count(*) from public.crm_contactos where tenant_type = 'musician'
                    and tenant_id = '00000000-0000-4000-a000-000000000002' and 'comprador' = any(origenes)) = 1,
                  'B1 ve al comprador en su CRM');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
select pg_temp.ok((select count(*) from public.crm_contactos where tenant_type = 'musician'
                    and tenant_id = '00000000-0000-4000-a000-000000000003' and 'comprador' = any(origenes)) = 1,
                  'B2 ve al comprador en su CRM');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select pg_temp.ok((select count(*) from public.crm_contactos where tenant_type = 'venue'
                    and tenant_id = '00000000-0000-4000-b000-000000000001' and 'comprador' = any(origenes)) = 1,
                  'el local ve al comprador en su CRM');

-- B1 crea su propio evento en OTRO local: su base crece, la de B2 y la del local no.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
insert into public.events (id, artist_name, artist_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais)
values ('00000000-0000-4000-d000-000000000002', 'Banda Uno W302', '00000000-0000-4000-c000-000000000001',
        '00000000-0000-4000-b000-000000000002', 'Sala Otra W302', '2027-01-10', '21:00', 'rock', '5000',
        '00000000-0000-4000-a000-000000000002', 'CL');
reset role;
insert into public.tickets (evento_id, status, monto, cantidad, moneda, pais_cobro, pasarela, guest_email, comprador_email)
values ('00000000-0000-4000-d000-000000000002', 'completed', 5000, 1, 'CLP', 'CL', 'mercadopago',
        'fan2@prueba-w302.test', 'fan2@prueba-w302.test');

select pg_temp.ok((select count(*) from privado.crm_base where tenant_id = '00000000-0000-4000-a000-000000000002'
                    and 'comprador' = any(origenes)) = 2, 'la base de B1 suma el comprador de su show en otro local');
select pg_temp.ok((select count(*) from privado.crm_base where tenant_id = '00000000-0000-4000-a000-000000000003'
                    and 'comprador' = any(origenes)) = 1, 'la base de B2 no cambia');
select pg_temp.ok((select count(*) from privado.crm_base where tenant_id = '00000000-0000-4000-b000-000000000001'
                    and 'comprador' = any(origenes)) = 1, 'la base del primer local no cambia');
select pg_temp.ok(exists (select 1 from privado.crm_base where tenant_id = '00000000-0000-4000-b000-000000000002'
                    and email = 'fan2@prueba-w302.test'), 'el segundo local también suma a ese comprador');

-- Sacar a B2 del lineup le quita el admin que tenía por ser banda del evento.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
delete from public.event_artists where event_id = '00000000-0000-4000-d000-000000000001'
   and artist_id = '00000000-0000-4000-c000-000000000002';
reset role;
select pg_temp.ok(not exists (select 1 from public.event_collaborators where event_id = '00000000-0000-4000-d000-000000000001'
                                and user_id = '00000000-0000-4000-a000-000000000003'),
                  'sacar a B2 del lineup le quita el admin del evento');
select pg_temp.ok(exists (select 1 from public.event_collaborators where event_id = '00000000-0000-4000-d000-000000000001'
                            and user_id = '00000000-0000-4000-a000-000000000002'),
                  'B1 (principal) sigue admin');

-- Reclamo con sesión abierta: con otro correo, no.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
select pg_temp.falla(format('select public.reclamar_invitacion_sonopolis(%L)', (select t from tok where k = 'b2-viejo')),
  'esta invitación es para');
reset role;

-- W-307: los tres huecos de la revisión -------------------------------------------------
-- Cuenta E: editor (no admin) del evento de L.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-4000-a000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'editor@prueba-w302.test', '{"role":"musician","nombre":"Editor"}', now(), now(), now());
insert into public.event_collaborators (event_id, user_id, role, can_delete, source)
values ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-a000-000000000006', 'editor', false, 'invited');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
-- B2 (hueco 2): no puede crear una ficha a nombre de otra cuenta...
select pg_temp.falla($q$insert into public.artists (name, created_by, profile_id)
  values ('Trampa', '00000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000005')$q$,
  'row-level security');
-- ...ni enlazar después una ficha suya a otra cuenta.
insert into public.artists (id, name, created_by) values
 ('00000000-0000-4000-c000-000000000006', 'Ficha del editor', '00000000-0000-4000-a000-000000000006');
select pg_temp.falla($q$update public.artists set profile_id = '00000000-0000-4000-a000-000000000005'
  where id = '00000000-0000-4000-c000-000000000006'$q$, 'se enlaza con una invitación');
-- Agregar al lineup una banda ya reclamada (B3) siendo editor no le da admin a B3.
insert into public.event_artists (event_id, artist_id)
select '00000000-0000-4000-d000-000000000001', id from public.artists
 where profile_id = '00000000-0000-4000-a000-000000000004';
reset role;
select pg_temp.ok(not exists (select 1 from public.event_collaborators where event_id = '00000000-0000-4000-d000-000000000001'
                                and user_id = '00000000-0000-4000-a000-000000000004'),
                  'un editor no fabrica un admin agregando una banda reclamada');

-- B1 (hueco 1): X agrega una ficha sin cuenta de L a su evento y no puede invitarse.
insert into public.artists (id, name, created_by) values
 ('00000000-0000-4000-c000-000000000003', 'Banda Libre W302', '00000000-0000-4000-a000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
insert into public.events (id, artist_name, artist_id, venue_id, venue_name, fecha, hora, genero, precio, created_by, pais)
values ('00000000-0000-4000-d000-000000000003', 'Banda Libre W302', '00000000-0000-4000-c000-000000000003',
        '00000000-0000-4000-b000-000000000002', 'Sala Otra W302', '2027-02-01', '21:00', 'rock', '5000',
        '00000000-0000-4000-a000-000000000005', 'CL');
select pg_temp.falla($q$select public.invitar_a_sonopolis('x-se-la-queda@prueba-w302.test', null,
  '00000000-0000-4000-c000-000000000003', '00000000-0000-4000-d000-000000000003')$q$, 'solo quien registró');

-- B3 (hueco 3): reenviar antes de 10 minutos de un envío marcado, no.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
insert into tok values ('libre', public.invitar_a_sonopolis('libre@prueba-w302.test', null, '00000000-0000-4000-c000-000000000003'));
select public.marcar_invitacion_sonopolis_enviada((select t from tok where k = 'libre'));
select pg_temp.falla($q$select public.invitar_a_sonopolis('libre@prueba-w302.test', null, '00000000-0000-4000-c000-000000000003')$q$,
  'hace menos de 10 minutos');
reset role;

-- El reclamo (security definer) sigue pudiendo enlazar la ficha: lo probó B1 arriba, y
-- aquí con la ficha libre después del trigger nuevo.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-4000-a000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'libre@prueba-w302.test', '{"role":"musician"}', now(), now(), now());
select pg_temp.ok((select profile_id from public.artists where id = '00000000-0000-4000-c000-000000000003') = '00000000-0000-4000-a000-000000000007',
                  'el reclamo por invitación enlaza la ficha pese al guardia de profile_id');

select 'W-300/W-301/W-302/W-307: todas las pruebas pasaron' as resultado;

