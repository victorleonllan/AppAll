-- Spec W-301 — los compradores de un evento entran a la base de TODOS sus
-- participantes: el local y cada banda (principal y adicionales, W-300).
-- Ver sonopolisWeb/specs/w301-datos-compradores-para-todos-los-del-evento.md
--
-- Antes (W-184): un evento tenía UN dueño en el CRM (creador músico → local →
-- artista reclamado). Pedido de Victor: cada local y cada banda tiene su base
-- independiente, y un evento hecho entre varios suma a sus compradores a la
-- base de cada uno.
--
-- Solo cambia la CTE `eventos_tenant` de privado.crm_base: pasa de una fila por
-- evento a una fila por (evento, participante). `crm_contactos` y
-- `crm_destinatarios_correo` leen de crm_base y no cambian.
--
-- NO cambia el WhatsApp: un opt-in es consentimiento dado a UN tenant
-- (whatsapp_opt_ins.tenant_*), y getTenantDelEvento (W-183) sigue eligiendo uno.

CREATE OR REPLACE VIEW privado.crm_base WITH (security_invoker = true) AS
WITH eventos_tenant AS (
  -- 1. El músico que creó el evento.
  SELECT e.id AS event_id, 'musician'::text AS tenant_type, e.created_by AS tenant_id
    FROM public.events e
    JOIN public.profiles p ON p.id = e.created_by
   WHERE p.role = 'musician'
  UNION
  -- 2. El local donde ocurre.
  SELECT e.id, 'venue', e.venue_id
    FROM public.events e
   WHERE e.venue_id IS NOT NULL
  UNION
  -- 3. La banda principal, si ya tiene cuenta (artists.profile_id).
  SELECT e.id, 'musician', a.profile_id
    FROM public.events e
    JOIN public.artists a ON a.id = e.artist_id
   WHERE a.profile_id IS NOT NULL
  UNION
  -- 4. Las bandas adicionales (W-300), si ya tienen cuenta.
  SELECT ea.event_id, 'musician', a.profile_id
    FROM public.event_artists ea
    JOIN public.artists a ON a.id = ea.artist_id
   WHERE a.profile_id IS NOT NULL
),
-- Desde aquí, sin cambios respecto de W-198.
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
       COALESCE(email, phone_e164, 'u:' || user_id::text) AS contacto_key,
       max(email)      AS email,
       max(phone_e164) AS phone_e164,
       (array_agg(user_id) FILTER (WHERE user_id IS NOT NULL))[1] AS user_id,
       array_agg(DISTINCT origen ORDER BY origen)                 AS origenes,
       min(visto_at)                                              AS primer_contacto,
       max(visto_at) FILTER (WHERE origen = 'comprador')          AS ultima_compra,
       COALESCE(sum(cantidad) FILTER (WHERE origen = 'comprador'), 0) AS entradas,
       COALESCE(sum(monto)    FILTER (WHERE origen = 'comprador'), 0) AS total_gastado,
       bool_or(origen = 'whatsapp')                               AS acepta_whatsapp
  FROM fuentes
 GROUP BY 1, 2, 3;

grant select on privado.crm_base to authenticated, service_role;
