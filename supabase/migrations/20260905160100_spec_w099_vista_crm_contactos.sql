-- Spec W-099 — Vista `crm_contactos`: el público de un tenant como una sola lista.
-- Ver sonopolisWeb/specs/w099-datos-vista-crm-contactos.md
--
-- Una VISTA y no una tabla: no duplica PII (correos y teléfonos de terceros no
-- pasan a existir en un cuarto lugar) y no se puede desincronizar, porque no
-- tiene estado.
--
-- security_invoker = true es lo que hace que no haga falta ni una policy nueva:
-- la vista corre con los permisos de quien consulta y cada tabla base aplica su
-- propia RLS (tickets → equipo del evento; whatsapp_opt_ins → dueño del tenant;
-- follows_* → dueño, spec W-098). Sin security_invoker la vista correría como su
-- dueño y entregaría los teléfonos de todos los locales a cualquiera: el mismo
-- agujero que W-049 evita al no darle `select` a anon.
--
-- Nota sobre tickets_select_own (baseline): un fan puede ver sus PROPIAS compras,
-- así que consultando esta vista se ve a sí mismo como contacto del local al que
-- le compró. Es su propio dato, no una fuga: no ve ninguna otra fila.

CREATE OR REPLACE VIEW public.crm_contactos WITH (security_invoker = true) AS
WITH eventos_tenant AS (
  -- Mismo criterio de "de quién es este evento" que usa la API route del
  -- broadcast (W-051, paso 3), no uno nuevo: venue dueño, o el perfil del
  -- artista ya reclamado. Un artista placeholder sin reclamar no tiene tenant
  -- posible, y sus compradores no aparecen en ningún CRM — correcto, no hay
  -- nadie a quien pertenezcan.
  SELECT e.id AS event_id,
         CASE WHEN e.venue_id IS NOT NULL THEN 'venue' ELSE 'musician' END AS tenant_type,
         COALESCE(e.venue_id, a.profile_id) AS tenant_id
    FROM public.events e
    LEFT JOIN public.artists a ON a.id = e.artist_id
   WHERE e.venue_id IS NOT NULL OR a.profile_id IS NOT NULL
),
fuentes AS (
  -- 1. Compradores. Solo `completed`: un `pending` abandonado no es un cliente.
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
  -- 2. Opt-ins de WhatsApp vigentes.
  --
  -- email y user_id van como NULL literal, no como columnas: `whatsapp_opt_ins`
  -- todavía no las tiene — las agrega W-103, y el diseño de este spec las daba
  -- por existentes (ver "Bugs encontrados al aplicar" en w099). Cuando W-103
  -- corra, recrea esta vista con un CREATE OR REPLACE que cambia solo estas dos
  -- expresiones: mismos nombres y tipos de columna, así que el reemplazo es
  -- legal y ningún consumidor cambia.
  SELECT o.tenant_type, o.tenant_id, NULL::text, o.phone_e164, NULL::uuid,
         'whatsapp', o.opted_in_at, 0, 0
    FROM public.whatsapp_opt_ins o
   WHERE o.revoked_at IS NULL

  UNION ALL
  -- 3. Seguidores. Sin datos de contacto a propósito (W-098).
  SELECT 'venue', f.venue_id, NULL, NULL, f.follower_id, 'seguidor', f.created_at, 0, 0
    FROM public.follows_venues f

  UNION ALL
  SELECT 'musician', f.musician_id, NULL, NULL, f.follower_id, 'seguidor', f.created_at, 0, 0
    FROM public.follows_musicians f
)
SELECT tenant_type,
       tenant_id,
       -- Identidad: email → teléfono → user_id. El email es lo que más fuentes
       -- comparten (lo tiene el comprador con cuenta y el invitado). No user_id:
       -- media compra es guest y nunca tiene fila en profiles.
       COALESCE(email, phone_e164, 'u:' || user_id::text) AS contacto_key,
       max(email)      AS email,
       max(phone_e164) AS phone_e164,
       -- max() no existe para uuid en Postgres (ver addendum del spec W-099):
       -- se toma el primero no nulo del grupo.
       (array_agg(user_id) FILTER (WHERE user_id IS NOT NULL))[1] AS user_id,
       array_agg(DISTINCT origen ORDER BY origen)                 AS origenes,
       min(visto_at)                                              AS primer_contacto,
       max(visto_at) FILTER (WHERE origen = 'comprador')          AS ultima_compra,
       COALESCE(sum(cantidad) FILTER (WHERE origen = 'comprador'), 0) AS entradas,
       COALESCE(sum(monto)    FILTER (WHERE origen = 'comprador'), 0) AS total_gastado,
       bool_or(origen = 'whatsapp')                               AS acepta_whatsapp
  FROM fuentes
 GROUP BY 1, 2, 3;

COMMENT ON VIEW public.crm_contactos IS
  'CRM de Sonópolis Pro (spec W-099): compradores + opt-ins de WhatsApp + seguidores de un tenant, agrupados por email/teléfono/user_id. security_invoker: cada tabla base aplica su RLS. Consultar SIEMPRE filtrando tenant_type y tenant_id.';

GRANT SELECT ON public.crm_contactos TO authenticated;
REVOKE ALL ON public.crm_contactos FROM anon;
