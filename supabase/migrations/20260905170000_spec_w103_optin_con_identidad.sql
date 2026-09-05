-- Spec W-103 — `whatsapp_opt_ins` guarda a quién pertenece el teléfono.
-- Ver sonopolisWeb/specs/w103-datos-optin-con-identidad.md
--
-- Hoy un opt-in es un teléfono suelto (W-049). Sin saber de qué persona es, el
-- CRM (W-099) cuenta dos veces al mismo humano —agrupa por email, y un opt-in
-- sin email nunca se fusiona con la compra de esa persona— y la difusión no se
-- puede segmentar por "los que ya compraron" (W-107).

-- 1. Las columnas de identidad ---------------------------------------------
--
-- Ambas nullable, y así se quedan: el opt-in del perfil público (W-053)
-- funciona sin cuenta y sin pedir email, y eso no se toca — pedir un email
-- para recibir un WhatsApp es fricción sin motivo. Se llenan cuando la fuente
-- las conoce: la compra (W-104) sí conoce las dos.
--
-- `on delete set null` y no `cascade`: si el usuario borra su cuenta, su
-- consentimiento no desaparece — hay que seguir honrando el opt-out asociado a
-- ese teléfono.
alter table public.whatsapp_opt_ins
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists email   text;

-- Por `lower(email)`: es como consulta el CRM (la vista agrupa por
-- `lower(comprador_email)`), y un índice sobre la columna cruda no serviría.
create index if not exists whatsapp_opt_ins_email_idx
  on public.whatsapp_opt_ins (lower(email));

-- La unicidad NO cambia: sigue siendo (tenant_type, tenant_id, phone_e164). El
-- teléfono es la identidad del canal; dos personas que comparten un número
-- comparten el opt-in, que es exactamente como se comporta WhatsApp.

-- 2. El RPC: drop + create, no un replace ----------------------------------
--
-- Postgres identifica una función por su firma completa, así que un
-- `create or replace` con dos argumentos más NO reemplaza: crea una sobrecarga.
-- Quedarían dos `crear_optin_whatsapp` y PostgREST fallaría al elegir
-- ("could not choose the best candidate function") en cuanto el cliente llame
-- con los nombres viejos. Por eso se borra la versión de 4 argumentos primero.
drop function if exists public.crear_optin_whatsapp(text, uuid, text, text);

