-- Spec 185 — el muro de locales y bandas: publicaciones, comentarios y eventos pasados.
--
-- Dos tablas nuevas y cuatro funciones. Las publicaciones son la copia pública de un
-- correo del CRM (la inserta el servidor al enviarlo, W-279); los comentarios los deja
-- cualquier cuenta con sesión. Los flyers de eventos pasados NO se copian: salen de
-- `events` con una función, para no sincronizar cada edición o cancelación.
--
-- No se reutiliza crm_correos: tiene columnas que no son públicas (enviado_por,
-- segmento, destinatarios) y la RLS recorta por fila, no por columna.
--
-- Idempotente: corre dos veces sin error.

-- 1. muro_es_dueno: quién modera un muro ---------------------------------------------
-- El músico dueño del perfil, el dueño del local o el admin de Sonópolis.
-- coalesce: sin sesión auth.uid() es nulo y la comparación daría null, no false.

create or replace function public.muro_es_dueno(p_tenant_type text, p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (p_tenant_type = 'musician' and p_tenant_id = auth.uid())
    or (p_tenant_type = 'venue' and exists (
          select 1 from public.venues v
           where v.id = p_tenant_id and v.owner_id = auth.uid()))
    or public.es_admin_sonopolis(),
    false);
$$;
revoke all on function public.muro_es_dueno(text, uuid) from public, anon;
grant execute on function public.muro_es_dueno(text, uuid) to authenticated;

-- 2. muro_publicaciones: la copia pública de un correo -------------------------------

create table if not exists public.muro_publicaciones (
  id          uuid        primary key default gen_random_uuid(),
  tenant_type text        not null check (tenant_type in ('venue', 'musician')),
  tenant_id   uuid        not null,
  -- El correo del que es copia. unique: un correo se publica una sola vez.
  correo_id   uuid        unique references public.crm_correos(id) on delete set null,
  titulo      text        not null check (char_length(titulo) between 1 and 120),
  cuerpo      text        not null check (char_length(cuerpo) between 1 and 3000),
  created_at  timestamptz not null default now()
);
create index if not exists muro_publicaciones_tenant_idx
  on public.muro_publicaciones (tenant_type, tenant_id, created_at desc);
alter table public.muro_publicaciones enable row level security;
-- Explícito, para no depender de los privilegios por defecto del proyecto.
grant select on public.muro_publicaciones to anon, authenticated;
grant delete on public.muro_publicaciones to authenticated;

-- El muro es público. Sin policy de insert ni update: inserta el servidor con
-- service_role al mandar el correo, y una publicación no se edita: se quita.
drop policy if exists muro_publicaciones_select_publico on public.muro_publicaciones;
create policy muro_publicaciones_select_publico on public.muro_publicaciones
  for select to anon, authenticated using (true);

drop policy if exists muro_publicaciones_delete_dueno on public.muro_publicaciones;
create policy muro_publicaciones_delete_dueno on public.muro_publicaciones
  for delete to authenticated using (public.muro_es_dueno(tenant_type, tenant_id));

-- 3. muro_comentarios: lo que escribe el público -------------------------------------
-- El comentario de un evento lleva también el muro (tenant_type, tenant_id): el mismo
-- evento sale en el muro del local y en el de la banda, y cada muro tiene sus propios
-- comentarios y su propio dueño que modera.

create table if not exists public.muro_comentarios (
  id             uuid        primary key default gen_random_uuid(),
  tenant_type    text        not null check (tenant_type in ('venue', 'musician')),
  tenant_id      uuid        not null,
  publicacion_id uuid        references public.muro_publicaciones(id) on delete cascade,
  event_id       uuid        references public.events(id) on delete cascade,
  autor_id       uuid        not null references auth.users(id) on delete cascade,
  -- Lo pone muro_comentar, nunca el cliente: los perfiles de fans no son públicos.
  autor_nombre   text        not null,
  cuerpo         text        not null check (char_length(cuerpo) between 1 and 500),
  created_at     timestamptz not null default now(),
  -- De una publicación o de un evento pasado, nunca de los dos ni de ninguno.
  constraint muro_comentarios_un_destino check (num_nonnulls(publicacion_id, event_id) = 1)
);
create index if not exists muro_comentarios_publicacion_idx
  on public.muro_comentarios (publicacion_id, created_at);
create index if not exists muro_comentarios_evento_idx
  on public.muro_comentarios (tenant_type, tenant_id, event_id, created_at);
alter table public.muro_comentarios enable row level security;
grant select on public.muro_comentarios to anon, authenticated;
grant delete on public.muro_comentarios to authenticated;

-- Sin policy de insert ni update: se escribe solo con muro_comentar.
drop policy if exists muro_comentarios_select_publico on public.muro_comentarios;
create policy muro_comentarios_select_publico on public.muro_comentarios
  for select to anon, authenticated using (true);

