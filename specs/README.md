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

## Progreso: 17/17 specs completados. ✅ Beta lista para pruebas end-to-end.

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
