-- Spec 078 — El admin de Sonópolis entra a cualquier evento sin que lo inviten.
--
-- Depende del spec 077: usa es_admin_sonopolis(), creada en la migración
-- inmediatamente anterior.
--
-- Se tocan las dos FUNCIONES y no las policies: son el cuello por el que ya
-- pasan 13 policies (events con sus borradores, tickets del spec 038,
-- event_collaborators, event_collaborator_invites del 052 y las preventas del
-- 064). Agregar el OR policy por policy serían trece lugares donde el próximo
-- spec puede olvidarse de uno — que es exactamente cómo 'cafe' sobrevivió al
-- spec 046.

-- Cualquier miembro del equipo edita — y el admin de Sonópolis, sin ser miembro.
CREATE OR REPLACE FUNCTION public.can_edit_event(p_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.es_admin_sonopolis() OR public.event_role_of(p_event) IS NOT NULL;
$$;

-- owner y admin gestionan el equipo — y el admin de Sonópolis.
CREATE OR REPLACE FUNCTION public.can_manage_team(p_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.es_admin_sonopolis() OR public.event_role_of(p_event) IN ('owner','admin');
$$;

-- NO se tocan, a propósito:
--
-- event_role_of() sigue devolviendo NULL para un admin que no es colaborador.
-- Es el punto entero del diseño: event_role_of(evento) = 'owner' es lo que
-- gatea la cuenta bancaria (spec 073) y el reclamo de pago (spec 075). Si el
-- admin heredara 'owner', podría reclamar el pago en nombre del organizador y
-- después marcárselo como hecho él mismo — las dos mitades del control que el
-- spec 075 fue a separar, en la misma persona. Los datos de liquidación ya los
-- ve por la puerta correcta: las policies event_payouts_*_admin del spec 074.
--
-- can_delete_event() tampoco. Cancelar un evento no es editarlo: es un estado
-- público que ve todo el que compró una entrada, y arrastra reembolsos. Es una
-- decisión aparte de esta.
