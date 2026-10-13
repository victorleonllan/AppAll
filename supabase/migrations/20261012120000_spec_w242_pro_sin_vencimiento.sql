-- Spec W-242 — el admin activa Sonópolis Pro sin vencimiento y sin costo.
-- Ver sonopolisWeb/specs/w242-datos-pro-sin-vencimiento.md
--
-- Sigue siendo una fecha (regla de W-048): 9999-12-31 es la centinela de "sin
-- vencimiento". No 'infinity': en JS new Date("infinity") es inválido y esPro()
-- daría falso. Función aparte para no tocar el tope de 366 días de admin_dar_pro.
-- Quitar: admin_dar_pro(tipo, id, 0), que ya existe.

create or replace function public.admin_pro_sin_vencimiento(p_tenant_type text, p_tenant_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes timestamptz;
  v_nuevo timestamptz := '9999-12-31 00:00:00+00';
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede cambiar Pro';
  end if;
  if p_tenant_type not in ('venue', 'musician') then
    raise exception 'tenant_type inválido: %', p_tenant_type;
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

revoke all on function public.admin_pro_sin_vencimiento(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_pro_sin_vencimiento(text, uuid) to authenticated;
