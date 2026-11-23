-- Spec W-336 — el músico que registra un local al crear su evento invita a su dueño real.
-- Ver sonopolisWeb/specs/w336-datos-musico-invita-dueno-de-local.md
--
-- Hasta acá solo el admin podía invitar al dueño de un local (W-230,
-- admin_invitar_dueno_local). Un músico que crea un evento en un local que no está en
-- Sonópolis lo registra al vuelo y queda como dueño temporal del placeholder
-- (FormEvento, venues_insert exige auth.uid() = owner_id). Esta función le deja invitar
-- al dueño real de ESE local, y a nadie más. El reclamo es el mismo de W-230
-- (_aplicar_invitacion_local): no cambia.

create or replace function public.invitar_dueno_local(p_venue_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_email     text := lower(trim(coalesce(p_email, '')));
  v_venue     public.venues%rowtype;
  v_rol_yo    text;
  v_cuenta    uuid;
  v_rol       text;
  v_otro      text;
  v_pendiente public.venue_owner_invites%rowtype;
  v_token     uuid;
begin
  if v_uid is null then
    raise exception 'inicia sesión para invitar';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'correo inválido';
  end if;

  select * into v_venue from public.venues where id = p_venue_id;
  if not found then
    raise exception 'no existe ese local';
  end if;

  -- Solo el músico que tiene el placeholder (o el admin). Un local real no se regala
  -- desde acá: su dueño ya es una cuenta de local.
  select role into v_rol_yo from public.profiles where id = v_uid;
  if not public.es_admin_sonopolis()
     and (v_venue.owner_id is distinct from v_uid or v_rol_yo is distinct from 'musician') then
    raise exception 'solo puedes invitar al dueño de un local que tú registraste';
  end if;

  select u.id, p.role into v_cuenta, v_rol
    from auth.users u left join public.profiles p on p.id = u.id
   where lower(u.email) = v_email
   limit 1;

  if v_cuenta is not null then
    if v_rol = 'musician' then
      raise exception 'ese correo es de una cuenta de músico; usa el correo del local';
    end if;
    if v_venue.owner_id = v_cuenta then
      raise exception 'ese correo ya es el dueño de este local';
    end if;
    select name into v_otro from public.venues
     where owner_id = v_cuenta and id <> p_venue_id limit 1;
    if v_otro is not null then
      raise exception 'esa cuenta ya administra %', v_otro;
    end if;
  end if;

  select * into v_pendiente from public.venue_owner_invites
   where venue_id = p_venue_id and status = 'pending';
  if found then
    if v_pendiente.email = v_email then
      -- Reenviar = volver a llamar, con freno: el correo sale de Sonópolis.
      if v_pendiente.sent_at is not null and v_pendiente.sent_at > now() - interval '10 minutes'
         and not public.es_admin_sonopolis() then
        raise exception 'ya enviaste esta invitación hace poco; espera unos minutos para reenviarla';
      end if;
      return v_pendiente.token;
    end if;
    update public.venue_owner_invites set status = 'revoked' where id = v_pendiente.id;
  end if;

  insert into public.venue_owner_invites (venue_id, email, invited_by)
  values (p_venue_id, v_email, v_uid)
  returning token into v_token;
  return v_token;
end;
$$;

create or replace function public.marcar_invitacion_local_enviada(p_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.venue_owner_invites set sent_at = now()
   where token = p_token and status = 'pending'
     and (invited_by = auth.uid() or public.es_admin_sonopolis());
end;
$$;

revoke all on function public.invitar_dueno_local(uuid, text)        from public, anon;
revoke all on function public.marcar_invitacion_local_enviada(uuid)  from public, anon;
grant execute on function public.invitar_dueno_local(uuid, text)       to authenticated;
grant execute on function public.marcar_invitacion_local_enviada(uuid) to authenticated;
