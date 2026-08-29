-- Spec W-048 (sonopolisWeb) — Sonópolis Pro: el gate, como fecha de vencimiento.
--
-- Una fecha, no un booleano: un booleano necesita que alguien lo apague y nadie
-- lo va a apagar (un local que dejó de pagar seguiría mandando WhatsApp para
-- siempre). El gate es `sonopolis_pro_hasta > now()`; nulo = nunca fue Pro.
--
-- Los tenants son `venues` y `profiles` (no `artists`, la tabla placeholder del
-- spec 061: `follows_musicians` referencia `profiles`, y FormPerfilMusico
-- escribe ahí).

alter table venues   add column sonopolis_pro_hasta timestamptz;
alter table profiles add column sonopolis_pro_hasta timestamptz;

-- Sin esto, `venues`/`profiles` ya tienen policies de UPDATE para su dueño y
-- un local se auto-otorgaría Pro con un update a su propia fila. Mismo patrón
-- que `events_guard_protected_columns_trg` (spec 033): un trigger `before
-- update` que rechaza el cambio salvo que lo haga el service role.

-- Corregido antes de aplicar (2026-08-29, ver addenda del spec W-048):
--
-- 1. `current_user` y no `auth.role()`. Esa función no tiene un solo uso en este
--    proyecto (todas las policies usan `auth.uid()`), así que su comportamiento acá
--    no está probado — y si fallara, el trigger rechazaría CADA update de venues y
--    profiles, dejando sin poder editarse la ficha del local y el perfil del músico.
--    `current_user` es SQL estándar: no depende de Supabase y nombra explícitamente
--    los roles que sí pueden escribir, incluido `postgres` (el del SQL editor del
--    dashboard, que es por donde Victor pone la fecha a mano).
--
-- 2. `security invoker`, no `definer`. Con `definer` la función corre como su dueño y
--    `current_user` sería siempre `postgres`, así que la guarda no guardaría nada.
--    Acá no hace falta `definer`: el trigger no consulta ninguna otra tabla.
--
-- 3. `set search_path` fijo, como sí hace events_guard_protected_columns (spec 033).
create or replace function guard_sonopolis_pro() returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.sonopolis_pro_hasta is distinct from old.sonopolis_pro_hasta
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'sonopolis_pro_hasta solo se cambia desde el servidor';
  end if;
  return new;
end $$;

create trigger venues_guard_pro_trg
  before update on venues
  for each row execute function guard_sonopolis_pro();

create trigger profiles_guard_pro_trg
  before update on profiles
  for each row execute function guard_sonopolis_pro();

-- Lectura: las policies de SELECT actuales ya cubren la columna nueva (no se
-- tocan). El dueño la lee vía `select("*")` en libs/data/, y quien decide
-- escribirla hoy es Victor a mano desde el dashboard (service_role) — ver
-- specs/w048-datos-sonopolis-pro.md para el motivo de no automatizarlo todavía.
