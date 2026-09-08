-- Spec 080 — `pais` en `events` y `venues`
--
-- La cartelera mezcla eventos internos (`events`) con scrapeados (`external_events`).
-- El spec 050 le dio `pais` a los scrapeados; los internos no lo tienen, así que filtrar
-- por país hoy dejaría la mitad del listado sin criterio.
--
-- `char(2)` ISO 3166-1 alpha-2 en mayúsculas, igual que `event_sources.pais` y
-- `external_events.pais`, para que las cuatro columnas de país se lean y comparen igual.
-- El DEFAULT vive solo durante esta migración (todo lo que hay en producción es chileno);
-- después se quita para que un INSERT sin país falle fuerte en vez de asumir Chile en
-- silencio — ese silencio es el bug que el spec viene a cerrar.
--
-- `events.pais` es denormalizado a propósito, no derivado de `venues` por join:
-- `events.venue_id` es nullable, y un join dejaría a los eventos sin local fuera de toda
-- cartelera. Lo estampa la app al crear el evento (spec W-112), no un trigger.

alter table public.venues add column pais char(2) not null default 'CL';
alter table public.events add column pais char(2) not null default 'CL';

alter table public.venues alter column pais drop default;
alter table public.events alter column pais drop default;

-- El filtro exacto de la cartelera: país + ventana de fechas.
create index events_pais_comienza_idx on public.events (pais, comienza_at);

-- `getVenues` ordena por nombre y filtra por país; no hay fecha que agregar al índice.
create index venues_pais_idx on public.venues (pais);
