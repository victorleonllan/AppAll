-- Spec W-184 — la vista del CRM asigna cada evento a quien lo creó, igual que W-183.
-- Ver sonopolisWeb/specs/w184-datos-crm-tenant-es-quien-crea-el-evento.md
--
-- W-183 (30-sep-2026) cambió el dueño de un evento para WhatsApp: si lo creó un
-- músico, el opt-in y el aviso van a la banda aunque el evento tenga local. Esta
-- vista seguía con la regla de W-099 ("local si hay venue_id"), así que en un
-- show de una banda en un local la misma persona quedaba partida: la banda veía
-- su WhatsApp sin la compra, el local la compra sin el WhatsApp, y el segmento
-- "compradores" de la banda (W-107) la dejaba fuera.
--
-- Solo cambia la CTE `eventos_tenant`. Mismas columnas, nombres y tipos que la
-- versión de W-103, así que el `create or replace` es legal y ningún consumidor
-- (`libs/data/crm.js`) cambia.
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

-- Sin policy nueva en `tickets`. La del baseline (`created_by = auth.uid()`) ya
-- no existe: spec 038 la cambió por `tickets_select_event_team`, que deja leer a
-- quien `can_edit_event(evento_id)`. El trigger `events_claim_owner` (spec 033)
-- da `owner` al creador al insertar el evento, así que la banda creadora sigue
-- viendo las compras de su evento con su propia sesión (criterio 3 del spec,
-- verificar tras el push). El local también puede leerlas (admin por
-- `venue_owner`), pero la vista ya no las asigna a su tenant.
