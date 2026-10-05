-- Spec W-191 — el admin de Sonópolis puede leer los opt-ins y los seguidores de todos.
-- Ver sonopolisWeb/specs/w191-datos-admin-lee-el-publico-de-todos.md
--
-- `crm_contactos` es security_invoker (W-099): cada tabla base aplica su RLS con
-- la sesión de quien consulta. El admin ya leía `tickets` (spec 078, bypass en
-- can_edit_event), pero no `whatsapp_opt_ins` ni `follows_*`. Sin esto, el CRM
-- que ve el admin en /admin/crm (W-193) saldría sin WhatsApp ni seguidores, y
-- parecería roto cuando lo que falta es el permiso.
--
-- Solo SELECT y solo `authenticated`: el admin no escribe opt-ins ni follows, y
-- anon nunca lee teléfonos. Las policies SELECT se suman con OR a las existentes,
-- así que para quien no es admin nada cambia.

create policy whatsapp_opt_ins_select_admin on public.whatsapp_opt_ins
  for select to authenticated using (public.es_admin_sonopolis());

create policy follows_venues_select_admin on public.follows_venues
  for select to authenticated using (public.es_admin_sonopolis());

create policy follows_musicians_select_admin on public.follows_musicians
  for select to authenticated using (public.es_admin_sonopolis());
