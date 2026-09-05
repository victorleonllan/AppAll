-- Spec W-098 — El tenant puede ver quién lo sigue.
-- Ver sonopolisWeb/specs/w098-datos-seguidores-visibles-al-tenant.md
--
-- La policy de SELECT del spec 047 está escrita desde el punto de vista del
-- fan ("veo a quién sigo"): USING (auth.uid() = follower_id). El lado del
-- tenant ("quiénes me siguen") nunca se abrió, así que hoy un local no puede
-- leer sus propios seguidores — la tercera fuente del CRM (spec W-099) sale
-- vacía.
--
-- Estas dos policies son ADICIONALES. Las permisivas se combinan con OR, así
-- que las del spec 047 siguen intactas y el fan sigue viendo sus follows: eso
-- es lo que sostiene /fan y BotonSeguir, y es el riesgo real de esta
-- migración.
--
-- Lo que queda expuesto es follower_id y created_at — el uuid de quien sigue y
-- desde cuándo. NO se abre auth.users ni la policy de profiles (spec 020):
-- seguir a un local es una señal de interés, no un consentimiento para ser
-- contactado. Si algún día se quiere el correo del seguidor, eso es un
-- checkbox nuevo, no una policy más ancha.

DROP POLICY IF EXISTS follows_venues_select_owner ON public.follows_venues;
CREATE POLICY follows_venues_select_owner ON public.follows_venues FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.venues v
     WHERE v.id = follows_venues.venue_id
       AND v.owner_id = (select auth.uid())
  ));

-- El tenant músico es su propia fila de profiles (W-048), así que acá alcanza
-- una igualdad: sin subconsulta.
DROP POLICY IF EXISTS follows_musicians_select_owner ON public.follows_musicians;
CREATE POLICY follows_musicians_select_owner ON public.follows_musicians FOR SELECT
  USING (musician_id = (select auth.uid()));

-- Los índices que esto necesita ya existen desde el spec 047
-- (follows_venues_venue_idx, follows_musicians_musician_idx).
