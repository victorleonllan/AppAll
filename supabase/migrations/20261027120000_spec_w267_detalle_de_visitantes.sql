-- Spec W-267 — detalle de cada visitante: quién es, de dónde llegó y si compró.
-- Ver sonopolisWeb/specs/w267-datos-detalle-de-cada-visitante.md
--
-- visitas_web empieza a guardar el usuario con sesión, el host del sitio del que llegó,
-- el utm_source y el ticket de la compra que confirmó. admin_visitantes devuelve un
-- visitante por fila con su recorrido y sus compras. Revierte la decisión de W-261 §2
-- de no guardar user_id, a pedido de Victor.

-- 1. Columnas nuevas (NULL en las filas existentes) -----------------------------------
-- Solo el host del referrer: la ruta puede traer datos de otro sitio (un id de chat,
-- una búsqueda) y el host alcanza para saber si vino de Instagram o de Google.
alter table public.visitas_web
  add column if not exists user_id uuid null
    references auth.users(id) on delete set null,
  add column if not exists referente text null
    check (referente is null or referente ~ '^[a-z0-9.-]{1,253}$'),
  add column if not exists utm_source text null
    check (utm_source is null or char_length(utm_source) between 1 and 100),
  -- Una compra con invitado (tickets.guest_email, sin user_id) no tiene otro hilo hacia
  -- el navegador que la hizo: la confirmación /compra/confirmacion?ticketId=… sí.
  add column if not exists ticket_id uuid null
    references public.tickets(id) on delete set null;

-- admin_visitantes agrupa por visitante dentro del período.
create index if not exists visitas_web_visitante_idx
  on public.visitas_web (visitante, created_at);

create index if not exists visitas_web_user_idx
  on public.visitas_web (user_id) where user_id is not null;

-- 2. registrar_visita con referente, utm_source y ticket ------------------------------
-- La firma vieja se borra: con las dos vivas, una llamada con tres argumentos con nombre
-- sería ambigua. Los defaults mantienen funcionando al código desplegado (W-262).
drop function if exists public.registrar_visita(text, uuid, text);

