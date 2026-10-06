-- Spec W-211 — el admin de Sonópolis activa y extiende Sonópolis Pro.
-- Ver sonopolisWeb/specs/w211-datos-admin-activa-pro.md
--
-- El trigger guard_sonopolis_pro (W-048) solo deja cambiar sonopolis_pro_hasta a
-- service_role/postgres/supabase_admin. Una función security definer corre como su
-- dueño (postgres) y pasa el trigger; el permiso real lo decide es_admin_sonopolis()
-- ADENTRO, en Postgres, no en JS. Hoy el único admin es Victor (platform_admins).
--
-- No se abre una policy de UPDATE sobre venues/profiles: abriría todas las columnas,
-- no solo la fecha de Pro.

create table if not exists public.pro_cambios (
  id             uuid        primary key default gen_random_uuid(),
  tenant_type    text        not null check (tenant_type in ('venue', 'musician')),
  tenant_id      uuid        not null,
  hasta_antes    timestamptz,
  hasta_despues  timestamptz not null,
  por            uuid        references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists pro_cambios_tenant_idx
  on public.pro_cambios (tenant_type, tenant_id, created_at desc);
alter table public.pro_cambios enable row level security;

-- Solo el admin lee el historial. Escribir: solo admin_dar_pro().
create policy pro_cambios_select_admin on public.pro_cambios
  for select to authenticated using (public.es_admin_sonopolis());

-- p_dias = 0 apaga Pro (la fecha pasa a now()). p_dias > 0 SUMA: desde la fecha
-- actual si Pro sigue vigente, o desde hoy si venció o nunca existió. Renovar antes
-- de que venza no pierde los días que quedaban.
create or replace function public.admin_dar_pro(p_tenant_type text, p_tenant_id uuid, p_dias int)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes timestamptz;
  v_nuevo timestamptz;
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede cambiar Pro';
  end if;
  if p_tenant_type not in ('venue', 'musician') then
    raise exception 'tenant_type inválido: %', p_tenant_type;
  end if;
  if p_dias is null or p_dias < 0 or p_dias > 366 then
    raise exception 'p_dias debe estar entre 0 y 366';
  end if;

  if p_tenant_type = 'venue' then
    select sonopolis_pro_hasta into v_antes from public.venues where id = p_tenant_id;
  else
    select sonopolis_pro_hasta into v_antes from public.profiles
     where id = p_tenant_id and role = 'musician';
  end if;
  if not found then
    raise exception 'no existe ese %', p_tenant_type;
  end if;

  v_nuevo := case
    when p_dias = 0 then now()
    else greatest(now(), coalesce(v_antes, now())) + make_interval(days => p_dias)
  end;

  if p_tenant_type = 'venue' then
    update public.venues set sonopolis_pro_hasta = v_nuevo where id = p_tenant_id;
  else
    update public.profiles set sonopolis_pro_hasta = v_nuevo where id = p_tenant_id;
  end if;

  insert into public.pro_cambios (tenant_type, tenant_id, hasta_antes, hasta_despues, por)
  values (p_tenant_type, p_tenant_id, v_antes, v_nuevo, auth.uid());

  return v_nuevo;
end;
$$;

revoke all on function public.admin_dar_pro(text, uuid, int) from public, anon;
grant execute on function public.admin_dar_pro(text, uuid, int) to authenticated;
