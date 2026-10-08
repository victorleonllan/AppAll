-- Spec 113 — Redes sociales del CRM: cuentas conectadas, publicaciones y su cola.
-- Ver specs/113-datos-redes-sociales-del-crm.md
--
-- Cinco tablas con RLS y sin policies: solo las lee y escribe el service_role desde las
-- API routes de la web, después de comprobar con la sesión que el tenant es del usuario
-- y que tiene Pro. Los tokens llegan cifrados por la web (AES-256-GCM); la base nunca
-- los ve en claro.

-- 0. updated_at --------------------------------------------------------------------------
-- No hay una función genérica en la base: cada tabla tiene la suya (spec 110). Esta sirve
-- a las dos tablas de redes que tienen updated_at.
create or replace function public.redes_tocar_updated_at()
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
revoke all on function public.redes_tocar_updated_at() from public, anon, authenticated;

-- 1. redes_conexiones ----------------------------------------------------------------------
create table public.redes_conexiones (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_type        text        not null check (tenant_type in ('venue', 'musician')),
  tenant_id          uuid        not null,   -- venues.id o profiles.id según tenant_type
  red                text        not null check (red in ('instagram', 'facebook', 'threads', 'x', 'tiktok')),
  proveedor          text        not null check (proveedor in ('meta', 'zernio')),
  cuenta_externa_id  text        not null,   -- cuenta de IG, página de FB, usuario de Threads o accountId de Zernio
  usuario_externo_id text,                   -- id app-scoped de Meta; llega en las llamadas de baja
  cuenta_nombre      text,
  cuenta_avatar      text,
  token_cifrado      text,                   -- null en Zernio (el token lo guarda Zernio)
  token_expira_at    timestamptz,            -- null = no vence
  estado             text        not null default 'activa' check (estado in ('activa', 'reconectar')),
  error              text,
  conectada_por      uuid        not null references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_type, tenant_id, red),
  check ((red in ('instagram', 'facebook', 'threads')) = (proveedor = 'meta'))
);
create index redes_conexiones_baja_meta_idx
  on public.redes_conexiones (proveedor, usuario_externo_id);

create trigger redes_conexiones_updated_at_trg
  before update on public.redes_conexiones
  for each row execute function public.redes_tocar_updated_at();

-- 2. redes_conexiones_pendientes -----------------------------------------------------------
-- Lista de páginas de Facebook (con su token, cifrada) mientras quien conecta elige una.
create table public.redes_conexiones_pendientes (
  id                uuid        primary key default gen_random_uuid(),
  tenant_type       text        not null check (tenant_type in ('venue', 'musician')),
  tenant_id         uuid        not null,
  red               text        not null check (red = 'facebook'),
  opciones_cifradas text        not null,
  creada_por        uuid        not null references auth.users(id),
  expira_at         timestamptz not null default now() + interval '15 minutes'
);

-- 3. redes_zernio_perfiles -----------------------------------------------------------------
create table public.redes_zernio_perfiles (
  tenant_type text        not null check (tenant_type in ('venue', 'musician')),
  tenant_id   uuid        not null,
  perfil_id   text        not null unique,   -- _id del perfil en Zernio
  created_at  timestamptz not null default now(),
  primary key (tenant_type, tenant_id)
);

