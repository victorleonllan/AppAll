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

create or replace function guard_sonopolis_pro() returns trigger as $$
begin
  if new.sonopolis_pro_hasta is distinct from old.sonopolis_pro_hasta
     and auth.role() <> 'service_role' then
    raise exception 'sonopolis_pro_hasta solo se cambia desde el servidor';
  end if;
  return new;
end $$ language plpgsql security definer;

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
