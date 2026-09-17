-- Spec 090 — `search_path` fijo en las 7 funciones que quedaron sin él.
-- Ver specs/090-datos-search-path-fijo.md
--
-- `search_path` es la lista de esquemas donde Postgres busca un nombre sin
-- calificar: si una función dice `FROM tickets` y el search_path es
-- `otro_esquema, public`, gana `otro_esquema.tickets` si existe. Estas siete se
-- crearon sin fijarlo, así que resuelven los nombres con el search_path de quien
-- las llame.
--
-- `ALTER FUNCTION` y no `CREATE OR REPLACE`: cambia solo el atributo de
-- configuración y deja el cuerpo intacto. Copiar los cuerpos al archivo para
-- cambiar una cláusula de cabecera es donde se cuela un error de transcripción
-- en código que hoy funciona — dos de estas son guardas de integridad.
--
-- `public, pg_temp` y no `''`: los cuerpos escriben `tickets`, `venues`,
-- `events` sin prefijo, así que un search_path vacío los dejaría sin resolver.
-- `pg_temp` va al final porque Postgres lo busca primero si no se lo nombra: una
-- tabla temporal llamada `tickets`, que cualquier sesión puede crear, deja de
-- poder interponerse.

ALTER FUNCTION public.activar_direccion_venue(uuid)        SET search_path = public, pg_temp;
ALTER FUNCTION public.limitar_direcciones_venue()          SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_venue_address_activa()          SET search_path = public, pg_temp;
ALTER FUNCTION public.booking_requests_set_responded_at()  SET search_path = public, pg_temp;
ALTER FUNCTION public.events_block_delete_with_tickets()   SET search_path = public, pg_temp;
ALTER FUNCTION public.ticket_items_guard()                 SET search_path = public, pg_temp;
ALTER FUNCTION public.ticket_reserva_ttl()                 SET search_path = public, pg_temp;
