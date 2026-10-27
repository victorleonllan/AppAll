-- Spec 161 — el dueño ve su suscripción a Sonópolis Pro y la base sabe cerrarla en
-- el día que pagó.
--
-- El cobro mensual automático ya existe (plan de MP sin fecha de término, spec 109).
-- Faltaba: (1) que el dueño lea su suscripción — pro_suscripciones y pro_pagos solo
-- los lee el admin (spec 110) — y (2) que cancelar deje Pro hasta el fin del mes
-- pagado: cada cobro suma 1 mes + 3 días, y esos 3 días solo cubren el reintento de
-- MP, que ya no existe con la suscripción cancelada.

-- 1. cancelada_at ---------------------------------------------------------------------

alter table public.pro_suscripciones add column if not exists cancelada_at timestamptz;

-- 2. pro_mi_suscripcion: lo que ve el dueño en su panel ------------------------------
-- Cero filas (no error) si quien llama no es la cuenta dueña: el panel muestra la
-- tarjeta de siempre. `esperando` y `anulado` no cuentan: nadie terminó de pagar.

create or replace function public.pro_mi_suscripcion(p_tenant_type text, p_tenant_id uuid)
returns table (
  suscripcion_id   uuid,
  estado           text,
  monto            numeric,
  moneda           char(3),
  ultimo_pago_at   timestamptz,
  proximo_cobro_at timestamptz,
  pro_hasta        timestamptz,
  cancelada_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null
     or auth.uid() is distinct from public.pro_cuenta_del_tenant(p_tenant_type, p_tenant_id) then
    return;
  end if;

  return query
    select s.id,
           s.estado,
           s.monto,
           s.moneda,
           u.ultimo,
           case when s.estado = 'activa' then u.ultimo + interval '1 month' end,
           case s.tenant_type
             when 'venue'    then (select v.sonopolis_pro_hasta from public.venues v where v.id = s.tenant_id)
             when 'musician' then (select p.sonopolis_pro_hasta from public.profiles p where p.id = s.tenant_id)
           end,
           s.cancelada_at
      from public.pro_suscripciones s
      left join lateral (
        select max(pg.pagado_at) as ultimo
          from public.pro_pagos pg
         where pg.suscripcion_id = s.id
      ) u on true
     where s.tenant_type = p_tenant_type
       and s.tenant_id   = p_tenant_id
       and s.estado in ('activa', 'pausada', 'cancelada')
     order by s.created_at desc
     limit 1;
end;
$$;
revoke all on function public.pro_mi_suscripcion(text, uuid) from public, anon, authenticated;
-- anon también: sin sesión devuelve cero filas, y la web no tiene que distinguir.
grant execute on function public.pro_mi_suscripcion(text, uuid) to anon, authenticated;

-- 3. pro_cerrar_suscripcion: solo el servidor, después de que MP canceló ------------
-- Idempotente: el panel cancela y MP avisa lo mismo por el webhook.
--
-- La fecha solo se ajusta si sigue siendo el hasta_despues del último pago (nadie la
-- movió después, p. ej. el admin regalando días). Se resta solo la gracia de 3 días,
-- no se recalcula desde pagado_at: si el tenant tenía tiempo acumulado al pagar,
-- hasta_despues ya lo incluye. greatest(now(), …): cancelar durante un reintento
-- fallido termina Pro ahora, no en el pasado.

create or replace function public.pro_cerrar_suscripcion(p_suscripcion_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        public.pro_suscripciones;
  ult      public.pro_pagos;
  v_antes  timestamptz;
  v_nuevo  timestamptz;
begin
  select * into s from public.pro_suscripciones x
   where x.id = p_suscripcion_id
   for update;
  if not found then
    raise exception 'suscripcion_desconocida: %', p_suscripcion_id;
  end if;

  -- Lock de la fila del tenant, igual que pro_registrar_pago.
  if s.tenant_type = 'venue' then
    select v.sonopolis_pro_hasta into v_antes from public.venues v
     where v.id = s.tenant_id for update;
  else
    select p.sonopolis_pro_hasta into v_antes from public.profiles p
     where p.id = s.tenant_id for update;
  end if;

  if s.estado = 'cancelada' then
    return v_antes;
  end if;

  update public.pro_suscripciones
     set estado = 'cancelada', cancelada_at = now()
   where id = s.id;

  select * into ult from public.pro_pagos pg
   where pg.suscripcion_id = s.id
   order by pg.pagado_at desc
   limit 1;

  if not found or v_antes is distinct from ult.hasta_despues then
    return v_antes;
  end if;

  v_nuevo := greatest(now(), ult.hasta_despues - interval '3 days');

  if s.tenant_type = 'venue' then
    update public.venues set sonopolis_pro_hasta = v_nuevo where id = s.tenant_id;
  else
    update public.profiles set sonopolis_pro_hasta = v_nuevo where id = s.tenant_id;
  end if;

  insert into public.pro_cambios
    (tenant_type, tenant_id, hasta_antes, hasta_despues, por, fuente, pago_id)
  values
    (s.tenant_type, s.tenant_id, v_antes, v_nuevo, null, 'mercadopago', null);

  return v_nuevo;
end;
$$;
revoke all on function public.pro_cerrar_suscripcion(uuid) from public, anon, authenticated;
grant execute on function public.pro_cerrar_suscripcion(uuid) to service_role;
