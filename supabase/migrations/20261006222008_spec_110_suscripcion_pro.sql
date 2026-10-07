-- Spec 110 — La suscripción a Sonópolis Pro queda atada a la cuenta de Sonópolis
-- del local o banda. Supera al spec 108, que no se implementó.
-- Ver specs/110-datos-suscripcion-pro-atada-a-la-cuenta.md
--
-- El admin genera un código para un tenant con cuenta; solo esa cuenta, con sesión,
-- recibe el link de pago de Mercado Pago (un plan por código); cada cobro aprobado
-- corre sonopolis_pro_hasta del tenant.
--
-- Las funciones que tocan sonopolis_pro_hasta son security definer: corren como su
-- dueño (postgres) y pasan el trigger guard_sonopolis_pro (W-048), igual que
-- admin_dar_pro (W-211). El permiso real se decide adentro.
--
-- Supabase da EXECUTE a anon y authenticated en cada función nueva de public (spec
-- 093, addenda 2): por eso cada función revoca `from public, anon, authenticated`
-- y después concede solo lo que el spec dice.

-- 1. Tablas ---------------------------------------------------------------------

create table public.pro_suscripciones (
  id                 uuid        primary key default gen_random_uuid(),
  codigo             text        not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{8}$'),
  tenant_type        text        not null check (tenant_type in ('venue', 'musician')),
  tenant_id          uuid        not null,
  cuenta_id          uuid        not null references auth.users(id),
  correo_cuenta      text        not null,
  pais               char(2)     not null references public.paises_cobro(pais),
  moneda             char(3)     not null,
  monto              numeric(12,2) not null check (monto > 0),
  estado             text        not null default 'esperando'
                     check (estado in ('esperando', 'activa', 'pausada', 'cancelada', 'anulado')),
  mp_plan_id         text        unique,
  init_point         text,
  mp_preapproval_id  text        unique,
  link_pedido_at     timestamptz,
  creado_por         uuid        references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index pro_suscripciones_tenant_idx
  on public.pro_suscripciones (tenant_type, tenant_id, created_at desc);

-- updated_at por trigger y no a mano: la Edge Function del spec 109 cambia `estado`
-- con service_role directo, sin pasar por estas funciones.
create or replace function public.pro_suscripciones_tocar_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.pro_suscripciones_tocar_updated_at() from public, anon, authenticated;

create trigger pro_suscripciones_updated_at_trg
  before update on public.pro_suscripciones
  for each row execute function public.pro_suscripciones_tocar_updated_at();

create table public.pro_pagos (
  id               uuid        primary key default gen_random_uuid(),
  mp_pago_id       text        not null unique,   -- id del authorized_payment de MP
  suscripcion_id   uuid        not null references public.pro_suscripciones(id),
  monto            numeric(12,2) not null,
  pagado_at        timestamptz not null,
  hasta_antes      timestamptz,
  hasta_despues    timestamptz not null,
  created_at       timestamptz not null default now()
);
create index pro_pagos_suscripcion_idx on public.pro_pagos (suscripcion_id, pagado_at desc);

-- Solo el admin lee. Nadie inserta ni actualiza por policy: escriben las funciones
-- de abajo y la Edge Function con service_role.
alter table public.pro_suscripciones enable row level security;
alter table public.pro_pagos         enable row level security;

create policy pro_suscripciones_select_admin on public.pro_suscripciones
  for select to authenticated using (public.es_admin_sonopolis());
create policy pro_pagos_select_admin on public.pro_pagos
  for select to authenticated using (public.es_admin_sonopolis());

-- 2. pro_cambios sabe de dónde vino el cambio -------------------------------------
-- El default 'admin' cubre las filas viejas y a admin_dar_pro (W-211) sin tocarla.
-- `por` queda null en los cambios de Mercado Pago.

alter table public.pro_cambios add column fuente text not null default 'admin'
  check (fuente in ('admin', 'mercadopago'));
alter table public.pro_cambios add column pago_id uuid references public.pro_pagos(id);

-- 3. La cuenta de un tenant (interna) ---------------------------------------------
-- Local: venues.owner_id. Banda: el propio profiles.id con role = 'musician'.
-- null si no hay cuenta. Sin grant a nadie: solo la llaman las funciones de abajo,
-- que corren como su dueño.

create or replace function public.pro_cuenta_del_tenant(p_tenant_type text, p_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_tenant_type
    when 'venue'    then (select v.owner_id from public.venues v where v.id = p_tenant_id)
    when 'musician' then (select p.id from public.profiles p
                           where p.id = p_tenant_id and p.role = 'musician')
  end
$$;
revoke all on function public.pro_cuenta_del_tenant(text, uuid) from public, anon, authenticated, service_role;

-- 4. admin_cuenta_del_tenant: lo que el admin ve antes de generar ----------------
-- «Pro se activa en la cuenta x@gmail.com». Cero filas si el tenant no tiene cuenta.

create or replace function public.admin_cuenta_del_tenant(p_tenant_type text, p_tenant_id uuid)
returns table (cuenta_id uuid, correo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede ver la cuenta de un tenant';
  end if;
  if p_tenant_type is null or p_tenant_type not in ('venue', 'musician') then
    raise exception 'tenant_type inválido: %', p_tenant_type;
  end if;

  return query
    select u.id, u.email::text
      from auth.users u
     where u.id = public.pro_cuenta_del_tenant(p_tenant_type, p_tenant_id);
end;
$$;
revoke all on function public.admin_cuenta_del_tenant(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_cuenta_del_tenant(text, uuid) to authenticated;

-- 5. admin_crear_codigo_pro ---------------------------------------------------------
-- Misma firma que definía el 108 (la usa la Edge Function del 109). Valida en el
-- orden del spec: tipo y existencia → cuenta → monto → país que cobra.
--
-- El código: 8 caracteres de un alfabeto de 32 sin los ambiguos (0 O 1 I), para
-- dictarlo por WhatsApp. 32 divide a 256, así que `byte % 32` no sesga ninguna
-- letra. Si choca con uno existente, se reintenta.

create or replace function public.admin_crear_codigo_pro(p_tenant_type text, p_tenant_id uuid, p_monto numeric)
returns table (id uuid, codigo text, pais char(2), moneda char(3), nombre text, correo_cuenta text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_existe   boolean;
  v_nombre   text;
  v_pais     char(2);
  v_moneda   char(3);
  v_cuenta   uuid;
  v_correo   text;
  v_bytes    bytea;
  v_codigo   text;
  v_id       uuid;
  v_intento  int := 0;
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo el admin de Sonópolis puede generar un código de Pro';
  end if;
  if p_tenant_type is null or p_tenant_type not in ('venue', 'musician') then
    raise exception 'tenant_type inválido: %', p_tenant_type;
  end if;

  if p_tenant_type = 'venue' then
    select true, v.name, v.pais into v_existe, v_nombre, v_pais
      from public.venues v where v.id = p_tenant_id;
  else
    select true, p.nombre, p.pais into v_existe, v_nombre, v_pais
      from public.profiles p where p.id = p_tenant_id and p.role = 'musician';
  end if;
  if v_existe is null then
    raise exception 'no existe ese %', p_tenant_type;
  end if;

  v_cuenta := public.pro_cuenta_del_tenant(p_tenant_type, p_tenant_id);
  if v_cuenta is null then
    raise exception 'este local no tiene cuenta en Sonópolis: primero tiene que reclamarlo o crearla';
  end if;
  select u.email into v_correo from auth.users u where u.id = v_cuenta;
  if v_correo is null then
    -- correo_cuenta es not null: mejor un mensaje legible que un 23502.
    raise exception 'la cuenta de este tenant no tiene correo';
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'el monto debe ser mayor que 0';
  end if;

  select pc.moneda into v_moneda
    from public.paises_cobro pc where pc.pais = v_pais and pc.activo;
  if v_moneda is null then
    raise exception 'el país del tenant no cobra todavía';
  end if;

  loop
    v_intento := v_intento + 1;
    v_bytes  := extensions.gen_random_bytes(8);
    v_codigo := '';
    for i in 0..7 loop
      v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;

    begin
      insert into public.pro_suscripciones
        (codigo, tenant_type, tenant_id, cuenta_id, correo_cuenta, pais, moneda, monto, creado_por)
      values
        (v_codigo, p_tenant_type, p_tenant_id, v_cuenta, v_correo, v_pais, v_moneda, p_monto, auth.uid())
      returning pro_suscripciones.id into v_id;
      exit;
    exception when unique_violation then
      if v_intento >= 5 then
        raise;
      end if;
    end;
  end loop;

  return query select v_id, v_codigo, v_pais, v_moneda, v_nombre, v_correo;
end;
$$;
revoke all on function public.admin_crear_codigo_pro(text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.admin_crear_codigo_pro(text, uuid, numeric) to authenticated;

-- 6. pro_codigo: lo que ve la página pública ---------------------------------------
-- Sin init_point, tenant_id, ids de Mercado Pago ni quién lo creó. Código
-- inexistente → cero filas.
--
-- es_mi_cuenta y el correo enmascarado salen de la cuenta del tenant HOY
-- (pro_cuenta_del_tenant), no de cuenta_id: si el local cambió de dueño, manda el
-- dueño actual, y el correo que se muestra es el de la cuenta con que hay que entrar.
-- El código se compara en mayúsculas y sin espacios: se dicta por WhatsApp.

create or replace function public.pro_codigo(p_codigo text)
returns table (
  codigo             text,
  tenant_type        text,
  nombre             text,
  monto              numeric,
  moneda             char(3),
  estado             text,
  correo_enmascarado text,
  es_mi_cuenta       boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.codigo,
         s.tenant_type,
         case s.tenant_type
           when 'venue'    then (select v.name   from public.venues v   where v.id = s.tenant_id)
           when 'musician' then (select p.nombre from public.profiles p where p.id = s.tenant_id)
         end,
         s.monto,
         s.moneda,
         s.estado,
         public.enmascarar_email((select u.email::text from auth.users u where u.id = c.cuenta)),
         coalesce(auth.uid() is not null and auth.uid() = c.cuenta, false)
    from public.pro_suscripciones s
   cross join lateral (select public.pro_cuenta_del_tenant(s.tenant_type, s.tenant_id) as cuenta) c
   where s.codigo = upper(btrim(p_codigo))
$$;
revoke all on function public.pro_codigo(text) from public, anon, authenticated;
grant execute on function public.pro_codigo(text) to anon, authenticated;

-- 7. pro_link_de_pago: solo la cuenta del tenant, con sesión -------------------------

create or replace function public.pro_link_de_pago(p_codigo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.pro_suscripciones;
begin
  select * into s from public.pro_suscripciones x
   where x.codigo = upper(btrim(p_codigo))
   for update;
  if not found then
    raise exception 'este código no existe';
  end if;

  if auth.uid() is null
     or auth.uid() is distinct from public.pro_cuenta_del_tenant(s.tenant_type, s.tenant_id) then
    raise exception 'este código es de otra cuenta de Sonópolis';
  end if;

  if s.estado <> 'esperando' then
    raise exception 'esta suscripción ya está %', s.estado;
  end if;

  if s.init_point is null then
    raise exception 'este código no tiene link de pago';
  end if;

  update public.pro_suscripciones
     set link_pedido_at = coalesce(link_pedido_at, now())
   where id = s.id;

  return s.init_point;
end;
$$;
revoke all on function public.pro_link_de_pago(text) from public, anon, authenticated;
grant execute on function public.pro_link_de_pago(text) to authenticated;

-- 8. pro_registrar_pago: cada cobro aprobado corre la fecha del tenant -------------
-- Solo service_role (la Edge Function del 109). Misma firma que el 108.
--
-- Nueva fecha = greatest(fecha actual, pago + 1 mes + 3 días): anclar al día del
-- pago no acumula desfase (12 × 30 días ≠ un año), no cuenta dos veces un mes con
-- pago manual y automático, y respeta los días regalados a mano. Los 3 días cubren
-- el reintento de Mercado Pago cuando la tarjeta falla el día del cobro.
--
-- pro_pagos.mp_pago_id único es la idempotencia: MP repite avisos, y un cobro ya
-- procesado devuelve la fecha actual sin tocar nada.

create or replace function public.pro_registrar_pago(
  p_mp_pago_id        text,
  p_mp_plan_id        text,
  p_mp_preapproval_id text,
  p_monto             numeric,
  p_pagado_at         timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        public.pro_suscripciones;
  v_antes  timestamptz;
  v_nuevo  timestamptz;
  v_pago   uuid;
begin
  select * into s from public.pro_suscripciones x
   where x.mp_plan_id = p_mp_plan_id
   for update;
  if not found then
    raise exception 'suscripcion_desconocida: no hay suscripción con el plan %', p_mp_plan_id;
  end if;

  -- Misma guarda que finalizarTicket (spec 105).
  if p_monto is null or p_monto < s.monto then
    raise exception 'monto_menor_al_plan: llegó %, el plan cobra %', p_monto, s.monto;
  end if;

  -- Lock de la fila del tenant: dos cobros concurrentes no leen la misma fecha.
  if s.tenant_type = 'venue' then
    select v.sonopolis_pro_hasta into v_antes from public.venues v
     where v.id = s.tenant_id for update;
  else
    select p.sonopolis_pro_hasta into v_antes from public.profiles p
     where p.id = s.tenant_id for update;
  end if;

  v_nuevo := greatest(coalesce(v_antes, now()),
                      p_pagado_at + interval '1 month' + interval '3 days');

  insert into public.pro_pagos
    (mp_pago_id, suscripcion_id, monto, pagado_at, hasta_antes, hasta_despues)
  values
    (p_mp_pago_id, s.id, p_monto, p_pagado_at, v_antes, v_nuevo)
  on conflict (mp_pago_id) do nothing
  returning id into v_pago;

  if v_pago is null then
    return v_antes;
  end if;

  if s.tenant_type = 'venue' then
    update public.venues set sonopolis_pro_hasta = v_nuevo where id = s.tenant_id;
  else
    update public.profiles set sonopolis_pro_hasta = v_nuevo where id = s.tenant_id;
  end if;

  update public.pro_suscripciones
     set mp_preapproval_id = coalesce(mp_preapproval_id, p_mp_preapproval_id),
         estado            = 'activa'
   where id = s.id;

  insert into public.pro_cambios
    (tenant_type, tenant_id, hasta_antes, hasta_despues, por, fuente, pago_id)
  values
    (s.tenant_type, s.tenant_id, v_antes, v_nuevo, null, 'mercadopago', v_pago);

  return v_nuevo;
end;
$$;
revoke all on function public.pro_registrar_pago(text, text, text, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.pro_registrar_pago(text, text, text, numeric, timestamptz) to service_role;