-- 4. redes_publicaciones -------------------------------------------------------------------
-- `estado` no se escribe a mano: lo calcula el trigger del punto 6 desde los destinos.
create table public.redes_publicaciones (
  id               uuid        primary key default gen_random_uuid(),
  tenant_type      text        not null check (tenant_type in ('venue', 'musician')),
  tenant_id        uuid        not null,
  evento_id        uuid        references public.events(id) on delete set null,
  texto            text        not null default '',
  textos_por_red   jsonb       not null default '{}',   -- {"x": "...", "instagram": "..."}
  medios           jsonb       not null default '[]',   -- [{path, url, tipo, ancho, alto, duracion}]
  opciones_por_red jsonb       not null default '{}',   -- {"tiktok": {privacidad, comentarios, ...}}
  programada_para  timestamptz,                         -- null = ahora
  estado           text        not null default 'programada'
                               check (estado in ('programada', 'publicando', 'publicada', 'parcial', 'fallida', 'cancelada')),
  creada_por       uuid        not null references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index redes_publicaciones_historial_idx
  on public.redes_publicaciones (tenant_type, tenant_id, created_at desc);

create trigger redes_publicaciones_updated_at_trg
  before update on public.redes_publicaciones
  for each row execute function public.redes_tocar_updated_at();

-- 5. redes_destinos ------------------------------------------------------------------------
-- `esperando`: Instagram, Threads y TikTok procesan el medio en un contenedor antes de
-- publicar. El orquestador lo vuelve a revisar en la pasada siguiente.
create table public.redes_destinos (
  id              uuid        primary key default gen_random_uuid(),
  publicacion_id  uuid        not null references public.redes_publicaciones(id) on delete cascade,
  red             text        not null check (red in ('instagram', 'facebook', 'threads', 'x', 'tiktok')),
  conexion_id     uuid        references public.redes_conexiones(id) on delete set null,
  estado          text        not null default 'pendiente'
                              check (estado in ('pendiente', 'publicando', 'esperando', 'publicada', 'fallida', 'cancelada')),
  listo_at        timestamptz not null,   -- desde cuándo se puede tomar
  tomado_at       timestamptz,            -- última vez que un proceso lo tomó
  esperando_desde timestamptz,            -- primera vez que quedó 'esperando'
  intentos        int         not null default 0,
  contenedor_id   text,                   -- contenedor de Meta o post de Zernio en proceso
  externo_id      text,                   -- id del post ya publicado
  url_externa     text,
  error           text,
  publicado_at    timestamptz,
  unique (publicacion_id, red)
);
create index redes_destinos_cola_idx
  on public.redes_destinos (listo_at)
  where estado in ('pendiente', 'esperando', 'publicando');

-- RLS sin policies en las cinco: ni anon ni authenticated leen ni escriben.
alter table public.redes_conexiones            enable row level security;
alter table public.redes_conexiones_pendientes enable row level security;
alter table public.redes_zernio_perfiles       enable row level security;
alter table public.redes_publicaciones         enable row level security;
alter table public.redes_destinos              enable row level security;

-- Explícito por el bug de W-196: service_role no es superusuario y no siempre hereda
-- los grants por defecto.
grant select, insert, update, delete on
  public.redes_conexiones,
  public.redes_conexiones_pendientes,
  public.redes_zernio_perfiles,
  public.redes_publicaciones,
  public.redes_destinos
to service_role;

-- 6. El estado de la publicación sale de sus destinos --------------------------------------
create or replace function public.redes_recalcular_estado_publicacion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_programada_para timestamptz;
  v_total      int;
  v_pendiente  int;
  v_en_curso   int;   -- publicando o esperando
  v_publicada  int;
  v_fallida    int;
  v_estado     text;
begin
  select p.programada_para into v_programada_para
  from public.redes_publicaciones p
  where p.id = new.publicacion_id;

  select count(*),
         count(*) filter (where d.estado = 'pendiente'),
         count(*) filter (where d.estado in ('publicando', 'esperando')),
         count(*) filter (where d.estado = 'publicada'),
         count(*) filter (where d.estado = 'fallida')
    into v_total, v_pendiente, v_en_curso, v_publicada, v_fallida
  from public.redes_destinos d
  where d.publicacion_id = new.publicacion_id
    and d.estado <> 'cancelada';

  if v_total = 0 then
    v_estado := 'cancelada';
  elsif v_pendiente = v_total and v_programada_para > now() then
    v_estado := 'programada';
  elsif v_pendiente + v_en_curso > 0 then
    v_estado := 'publicando';
  elsif v_publicada = v_total then
    v_estado := 'publicada';
  elsif v_publicada > 0 then
    v_estado := 'parcial';
  else
    v_estado := 'fallida';
  end if;

  update public.redes_publicaciones
  set estado = v_estado,
      updated_at = now()
  where id = new.publicacion_id;

  return null;
end;
$$;
revoke all on function public.redes_recalcular_estado_publicacion() from public, anon, authenticated;

create trigger redes_destinos_estado_trg
  after insert or update of estado on public.redes_destinos
  for each row execute function public.redes_recalcular_estado_publicacion();

-- 7. redes_tomar_destinos ------------------------------------------------------------------
-- `skip locked` deja que el cron de cada minuto y el «publicar ahora» de la web corran a la
-- vez sin tomar el mismo destino dos veces.
create or replace function public.redes_tomar_destinos(p_limite int default 10)
returns setof public.redes_destinos
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Colgados: no se reintentan solos. Si el proceso murió justo después de que la red
  -- aceptó el post, reintentar lo duplicaría en la cuenta del local.
  update public.redes_destinos d
  set estado = 'fallida',
      error  = 'La publicación se cortó a mitad de camino. Revisa tu cuenta antes de reintentar: puede que se haya publicado.'
  where d.id in (
    select c.id
    from public.redes_destinos c
    where c.estado = 'publicando'
      and c.tomado_at < now() - interval '10 minutes'
    for update skip locked
  );

  -- Toma. intentos + 1 solo desde 'pendiente': revisar un contenedor no es un intento nuevo.
  return query
  with tomados as (
    select c.id
    from public.redes_destinos c
    where c.estado in ('pendiente', 'esperando')
      and c.listo_at <= now()
    order by c.listo_at
    limit greatest(coalesce(p_limite, 10), 0)
    for update skip locked
  )
  update public.redes_destinos d
  set estado    = 'publicando',
      tomado_at = now(),
      intentos  = d.intentos + case when d.estado = 'pendiente' then 1 else 0 end
  from tomados t
  where d.id = t.id
  returning d.*;
end;
$$;
revoke all on function public.redes_tomar_destinos(int) from public, anon, authenticated;
grant execute on function public.redes_tomar_destinos(int) to service_role;

-- 8. Bucket redes --------------------------------------------------------------------------
-- Público: Meta y Zernio descargan el medio desde una URL, minutos después; una URL
-- firmada podría vencer antes. Solo JPEG en imágenes porque Instagram solo acepta JPEG.
-- Sin policies de storage.objects: la web sube con createSignedUploadUrl del service_role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('redes', 'redes', true, 104857600,
        array['image/jpeg', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

-- 9. El disparador: pg_cron + pg_net -------------------------------------------------------
-- El plan Hobby de Vercel solo da 2 crons diarios y ya están usados; una publicación
-- programada a las 20:00 tiene que salir a las 20:00.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Si falta alguno de los dos secretos, no hace nada. pg_net no espera la respuesta.
create or replace function public.redes_llamar_web(p_ruta text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_base    text;
  v_secreto text;
begin
  select s.decrypted_secret into v_base
  from vault.decrypted_secrets s
  where s.name = 'sonopolis_web_url';

  select s.decrypted_secret into v_secreto
  from vault.decrypted_secrets s
  where s.name = 'cron_secret';

  if v_base is null or v_secreto is null then
    return;
  end if;

  perform net.http_get(
    url                  := rtrim(v_base, '/') || p_ruta,
    headers              := jsonb_build_object('Authorization', 'Bearer ' || v_secreto),
    timeout_milliseconds := 5000
  );
end;
$$;
revoke all on function public.redes_llamar_web(text) from public, anon, authenticated;

-- Solo llama a la web si hay algo vencido: la mayoría de los minutos no hay llamada HTTP.
create or replace function public.redes_tick()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.redes_destinos d
    where d.estado in ('pendiente', 'esperando')
      and d.listo_at <= now()
  ) then
    perform public.redes_llamar_web('/api/cron/redes-publicar');
  end if;
end;
$$;
revoke all on function public.redes_tick() from public, anon, authenticated;

-- La URL de la web no es secreta, pero así los dos valores se leen igual.
-- cron_secret NO va acá: Victor lo crea una vez en el SQL editor con el valor de
-- CRON_SECRET de Vercel: select vault.create_secret('<valor>', 'cron_secret');
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sonopolis_web_url') then
    perform vault.create_secret('https://sonopolis.org', 'sonopolis_web_url');
  end if;
end;
$$;

-- Jobs: si ya existen, se reemplazan.
do $$
begin
  perform cron.unschedule('redes-publicar');
exception when others then
  null;
end;
$$;
do $$
begin
  perform cron.unschedule('redes-mantenimiento');
exception when others then
  null;
end;
$$;

select cron.schedule('redes-publicar', '* * * * *', 'select public.redes_tick()');
-- 08:00 UTC = 04:00 o 05:00 en Chile.
select cron.schedule('redes-mantenimiento', '0 8 * * *',
                     $$select public.redes_llamar_web('/api/cron/redes-mantenimiento')$$);
