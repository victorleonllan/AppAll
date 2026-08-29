-- Spec W-049 (sonopolisWeb) — whatsapp_opt_ins y whatsapp_broadcasts.
--
-- Sonópolis manda desde un único número propio (Kapso) — por eso no hay tabla
-- whatsapp_connections, la conexión es una sola y vive en la cuenta de Kapso,
-- no en la base. El opt-in sí es por tenant.

create table whatsapp_opt_ins (
  id           uuid primary key default gen_random_uuid(),
  tenant_type  text not null check (tenant_type in ('venue','musician')),
  tenant_id    uuid not null,
  phone_e164   text not null,
  source       text not null check (source in ('perfil','checkout','whatsapp')),
  opted_in_at  timestamptz not null default now(),
  revoked_at   timestamptz,
  unique (tenant_type, tenant_id, phone_e164)
);

alter table whatsapp_opt_ins enable row level security;

-- El público opta sin cuenta: insert abierto a anon y authenticated.
create policy whatsapp_opt_ins_insert on whatsapp_opt_ins
  for insert
  to anon, authenticated
  with check (true);

-- Es una tabla de PII (teléfonos de terceros). select nunca para anon: un
-- select abierto entregaría los teléfonos de todo el público de todos los
-- locales a cualquiera con la anon key, que es pública por definición.
create policy whatsapp_opt_ins_select_owner on whatsapp_opt_ins
  for select
  to authenticated
  using (
    (tenant_type = 'venue' and exists (
      select 1 from venues where venues.id = whatsapp_opt_ins.tenant_id
        and venues.owner_id = auth.uid()
    ))
    or (tenant_type = 'musician' and tenant_id = auth.uid())
  );

-- update/delete solo service_role — el opt-out (STOP) pasa por el servidor
-- (W-051), no por el cliente. Sin policy para authenticated/anon: RLS deniega
-- por defecto, y service_role salta RLS.

create table whatsapp_broadcasts (
  id                 uuid primary key default gen_random_uuid(),
  tenant_type        text not null check (tenant_type in ('venue','musician')),
  tenant_id          uuid not null,
  event_id           uuid references events(id) on delete set null,
  template_name      text not null,
  recipients_count   integer not null default 0,
  status             text not null default 'sent'
                     check (status in ('sent','partial','failed')),
  kapso_broadcast_id text,
  sent_at            timestamptz not null default now()
);

alter table whatsapp_broadcasts enable row level security;

create policy whatsapp_broadcasts_select_owner on whatsapp_broadcasts
  for select
  to authenticated
  using (
    (tenant_type = 'venue' and exists (
      select 1 from venues where venues.id = whatsapp_broadcasts.tenant_id
        and venues.owner_id = auth.uid()
    ))
    or (tenant_type = 'musician' and tenant_id = auth.uid())
  );

-- Todas las escrituras solo service_role: si el cliente pudiera insertar, un
-- tenant podría fabricar historial o falsear el conteo. Sin policy de
-- insert/update/delete para anon/authenticated — RLS deniega por defecto.
