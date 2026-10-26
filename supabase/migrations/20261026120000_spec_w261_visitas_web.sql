-- Spec W-261 — visitas de la web por cartelera de país.
-- Ver sonopolisWeb/specs/w261-datos-visitas-por-pais.md
--
-- Una fila por página vista de sonopolis web, con el país de la cartelera que se vio
-- (el que resuelve getPaisActivo, no el de la IP) y un id anónimo del navegador.
-- Nadie lee ni escribe la tabla directo: solo registrar_visita (anon/authenticated)
-- y admin_visitas_por_pais (solo el admin de Sonópolis).
--
-- El spec nombra public.es_admin(); esa función ya no existe (el spec 077 la renombró
-- a es_admin_sonopolis() y borró la vieja). Se usa la vigente. Ver addenda del spec.

-- 1. Tabla ----------------------------------------------------------------------------
create table if not exists public.visitas_web (
  id          bigint      generated always as identity primary key,
  pais        text        not null check (pais ~ '^[A-Z]{2}$'),
  visitante   uuid        not null,
  ruta        text        not null
                          check (char_length(ruta) between 1 and 300 and left(ruta, 1) = '/'),
  con_sesion  boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- La consulta del admin siempre filtra por rango de fechas.
create index if not exists visitas_web_created_at_idx
  on public.visitas_web (created_at);

-- Sin policies: solo se lee y escribe por las funciones de abajo.
alter table public.visitas_web enable row level security;

-- 2. registrar_visita -----------------------------------------------------------------
-- El admin no cuenta: si no, sus propias revisiones de la web inflan los números que
-- él mismo mira. Un país o ruta mal formados fallan por CHECK a propósito: el llamador
-- es código propio (W-262), y un dato inválido ahí es un bug.
create or replace function public.registrar_visita(p_pais text, p_visitante uuid, p_ruta text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.es_admin_sonopolis() then
    return;
  end if;

  insert into public.visitas_web (pais, visitante, ruta, con_sesion)
  values (p_pais, p_visitante, p_ruta, auth.uid() is not null);
end;
$$;

revoke execute on function public.registrar_visita(text, uuid, text) from public;
grant execute on function public.registrar_visita(text, uuid, text) to anon, authenticated;

-- 3. admin_visitas_por_pais -----------------------------------------------------------
-- Se defiende sola: la guarda de app/(private)/admin/layout.js es solo de navegación.
create or replace function public.admin_visitas_por_pais(p_desde timestamptz)
returns table (
  pais                  text,
  visitas               bigint,
  visitantes            bigint,
  visitantes_con_sesion bigint
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
    select v.pais,
           count(*)                                            as visitas,
           count(distinct v.visitante)                         as visitantes,
           count(distinct v.visitante) filter (where v.con_sesion) as visitantes_con_sesion
      from public.visitas_web v
     where v.created_at >= p_desde
     group by v.pais
     order by 3 desc, 1;  -- visitantes desc, pais (por posición: los nombres chocan con los OUT)
end;
$$;

revoke execute on function public.admin_visitas_por_pais(timestamptz) from public, anon;
grant execute on function public.admin_visitas_por_pais(timestamptz) to authenticated;
