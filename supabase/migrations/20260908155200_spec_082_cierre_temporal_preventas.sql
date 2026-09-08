-- Spec 082 — Cierre temporal obligatorio en preventas (DATOS)
--
-- Incidente del 7-sep-2026: un fan compró en la puerta a precio de preventa.
-- No fue bug: la preventa seguía activa y con cupo, y ninguno de los dos
-- cierres que existían (cupo, manual) mira el reloj. Estas columnas guardan
-- la REGLA de cierre por tiempo; quién la aplica es el spec 083.
--
-- Default = el recomendado (3 horas antes del inicio): un cliente que inserte
-- sin opinar queda con la regla recomendada, no sin regla. Las filas ya
-- existentes reciben ese default al agregar la columna.

ALTER TABLE public.event_preventas
  ADD COLUMN IF NOT EXISTS cierre_tipo        text        NOT NULL DEFAULT 'horas_antes',
  ADD COLUMN IF NOT EXISTS cierre_horas_antes integer     DEFAULT 3,
  ADD COLUMN IF NOT EXISTS cierre_at          timestamptz;

ALTER TABLE public.event_preventas
  ADD CONSTRAINT event_preventas_cierre_tipo_check
    CHECK (cierre_tipo IN ('horas_antes', 'fecha'));

-- La regla elegida tiene que estar completa: horas para 'horas_antes', instante
-- para 'fecha'. La columna que no aplica puede quedar con lo que tenga (el
-- default de 3 horas no molesta en una preventa por fecha): LÓGICA lee solo
-- la que corresponde al tipo. `>= 0` y no `> 0`: "0 horas antes" es "cierra
-- cuando empieza", una regla legítima; negativo sería no tener cierre.
ALTER TABLE public.event_preventas
  ADD CONSTRAINT event_preventas_cierre_completo CHECK (
    (cierre_tipo = 'horas_antes' AND cierre_horas_antes IS NOT NULL AND cierre_horas_antes >= 0)
    OR
    (cierre_tipo = 'fecha' AND cierre_at IS NOT NULL)
  );

COMMENT ON COLUMN public.event_preventas.cierre_tipo IS
  'Cómo cierra por tiempo (spec 082): horas_antes = N horas antes de events.comienza_at; fecha = en cierre_at. Obligatorio; el default es el recomendado.';
COMMENT ON COLUMN public.event_preventas.cierre_horas_antes IS
  'Horas antes de events.comienza_at en que cierra, cuando cierre_tipo = horas_antes. 0 = cierra al inicio del evento.';
COMMENT ON COLUMN public.event_preventas.cierre_at IS
  'Instante exacto de cierre, cuando cierre_tipo = fecha.';
