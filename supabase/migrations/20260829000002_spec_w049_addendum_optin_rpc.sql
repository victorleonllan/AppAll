-- Addendum a spec W-049 (sonopolisWeb), encontrado 2026-08-29 al escribir
-- W-053: un insert plano del cliente no puede reactivar un opt-in revocado —
-- `unique (tenant_type, tenant_id, phone_e164)` choca en el segundo insert
-- aunque `revoked_at` esté seteado, y la policy de UPDATE de la tabla es solo
-- para `service_role` (a propósito: el opt-out pasa por el servidor, no por
-- el cliente). Sin este RPC, un visitante que se arrepiente y vuelve a optar
-- se encuentra con un error de "ya existe" en vez de reactivarse — el diseño
-- original de W-049 no cubría este caso.
--
-- Se resuelve con una función SECURITY DEFINER: hace exactamente lo que el
-- INSERT del cliente no puede (el upsert que toca revoked_at), y nada más —
-- no abre la tabla entera a escritura anónima, solo este camino puntual.

create or replace function crear_optin_whatsapp(
  p_tenant_type text,
  p_tenant_id uuid,
  p_phone_e164 text,
  p_source text
) returns void as $$
begin
  if p_tenant_type not in ('venue', 'musician') then
    raise exception 'tenant_type inválido: %', p_tenant_type;
  end if;
  if p_source not in ('perfil', 'checkout', 'whatsapp') then
    raise exception 'source inválido: %', p_source;
  end if;

  insert into whatsapp_opt_ins (tenant_type, tenant_id, phone_e164, source, revoked_at)
  values (p_tenant_type, p_tenant_id, p_phone_e164, p_source, null)
  on conflict (tenant_type, tenant_id, phone_e164)
  do update set revoked_at = null, source = excluded.source, opted_in_at = now();
end;
$$ language plpgsql security definer;

grant execute on function crear_optin_whatsapp(text, uuid, text, text) to anon, authenticated;