create or replace function public.registrar_visita(
  p_pais        text,
  p_visitante   uuid,
  p_ruta        text,
  p_referente   text default null,
  p_utm_source  text default null,
  p_ticket_id   uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ticket_id uuid;
begin
  if public.es_admin_sonopolis() then
    return;
  end if;

  -- Un id inventado queda NULL en vez de tirar un error de FK.
  if p_ticket_id is not null then
    select t.id into v_ticket_id from public.tickets t where t.id = p_ticket_id;
  end if;

  -- referente no se normaliza: uno con mayúsculas o con ruta es un bug del llamador
  -- (W-268) y falla por CHECK, igual que país y ruta en W-261.
  insert into public.visitas_web
    (pais, visitante, ruta, con_sesion, user_id, referente, utm_source, ticket_id)
  values
    (p_pais, p_visitante, p_ruta, auth.uid() is not null, auth.uid(),
     p_referente, lower(p_utm_source), v_ticket_id);
end;
$$;

revoke execute on function public.registrar_visita(text, uuid, text, text, text, uuid) from public;
grant execute on function public.registrar_visita(text, uuid, text, text, text, uuid)
  to anon, authenticated;

-- 3. admin_visitantes -----------------------------------------------------------------
-- Un visitante por fila con al menos una visita desde p_desde, los 500 más recientes
-- (la página no pagina, W-269). Se defiende sola: el email sale de auth.users porque
-- profiles no tiene el correo de login, y por eso el corte de admin va antes que todo.
create or replace function public.admin_visitantes(p_desde timestamptz)
returns table (
  visitante   uuid,
  pais        text,
  primera     timestamptz,
  ultima      timestamptz,
  visitas     bigint,
  referente   text,
  utm_source  text,
  user_id     uuid,
  nombre      text,
  email       text,
  compras     bigint,
  entradas    bigint,
  recorrido   jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.es_admin_sonopolis() then
    raise exception 'solo admin' using errcode = '42501';
  end if;

  return query
    with resumen as (
      select v.visitante,
             min(v.created_at) as primera,
             max(v.created_at) as ultima,
             count(*)          as visitas
        from public.visitas_web v
       where v.created_at >= p_desde
       group by v.visitante
       order by max(v.created_at) desc
       limit 500
    )
    select r.visitante,
           ult.pais,
           r.primera,
           r.ultima,
           r.visitas,
           ref.referente,
           utm.utm_source,
           usr.user_id,
           pr.nombre,
           au.email::text,
           coalesce(cmp.compras, 0)  as compras,
           coalesce(cmp.entradas, 0) as entradas,
           rec.recorrido
      from resumen r
      -- País de su visita más reciente.
      cross join lateral (
        select v.pais
          from public.visitas_web v
         where v.visitante = r.visitante and v.created_at >= p_desde
         order by v.created_at desc, v.id desc
         limit 1
      ) ult
      -- Referente y utm_source de su primera visita del período que los tenga.
      left join lateral (
        select v.referente
          from public.visitas_web v
         where v.visitante = r.visitante and v.created_at >= p_desde
           and v.referente is not null
         order by v.created_at, v.id
         limit 1
      ) ref on true
      left join lateral (
        select v.utm_source
          from public.visitas_web v
         where v.visitante = r.visitante and v.created_at >= p_desde
           and v.utm_source is not null
         order by v.created_at, v.id
         limit 1
      ) utm on true
      -- El último user_id no nulo.
      left join lateral (
        select v.user_id
          from public.visitas_web v
         where v.visitante = r.visitante and v.created_at >= p_desde
           and v.user_id is not null
         order by v.created_at desc, v.id desc
         limit 1
      ) usr on true
      left join public.profiles pr on pr.id = usr.user_id
      left join auth.users au on au.id = usr.user_id
      -- Compras ligadas: tickets completed confirmados en sus visitas, más los de su
      -- usuario creados desde su primera visita. Cada ticket se cuenta una vez porque
      -- se recorre tickets, no la unión de los dos caminos.
      left join lateral (
        select count(*)          as compras,
               sum(t.cantidad)::bigint as entradas
          from public.tickets t
         where t.status = 'completed'
           and (
             t.id in (
               select v.ticket_id
                 from public.visitas_web v
                where v.visitante = r.visitante and v.created_at >= p_desde
                  and v.ticket_id is not null
             )
             or (usr.user_id is not null
                 and t.user_id = usr.user_id
                 and t.created_at >= r.primera)
           )
      ) cmp on true
      -- Las últimas 50 visitas del período, viejas primero. El evento se resuelve acá
      -- para no hacer una consulta por evento desde la web.
      cross join lateral (
        select coalesce(
                 jsonb_agg(
                   jsonb_build_object('ruta', u.ruta, 'at', u.created_at, 'evento', u.evento)
                   order by u.created_at, u.id
                 ),
                 '[]'::jsonb
               ) as recorrido
          from (
            select v.id,
                   v.ruta,
                   v.created_at,
                   e.artist_name || ' · ' || e.venue_name as evento
              from public.visitas_web v
              -- El case (y no un and) garantiza que el cast a uuid solo corre sobre
              -- rutas /cartelera/<uuid>; un and no fija el orden de evaluación.
              left join public.events e
                on e.id = case
                            when v.ruta ~ '^/cartelera/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                            then substring(v.ruta from 12)::uuid
                          end
             where v.visitante = r.visitante and v.created_at >= p_desde
             order by v.created_at desc, v.id desc
             limit 50
          ) u
      ) rec
     order by r.ultima desc;
end;
$$;

revoke execute on function public.admin_visitantes(timestamptz) from public, anon;
grant execute on function public.admin_visitantes(timestamptz) to authenticated;
