-- Spec W-196 — el seguidor entra al CRM con su correo, y la vista entrega todos los
-- correos enmascarados. Ver sonopolisWeb/specs/w196-datos-seguidores-con-correo-enmascarado.md
--
-- Decisión de Victor (05-oct-2026): seguir a una banda o local ya es querer recibir
-- mensajes. Supera la reserva de W-098 ("no el correo"). Y como W-187 enmascaraba
-- solo en pantalla, la vista pasa a entregar los correos ya enmascarados: un tenant
-- que lea crm_contactos por la API tampoco ve un correo completo.

-- 1. El correo de la cuenta, en un esquema que PostgREST no expone ------------------
-- La vista es security_invoker y la sesión de un tenant no lee auth.users. La
-- función es security definer, pero vive en `privado`, fuera de los esquemas de la
-- API (config.toml: public y graphql_public): no se puede llamar por RPC con un uuid
-- cualquiera. Solo la usa la vista, a la que solo llegan los seguidores que la RLS
-- de follows_* deja ver (dueño, W-098; admin, W-191).
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated;

create or replace function privado.email_de_cuenta(p_user uuid) returns text
  language sql stable security definer set search_path = '' as $$
  select email from auth.users where id = p_user
$$;
revoke all on function privado.email_de_cuenta(uuid) from public;
grant execute on function privado.email_de_cuenta(uuid) to authenticated;

-- 2. El enmascarado, igual que libs/privacidad.js (W-187) --------------------------
-- 3 caracteres de la parte local, un asterisco por carácter oculto, @dominio
-- completo; con 3 o menos, solo el primero. Pura: no lee tablas.
create or replace function public.enmascarar_email(p text) returns text
  language sql immutable set search_path = '' as $$
  select case
    when p is null then null
    when position('@' in p) <= 1 then p
    when position('@' in p) - 1 <= 3
      then left(p, 1) || repeat('*', position('@' in p) - 2) || substr(p, position('@' in p))
    else left(p, 3) || repeat('*', position('@' in p) - 4) || substr(p, position('@' in p))
  end
$$;

-- 3. La vista: la de W-184 con la rama de seguidores y la salida enmascarada ------
CREATE OR REPLACE VIEW public.crm_contactos WITH (security_invoker = true) AS
WITH eventos_tenant AS (
  -- Spec W-184 — misma regla que getTenantDelEvento (W-183,
  -- sonopolisWeb/libs/data/whatsapp.js). Si cambia una, cambia la otra.
  --
  -- Orden: creador músico → local → artista vinculado y reclamado. Se compara
  -- `p.role` y no la existencia de la fila: la vista es security_invoker y la
  -- RLS de profiles (spec 020) deja ver a cualquiera solo las filas musician;
  -- un creador de otro rol sale NULL para un tercero o con su role real para sí
  -- mismo, y en los dos casos se sigue al paso del local.
  SELECT e.id AS event_id,
         CASE WHEN p.role = 'musician'     THEN 'musician'
              WHEN e.venue_id IS NOT NULL  THEN 'venue'
              ELSE 'musician' END AS tenant_type,
         CASE WHEN p.role = 'musician'     THEN e.created_by
              WHEN e.venue_id IS NOT NULL  THEN e.venue_id
              ELSE a.profile_id END AS tenant_id
    FROM public.events e
    LEFT JOIN public.profiles p ON p.id = e.created_by
    LEFT JOIN public.artists  a ON a.id = e.artist_id
   WHERE p.role = 'musician' OR e.venue_id IS NOT NULL OR a.profile_id IS NOT NULL
),
-- Desde aquí, copiado sin cambios de la migración de W-103.
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
  SELECT o.tenant_type, o.tenant_id, lower(o.email), o.phone_e164, o.user_id,
         'whatsapp', o.opted_in_at, 0, 0
    FROM public.whatsapp_opt_ins o
   WHERE o.revoked_at IS NULL

  UNION ALL
  -- W-196: el correo de la cuenta del seguidor (antes NULL, W-098). Agrupa con
  -- sus compras y su WhatsApp; sale enmascarado en el SELECT final.
  SELECT 'venue', f.venue_id, lower(privado.email_de_cuenta(f.follower_id)), NULL, f.follower_id,
         'seguidor', f.created_at, 0, 0
    FROM public.follows_venues f

  UNION ALL
  SELECT 'musician', f.musician_id, lower(privado.email_de_cuenta(f.follower_id)), NULL, f.follower_id,
         'seguidor', f.created_at, 0, 0
    FROM public.follows_musicians f
)
SELECT tenant_type,
       tenant_id,
       -- W-196: se agrupa por el correo real, pero no sale de la vista: la clave
       -- en md5 (hoy era el correo del comprador) y el correo enmascarado.
       md5(COALESCE(email, phone_e164, 'u:' || user_id::text)) AS contacto_key,
       public.enmascarar_email(max(email)) AS email,
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