drop policy if exists muro_comentarios_delete_autor_o_dueno on public.muro_comentarios;
create policy muro_comentarios_delete_autor_o_dueno on public.muro_comentarios
  for delete to authenticated
  using (autor_id = auth.uid() or public.muro_es_dueno(tenant_type, tenant_id));

-- 4. muro_evento_es_de: qué evento va en qué muro ------------------------------------
-- La regla vive solo acá: la usan muro_eventos_pasados y muro_comentar.
-- Evento publicado, visible, ya pasado y con flyer. Con comienza_at nulo no entra: no
-- se sabe si ya pasó. La pertenencia del músico es la de cuentasDelEvento (W-194):
-- quien creó el evento o el músico detrás de su artista.

create or replace function public.muro_evento_es_de(
  p_tenant_type text,
  p_tenant_id   uuid,
  p_event_id    uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.events e
     where e.id = p_event_id
       and e.status not in ('draft', 'cancelled')
       and coalesce(e.visible_en_cartelera, true)
       and e.comienza_at < now()
       and e.imagen is not null
       and e.imagen <> ''
       and (
         (p_tenant_type = 'venue' and e.venue_id = p_tenant_id)
         or (p_tenant_type = 'musician' and (
               e.created_by = p_tenant_id
               or exists (
                    select 1 from public.artists a
                     where a.id = e.artist_id and a.profile_id = p_tenant_id)))
       )
  );
$$;
revoke all on function public.muro_evento_es_de(text, uuid, uuid) from public;
grant execute on function public.muro_evento_es_de(text, uuid, uuid) to anon, authenticated;

-- 5. muro_eventos_pasados: los flyers del muro ---------------------------------------
-- coalesce del límite: con un null explícito greatest() lo ignoraría y devolvería 1.

create or replace function public.muro_eventos_pasados(
  p_tenant_type text,
  p_tenant_id   uuid,
  p_limite      int default 30
)
returns table (
  id          uuid,
  artist_name text,
  venue_name  text,
  comienza_at timestamptz,
  imagen      text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.artist_name, e.venue_name, e.comienza_at, e.imagen
    from public.events e
   where public.muro_evento_es_de(p_tenant_type, p_tenant_id, e.id)
   order by e.comienza_at desc
   limit least(greatest(coalesce(p_limite, 30), 1), 100);
$$;
revoke all on function public.muro_eventos_pasados(text, uuid, int) from public;
grant execute on function public.muro_eventos_pasados(text, uuid, int) to anon, authenticated;

-- 6. muro_comentar: la única forma de escribir un comentario -------------------------
-- Comenta cualquier cuenta con sesión (fan, músico o local). El nombre del autor lo
-- lee el servidor de profiles: si lo mandara el cliente, cualquiera firmaría con el
-- nombre de otro. Nunca el correo.

create or replace function public.muro_comentar(
  p_tenant_type    text,
  p_tenant_id      uuid,
  p_publicacion_id uuid,
  p_event_id       uuid,
  p_cuerpo         text
)
returns public.muro_comentarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_cuerpo text := btrim(p_cuerpo);
  v_nombre text;
  v_fila   public.muro_comentarios;
begin
  if v_uid is null then
    raise exception 'sin_sesion' using errcode = '42501';
  end if;

  if v_cuerpo is null or v_cuerpo = '' or char_length(v_cuerpo) > 500 then
    raise exception 'comentario_invalido' using errcode = '22023';
  end if;

  if num_nonnulls(p_publicacion_id, p_event_id) <> 1 then
    raise exception 'destino_desconocido' using errcode = '22023';
  end if;

  if p_publicacion_id is not null then
    if not exists (
      select 1 from public.muro_publicaciones p
       where p.id = p_publicacion_id
         and p.tenant_type = p_tenant_type
         and p.tenant_id = p_tenant_id
    ) then
      raise exception 'destino_desconocido' using errcode = '22023';
    end if;
  elsif not public.muro_evento_es_de(p_tenant_type, p_tenant_id, p_event_id) then
    raise exception 'destino_desconocido' using errcode = '22023';
  end if;

  -- Freno contra spam: 10 comentarios cada 10 minutos, contando todos los muros.
  -- El undécimo se rechaza.
  if (select count(*) from public.muro_comentarios c
       where c.autor_id = v_uid
         and c.created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'demasiados_comentarios' using errcode = 'P0001';
  end if;

  select nullif(btrim(p.nombre), '') into v_nombre
    from public.profiles p
   where p.id = v_uid;

  insert into public.muro_comentarios
    (tenant_type, tenant_id, publicacion_id, event_id, autor_id, autor_nombre, cuerpo)
  values
    (p_tenant_type, p_tenant_id, p_publicacion_id, p_event_id, v_uid,
     coalesce(v_nombre, 'Fan'), v_cuerpo)
  returning * into v_fila;

  return v_fila;
end;
$$;
revoke all on function public.muro_comentar(text, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.muro_comentar(text, uuid, uuid, uuid, text) to authenticated;
