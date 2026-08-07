# Specs — Sonópolis

## Roadmap Beta 1.0 — Venta de Entradas

| # | Spec | Estado |
|---|------|--------|
| 001-008 | Fundacion, Auth, Perfiles, Eventos, Venues, Mock | Completado |
| 009 | Tickets + MP Checkout Pro real | Completado |
| 010 | Dashboard ventas musico | Completado |
| 011 | Sembrar datos de prueba | Completado (vía spec 013) |
| 012 | Fix navegacion crear evento | Completado |
| 013 | Fix Magic Link Auth + auto-compra | Completado |
| 014 | Deploy Edge Functions MP + Secrets | Completado |
| 015 | Webhook MP + Prueba End-to-End | Completado |
| 016 | Fix estado de tickets en dashboard de ventas | Completado |
| 017 | Hardening auto-compra tras migrar a AsyncStorage | Completado (falta probar en nativo) |
| 018 | Taxonomia de venues: de "cafes" a "locales" | Completado |
| 019 | Backfill de profiles + hardening del trigger | Completado |
| 020 | Fix de dos agujeros criticos de RLS | Completado |

## Progreso: 20/20 specs completados. ✅ Beta lista para pruebas end-to-end.

## Taxonomia de locales (spec 018 — NO improvisar)

Fuente de verdad: `VenueType` en `src/types/index.ts` y el CHECK de `venues.type`.

| Valor | Etiqueta | Emoji |
|-------|----------|-------|
| `cafe` | Café | ☕ |
| `bar` | Bar | 🍺 |
| `sala` | Sala | 🎪 |
| `centro_cultural` | Centro cultural | 🎭 |

⚠️ **`'venue'` ya NO es un tipo valido.** Era un catch-all sin significado; el CHECK lo rechaza.
La categoria se llama **"locales"** en la UI, nunca "cafes". Los nombres propios si conservan
su palabra ("Café La Palma" se sigue llamando asi).

⚠️ **`profiles.role` sigue usando `'cafe'`**, no `'local'`. Cambiarlo exige migrar
`auth.users.raw_user_meta_data` de usuarios reales: es un spec aparte.

## Nomenclatura de tipo de proyecto (spec 019)

Un mismo campo, tres nombres segun el nivel. No mezclarlos:

| Nivel | Nombre |
|-------|--------|
| Base de datos | `tipo_proyecto` |
| Tipos y objetos TS | `tipoProyecto` |
| Estado local de formulario | `genero` |

La migracion `20260612192127_rename_genero_to_tipo_proyecto` renombro la columna en junio
pero el codigo no se actualizo hasta el spec 019.

## Migraciones

Desde el spec 018 el esquema se versiona en `supabase/migrations/`. Antes vivia solo
en el dashboard de Supabase y no era reproducible ni auditable.

## Spec 013 — Fix Magic Link Auth + auto-compra

**Problema:** Magic link no detectaba sesion al volver. Solucion: `detectSessionInUrl: true`.
**Auto-compra:** localStorage con `pending_ticket` + navegacion automatica al evento.

Archivos tocados:
- `src/lib/supabase.ts` — detectSessionInUrl false → true
- `src/context/AuthContext.tsx` — emailRedirectTo: window.location.origin
- `src/screens/DetalleEventoScreen.tsx` — localStorage + auto-compra
- `src/screens/CarteleraScreen.tsx` — auto-navegacion

Mas detalle en `specs/013-fix-magic-link-auth.md`.

## Edge Functions

| Function | URL |
|---------|-----|
| create-preference | /functions/v1/create-preference |
| webhook-mp | /functions/v1/webhook-mp |

## Flujo de compra completo

1. Usuario ve evento > toca "Comprar entrada"
2. Si no esta logueado > formulario de email
3. Magic link enviado + evento guardado en localStorage
4. Click en el link > Supabase procesa > redirect a la app
5. App detecta sesion (detectSessionInUrl: true)
6. Cartelera navega al evento (pending_ticket)
7. DetalleEvento auto-compra
8. Se abre MP Checkout Pro
9. Confirmacion con polling cada 3s

## Estados de ticket (convencion — NO improvisar)

Fuente de verdad: `TicketStatus` en `src/types/index.ts`.

| Estado | Quien lo escribe |
|--------|------------------|
| `pending` | `create-preference` al crear el ticket |
| `completed` | `webhook-mp` cuando MP confirma el pago |
| `refunded` | (reservado, sin uso todavia) |

⚠️ **`'paid'` NO es un estado de ticket.** En `webhook-mp/index.ts` aparece `order.order_status === 'paid'`, pero ese campo es **de Mercado Pago**. Confundirlos rompio el dashboard de ventas del spec 010.

## Proyecto

- Supabase: xluinfihjjtxkglihxqz
- Tablas: venues, events, profiles, tickets
- MP: Checkout Pro (app Sonópolis, credenciales de prueba)
- ✅ Todos los specs completados. Beta lista para pruebas end-to-end en runtime.
