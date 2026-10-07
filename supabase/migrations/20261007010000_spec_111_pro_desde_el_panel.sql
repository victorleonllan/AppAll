-- Spec 111 — El dueño de un local o banda se suscribe a Pro desde su panel.
-- Ver specs/111-datos-suscripcion-pro-desde-el-panel.md
--
-- La cuenta dueña crea su propio código de suscripción con el precio de la base
-- (no con un monto del navegador), y si ya tiene uno esperando pago con link, lo
-- reusa: cada código es un plan en Mercado Pago, y uno nuevo por clic dejaría
-- planes vivos que cobrarían si se abren más tarde.
--
-- Igual que en el 110: cada función revoca `from public, anon, authenticated`
-- (Supabase da EXECUTE por defecto, spec 093) y concede solo lo que el spec dice.

-- 1. Precio de Pro por país --------------------------------------------------------
-- null = Pro no se vende solo en ese país. 20.000 CLP: precio de Victor (addenda de
-- sonopolisWeb W-216). paises_cobro ya se lee con anon (spec 100): la tarjeta del
-- panel muestra el mismo número con que se cobra.

alter table public.paises_cobro add column pro_precio_mensual numeric(12,2)
  check (pro_precio_mensual is null or pro_precio_mensual > 0);
update public.paises_cobro set pro_precio_mensual = 20000 where pais = 'CL';

-- 2. pro_nuevo_codigo: el generador del 110, en una función ---------------------
-- 8 caracteres de un alfabeto de 32 sin los ambiguos (0 O 1 I). 32 divide a 256:
-- `byte % 32` no sesga. No verifica unicidad: el insert la verifica y reintenta.
-- admin_crear_codigo_pro no se toca (ya está en producción).

create or replace function public.pro_nuevo_codigo()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes    bytea := extensions.gen_random_bytes(8);
  v_codigo   text := '';
begin
  for i in 0..7 loop
    v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_codigo;
end;
$$;
revoke all on function public.pro_nuevo_codigo() from public, anon, authenticated, service_role;

-- 3. pro_crear_mi_codigo ------------------------------------------------------------

create or replace function public.pro_crear_mi_codigo(p_tenant_type text, p_tenant_id uuid)
returns table (
  id            uuid,
  codigo        text,
  pais          char(2),
  moneda        char(3),
  monto         numeric,
  nombre        text,
  correo_cuenta text,
  init_point    text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_existe  boolean;
  v_nombre  text;
  v_pais    char(2);
  v_moneda  char(3);
  v_precio  numeric;
  v_correo  text;
  v_codigo  text;
  v_id      uuid;
  v_intento int := 0;
  s         public.pro_suscripciones;
begin
  if p_tenant_type is null or p_tenant_type not in ('venue', 'musician') then
    raise exception 'tenant_type inválido: %', p_tenant_type;
  end if;

  -- Lock del tenant: dos clics seguidos no crean dos códigos.
  if p_tenant_type = 'venue' then
    select true, v.name, v.pais into v_existe, v_nombre, v_pais
      from public.venues v where v.id = p_tenant_id for update;
  else
    select true, p.nombre, p.pais into v_existe, v_nombre, v_pais
      from public.profiles p where p.id = p_tenant_id and p.role = 'musician' for update;
  end if;
  if v_existe is null then
    raise exception 'no existe ese %', p_tenant_type;
  end if;

  if auth.uid() is null
     or auth.uid() is distinct from public.pro_cuenta_del_tenant(p_tenant_type, p_tenant_id) then
    raise exception 'solo la cuenta de este local o banda puede suscribirlo';
  end if;

  if exists (select 1 from public.pro_suscripciones x
              where x.tenant_type = p_tenant_type and x.tenant_id = p_tenant_id
                and x.estado in ('activa', 'pausada')) then
    raise exception 'ya tienes una suscripción a Sonópolis Pro activa';
  end if;

  -- Reusar: el código esperando más nuevo con link. Incluye los del admin: si
  -- Victor le pactó un precio de piloto, gana ese.
  select * into s from public.pro_suscripciones x
   where x.tenant_type = p_tenant_type and x.tenant_id = p_tenant_id
     and x.estado = 'esperando' and x.init_point is not null
   order by x.created_at desc
   limit 1;
  if found then
    update public.pro_suscripciones
       set link_pedido_at = coalesce(link_pedido_at, now())
     where pro_suscripciones.id = s.id;
    return query select s.id, s.codigo, s.pais, s.moneda, s.monto, v_nombre, s.correo_cuenta, s.init_point;
    return;
  end if;

  select pc.moneda, pc.pro_precio_mensual into v_moneda, v_precio
    from public.paises_cobro pc
   where pc.pais = v_pais and pc.activo and pc.pro_precio_mensual is not null;
  if v_precio is null then
    raise exception 'Sonópolis Pro todavía no se vende en tu país';
  end if;

  select u.email into v_correo from auth.users u where u.id = auth.uid();
  if v_correo is null then
    raise exception 'tu cuenta no tiene correo';
  end if;

  loop
    v_intento := v_intento + 1;
    v_codigo  := public.pro_nuevo_codigo();
    begin
      insert into public.pro_suscripciones
        (codigo, tenant_type, tenant_id, cuenta_id, correo_cuenta, pais, moneda, monto, creado_por)
      values
        (v_codigo, p_tenant_type, p_tenant_id, auth.uid(), v_correo, v_pais, v_moneda, v_precio, auth.uid())
      returning pro_suscripciones.id into v_id;
      exit;
    exception when unique_violation then
      if v_intento >= 5 then
        raise;
      end if;
    end;
  end loop;

  return query select v_id, v_codigo, v_pais, v_moneda, v_precio, v_nombre, v_correo, null::text;
end;
$$;
revoke all on function public.pro_crear_mi_codigo(text, uuid) from public, anon, authenticated;
grant execute on function public.pro_crear_mi_codigo(text, uuid) to authenticated;
