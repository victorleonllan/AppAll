-- Spec 046 (corrección) — Supabase otorga EXECUTE a anon/authenticated por defecto en
-- funciones nuevas del schema public; el REVOKE ALL ... FROM PUBLIC de la migración
-- original no alcanza esos grants directos por rol. Detectado con get_advisors
-- inmediatamente después de aplicar spec_046 (2026-08-15), antes de cualquier uso real.
--
-- _reservar_ticket_shared: sin este REVOKE, cualquier anon podía llamarla directo vía
-- /rest/v1/rpc/_reservar_ticket_shared con un p_user_id arbitrario, saltándose el
-- auth.uid() de reservar_ticket_pending — vulnerabilidad real, corregida antes de que
-- el spec se diera por cerrado.
REVOKE EXECUTE ON FUNCTION public._reservar_ticket_shared(uuid, integer, text, uuid, text)
  FROM anon, authenticated;

-- claim_guest_tickets: función de trigger, no debería ser invocable por RPC directo
-- (Postgres la rechaza fuera de contexto de trigger, pero se revoca para no depender
-- de eso).
REVOKE EXECUTE ON FUNCTION public.claim_guest_tickets() FROM anon, authenticated;

-- set_my_role: diseñado para requerir sesión (auth.uid() IS NULL revienta), pero no
-- debía ser anon-callable en absoluto — solo authenticated, como en el GRANT original.
REVOKE EXECUTE ON FUNCTION public.set_my_role(text) FROM anon;