create or replace function public.crear_optin_whatsapp(
  p_tenant_type text,
  p_tenant_id   uuid,
  p_phone_e164  text,
  p_source      text,
  p_user_id     uuid default null,
  p_email       text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_tenant_type not in ('venue', 'musician') then
    raise exception 'tenant_type inválido: %', p_tenant_type;
  end if;
  if p_source not in ('perfil', 'checkout', 'whatsapp') then
    raise exception 'source inválido: %', p_source;
  end if;

  insert into whatsapp_opt_ins (
    tenant_type, tenant_id, phone_e164, source, revoked_at, user_id, email
  )
  values (
    p_tenant_type, p_tenant_id, p_phone_e164, p_source, null, p_user_id, p_email
  )
  on conflict (tenant_type, tenant_id, phone_e164)
  do update set
    revoked_at  = null,
    source      = excluded.source,
    opted_in_at = now(),
    -- `coalesce(excluded.x, tabla.x)` y no `excluded.x` a secas: un segundo
    -- opt-in desde el perfil público (que no pide email) no debe borrar el
    -- email que ya había dejado la compra.
    user_id     = coalesce(excluded.user_id, whatsapp_opt_ins.user_id),
    email       = coalesce(excluded.email,   whatsapp_opt_ins.email);
end;
$$;

-- `security definer` sigue siendo correcto y necesario acá: es lo que permite
-- tocar `revoked_at`, que las policies reservan a `service_role`. Con
-- `search_path` fijado, igual que se corrigió en W-048.
grant execute on function public.crear_optin_whatsapp(text, uuid, text, text, uuid, text)
  to anon, authenticated;

-- 3. La vista del CRM, ahora que las columnas existen ----------------------
--
-- W-099 tuvo que dejar `NULL::text` y `NULL::uuid` literales en la rama de
-- opt-ins porque estas dos columnas no existían todavía. Sin este reemplazo,
-- agregarlas no mejora el agrupado y el CRM sigue contando dos veces al mismo
-- humano. Mismos nombres y tipos de columna que la versión vigente, así que el
-- `create or replace` es legal y ningún consumidor cambia.
CREATE OR REPLACE VIEW public.crm_contactos WITH (security_invoker = true) AS
WITH eventos_tenant AS (
  SELECT e.id AS event_id,
         CASE WHEN e.venue_id IS NOT NULL THEN 'venue' ELSE 'musician' END AS tenant_type,
         COALESCE(e.venue_id, a.profile_id) AS tenant_id
    FROM public.events e
    LEFT JOIN public.artists a ON a.id = e.artist_id
   WHERE e.venue_id IS NOT NULL OR a.profile_id IS NOT NULL
),
fuentes AS (
  SELECT et.tenant_type,
         et.tenant_id,
         lower(t.comprador_email) AS email,
         NULL::text               AS phone_e164,
         t.user_id                AS user_id,
         'comprador'::text        AS origen,
         t.created_at             AS visto_at,
         t.cantidad               AS cantidad,
         t.monto                  AS monto
    FROM public.tickets t
    JOIN eventos_tenant et ON et.event_id = t.evento_id
   WHERE t.status = 'completed' AND t.comprador_email IS NOT NULL

  UNION ALL
  -- Acá está el cambio de W-103: el email y el user_id del opt-in ya existen,
  -- así que un opt-in hecho en la compra se fusiona con esa misma compra en
  -- vez de aparecer como un contacto aparte.
  SELECT o.tenant_type, o.tenant_id, lower(o.email), o.phone_e164, o.user_id,
         'whatsapp', o.opted_in_at, 0, 0
    FROM public.whatsapp_opt_ins o
   WHERE o.revoked_at IS NULL

  UNION ALL
  SELECT 'venue', f.venue_id, NULL, NULL, f.follower_id, 'seguidor', f.created_at, 0, 0
    FROM public.follows_venues f

  UNION ALL
  SELECT 'musician', f.musician_id, NULL, NULL, f.follower_id, 'seguidor', f.created_at, 0, 0
    FROM public.follows_musicians f
)
SELECT tenant_type,
       tenant_id,
       COALESCE(email, phone_e164, 'u:' || user_id::text) AS contacto_key,
       max(email)      AS email,
       max(phone_e164) AS phone_e164,
       -- max() no existe para uuid en Postgres (addendum de W-099): se toma el
       -- primero no nulo del grupo.
       (array_agg(user_id) FILTER (WHERE user_id IS NOT NULL))[1] AS user_id,
       array_agg(DISTINCT origen ORDER BY origen)                 AS origenes,
       min(visto_at)                                              AS primer_contacto,
       max(visto_at) FILTER (WHERE origen = 'comprador')          AS ultima_compra,
       COALESCE(sum(cantidad) FILTER (WHERE origen = 'comprador'), 0) AS entradas,
       COALESCE(sum(monto)    FILTER (WHERE origen = 'comprador'), 0) AS total_gastado,
       bool_or(origen = 'whatsapp')                               AS acepta_whatsapp
  FROM fuentes
 GROUP BY 1, 2, 3;

GRANT SELECT ON public.crm_contactos TO authenticated;
REVOKE ALL ON public.crm_contactos FROM anon;

-- Sin backfill a propósito: los opt-ins ya creados se quedan sin user_id ni
-- email. No hay de dónde deducirlos sin adivinar, y adivinar en una tabla de
-- consentimiento es exactamente lo que no se puede hacer.
