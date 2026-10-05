-- Spec W-198 — datos para mandar correos desde el CRM.
-- Ver sonopolisWeb/specs/w198-datos-correos-del-crm.md
--
-- Pedido de Victor (05-oct-2026): mandar correos desde el CRM a compradores,
-- seguidores o ambos. Revierte "Sonópolis no envía" (W-178): con los correos
-- enmascarados (W-187/W-196) el organizador no puede escribir por su cuenta.

-- 0. Bug de W-196: service_role no podía leer crm_contactos -----------------
-- W-196 dio usage sobre `privado` y execute de email_de_cuenta solo a
-- authenticated. service_role, que no es superusuario, quedó con "permission
-- denied for function email_de_cuenta" al leer la vista. La app no lo notó
-- (lee con la sesión del usuario), pero el envío de correos lee con service_role.
grant usage on schema privado to service_role;
grant execute on function privado.email_de_cuenta(uuid) to service_role;

-- 1. La base cruda, en privado (fuera de la API) -----------------------------
-- La misma agregación de W-196, sin enmascarar. Una sola definición del CRM:
-- la vista pública y el RPC leen de acá, así que la regla de dueño (W-184) no
-- se copia una cuarta vez (pendiente #34).
CREATE OR REPLACE VIEW privado.crm_base WITH (security_invoker = true) AS
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
       -- Cruda: correo y clave reales. Nunca sale de la base; la vista
       -- pública de abajo la enmascara (W-196) y el RPC la lee para mandar.
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


grant select on privado.crm_base to authenticated, service_role;

-- 2. La vista pública: la base, enmascarada. Mismas columnas que W-196 -------
CREATE OR REPLACE VIEW public.crm_contactos WITH (security_invoker = true) AS
SELECT tenant_type,
       tenant_id,
       md5(contacto_key)                  AS contacto_key,
       public.enmascarar_email(email)     AS email,
       phone_e164,
       user_id,
       origenes,
       primer_contacto,
       ultima_compra,
       entradas,
       total_gastado,
       acepta_whatsapp
  FROM privado.crm_base;

GRANT SELECT ON public.crm_contactos TO authenticated, service_role;
REVOKE ALL ON public.crm_contactos FROM anon;

-- 3. Bajas: por tenant. La escribe el servidor desde el link del correo ------
create table if not exists public.correo_bajas (
  email       text        not null,
  tenant_type text        not null check (tenant_type in ('venue', 'musician')),
  tenant_id   uuid        not null,
  created_at  timestamptz not null default now(),
  primary key (email, tenant_type, tenant_id)
);
-- RLS sin policies: ni anon ni authenticated leen ni escriben. Solo service_role.
alter table public.correo_bajas enable row level security;

-- 4. Registro de envíos -------------------------------------------------------
create table if not exists public.crm_correos (
  id           uuid        primary key default gen_random_uuid(),
  tenant_type  text        not null check (tenant_type in ('venue', 'musician')),
  tenant_id    uuid        not null,
  enviado_por  uuid        references auth.users(id) on delete set null,
  segmento     text        not null check (segmento in ('compradores', 'seguidores', 'ambos')),
  asunto       text        not null,
  cuerpo       text        not null,
  destinatarios int        not null,
  created_at   timestamptz not null default now()
);
create index if not exists crm_correos_tenant_idx
  on public.crm_correos (tenant_type, tenant_id, created_at desc);
alter table public.crm_correos enable row level security;

-- El dueño ve sus envíos (para "Último envío" y el límite de 24 h en pantalla);
-- el admin ve todos. Escribir: solo service_role.
create policy crm_correos_select_owner on public.crm_correos
  for select to authenticated using (
    (tenant_type = 'venue' and exists (
      select 1 from public.venues v where v.id = crm_correos.tenant_id and v.owner_id = auth.uid()))
    or (tenant_type = 'musician' and tenant_id = auth.uid())
  );
create policy crm_correos_select_admin on public.crm_correos
  for select to authenticated using (public.es_admin_sonopolis());

-- 5. Destinatarios: correos reales, solo para el servidor ---------------------
-- Una fila por correo con su grupo (regla de W-197: la compra manda). Sin los
-- que se dieron de baja de ese tenant. security definer para leer la base
-- completa; execute solo para service_role: ningún tenant puede pedir la lista
-- de correos reales, ni siquiera la suya.
create or replace function public.crm_destinatarios_correo(p_tenant_type text, p_tenant_id uuid)
returns table (email text, grupo text)
language sql stable security definer set search_path = '' as $$
  select b.email,
         case when 'comprador' = any(b.origenes) then 'compradores' else 'seguidores' end
    from privado.crm_base b
   where b.tenant_type = p_tenant_type
     and b.tenant_id = p_tenant_id
     and b.email is not null
     and ('comprador' = any(b.origenes) or 'seguidor' = any(b.origenes))
     and not exists (
       select 1 from public.correo_bajas x
        where x.email = b.email and x.tenant_type = b.tenant_type and x.tenant_id = b.tenant_id)
$$;
revoke all on function public.crm_destinatarios_correo(text, uuid) from public, anon, authenticated;
grant execute on function public.crm_destinatarios_correo(text, uuid) to service_role;
