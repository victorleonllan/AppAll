# Specs — Sonópolis

## Roadmap Beta 1.0 — Venta de Entradas

| # | Spec | Estado |
|---|------|--------|
| 001-008 | Fundacion, Auth, Perfiles, Eventos, Venues, Mock | Completado |
| 009 | Tickets + MP Checkout Pro real | Completado |
| 010 | Dashboard ventas musico | **Pendiente (único que falta)** |
| 011 | Sembrar datos de prueba | Completado (vía spec 013) |
| 012 | Fix navegacion crear evento | Completado |
| 013 | Fix Magic Link Auth + auto-compra | Completado |
| 014 | Deploy Edge Functions MP + Secrets | Completado |
| 015 | Webhook MP + Prueba End-to-End | Completado |

## Progreso: 14/15 specs completados. Falta spec 010.

## Spec 013 — Fix Magic Link Auth + auto-compra

**Problema:** Magic link no detectaba sesion al volver. Solucion: .
**Auto-compra:** localStorage con  + navegacion automatica al evento.

Archivos tocados:
-  — detectSessionInUrl false → true
-  — emailRedirectTo: window.location.origin
-  — localStorage + auto-compra
-  — auto-navegacion

Mas detalle en .

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
- MP: Checkout Pro (app Sonópolis, credenciales de prueba)
- Pendiente: Spec 010 (dashboard ventas músico)
