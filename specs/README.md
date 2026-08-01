# Specs — AppAll

## Roadmap Beta 1.0 — Venta de Entradas

| # | Spec | Estado |
|---|------|--------|
| 001-008 | Fundacion, Auth, Perfiles, Eventos, Venues, Mock | Completado |
| 009 | Tickets + MP Checkout Pro real | Completado |
| 010 | Dashboard ventas musico | Pendiente |
| 011 | Sembrar datos de prueba | Pendiente |
| 012 | Fix navegacion crear evento | Completado |
| 013 | Fix Magic Link Auth + auto-compra | Completado |
| 014 | Deploy Edge Functions MP + Secrets | Pendiente |
| 015 | Webhook MP + Prueba End-to-End | Pendiente |

## Spec 013 — Fix Magic Link Auth + auto-compra

**Problema:** Magic link no detectaba sesion al volver. Solucion: `detectSessionInUrl: true`.
**Auto-compra:** localStorage con `pending_ticket` + navegacion automatica al evento.

Archivos tocados:
- `src/lib/supabase.ts` — detectSessionInUrl false → true
- `src/context/AuthContext.tsx` — emailRedirectTo: window.location.origin
- `src/screens/DetalleEventoScreen.tsx` — localStorage + auto-compra
- `src/screens/CarteleraScreen.tsx` — auto-navegacion

Mas detalle en `013-fix-magic-link-auth.md`.

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

## Proyecto

- Supabase: xluinfihjjtxkglihxqz
- Tablas: venues, events, profiles, tickets
- MP: Checkout Pro (app JamCafe, credenciales prueba)
- Pendiente: Spec 010 (dashboard ventas), Spec 011 (sembrar datos)