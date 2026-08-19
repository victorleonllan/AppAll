# Spec 049 — `event_sources` + `external_events` (eventos scrapeados)

> Estado: escrito, sin aplicar (2026-08-19)

**Capa: DATOS · `supabase/migrations/` · Depende de: nada**

Pedido desde `sonopolisWeb/specs/w022-datos-eventos-externos.md`. Vive acá y no en
`sonopolisWeb` por la misma regla del spec 044/045: un cambio de esquema es un spec de
AppAll, aunque quien lo pida sea la web. El diseño completo —cada columna, cada decisión y
por qué— está en ese spec W-022; este archivo es el registro de la migración en este repo,
no una segunda copia del razonamiento.

## El problema

La cartelera de `sonopolisWeb` tiene 1 evento en producción. Se llena trayendo eventos
reales de PortalTickets, atribuidos y enlazados a su fuente — difusión, no venta.

## Decisión: tabla aparte, nunca filas en `events`

`events` alimenta la venta (`monto`, tickets, la Edge Function de Mercado Pago) y el
trigger `events_claim_owner_trg` da de alta un `owner` en cada INSERT. Un evento scrapeado
no tiene dueño y no se vende: no puede vivir en esa tabla sin romper una de las dos cosas.
`external_events` no tiene columna de dinero cobrable — es la garantía de que nunca puede
entrar al embudo de compra, aunque el código de arriba tenga un bug.

## Trabajo

Migración `20260819164643_spec_049_eventos_externos.sql`:

- `event_sources` — registro operativo por fuente (`activa`, `last_run_at`, `last_ok_at`,
  `last_error`), seedeada con la fila `portaltickets`
- `external_events` — `comuna` es NOT NULL a propósito: v1 es solo Gran Santiago, y el
  pipeline decide eso en la ingesta, no acá (spec W-023 de la web)
- Índice único `(source_slug, source_uid)` para que el pipeline pueda hacer `upsert`
- RLS en las dos tablas: `select` público solo de lo `publicado` (`event_sources` entera es
  pública, es solo el catálogo de fuentes); sin `insert`/`update`/`delete` por policy —
  escribe únicamente la service role key desde el pipeline de la web

## Criterios de aceptación

- [ ] Las dos tablas existen con RLS habilitado
- [ ] El índice único `(source_slug, source_uid)` existe
- [ ] La fila `portaltickets` está seedeada
- [ ] Un `select` anónimo sobre `external_events` con filas en `'nuevo'` devuelve 0 filas
- [ ] `external_events` no tiene ninguna columna de monto, tickets ni Mercado Pago

## Fuera de alcance

Resolver `venue_nombre` contra `venues`; geocodificación (`lat`/`lng` se crean nullable
para cuando la fase del mapa las llene); UI de moderación — se aprueba desde el Table
Editor del dashboard, igual que cualquier otro dato scrapeado de bajo volumen.
