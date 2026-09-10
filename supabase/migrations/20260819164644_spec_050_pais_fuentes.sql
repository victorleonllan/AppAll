-- Spec 050 — pais en event_sources y external_events
--
-- Backfill vía DEFAULT: las filas que ya existen (la fila seed de portaltickets y las
-- 33 insertadas por la corrida del W-023) quedan en 'CL'. El DEFAULT se saca después
-- del backfill para que un INSERT futuro que se olvide del país falle fuerte en vez de
-- asumir Chile en silencio.

alter table event_sources
  add column pais char(2) not null default 'CL';

alter table external_events
  add column pais char(2) not null default 'CL';

alter table event_sources
  alter column pais drop default;

alter table external_events
  alter column pais drop default;

create index external_events_pais_comienza_at_idx
  on external_events (pais, comienza_at);
