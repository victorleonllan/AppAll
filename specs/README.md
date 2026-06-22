# Specs — AppAll

> Bitacora de desarrollo. Cada spec es una tarea ejecutable.

## Roadmap Beta 1.0 — Venta de Entradas

**Contexto (actualizado 21 Jun 2026):** Flujo de compra de entradas COMPLETO con Mercado Pago Checkout Pro real. El publico compra sin registrarse con contrasena — solo email + codigo OTP de 6 digitos.

| # | Spec | Estado |
|---|------|--------|
| 001-008 | Fundacion, Auth, Perfiles, Eventos, Venues, Mock a Supabase | Completado |
| **009** | **Tickets + MP Checkout Pro real** | **Completado** |
| 010 | Dashboard ventas musico | Pendiente |
| 011 | Sembrar datos de prueba | Pendiente |
| 012 | Fix navegacion crear evento | Completado |

## Spec 009 — Resumen final

| Fase | Que se hizo | Archivos tocados |
|------|------------|-----------------|
| **0** | SQL migration: tabla tickets + columna monto en events | Supabase SQL Editor |
| **1** | Edge Function create-preference deployada (v1) | supabase/functions/create-preference/index.ts |
| **2** | Edge Function webhook-mp deployada (v1) + secret MERCADOPAGO_ACCESS_TOKEN | supabase/functions/webhook-mp/index.ts |
| **3** | Frontend: DetalleEventoScreen + ConfirmacionCompraScreen + AuthContext | src/screens/DetalleEventoScreen.tsx, src/screens/ConfirmacionCompraScreen.tsx, src/context/AuthContext.tsx |

## Edge Functions activas

| Function | URL |
|---------|-----|
| create-preference | /functions/v1/create-preference |
| webhook-mp | /functions/v1/webhook-mp |

## Estado del proyecto (21 Jun 2026)

- Supabase proyecto: xluinfihjjtxkglihxqz
- Tablas: venues, events, profiles, tickets
- Edge Functions: create-preference, webhook-mp (ambas activas)
- Auth publico: OTP por email (sin contrasena) con role=public
- MP: Checkout Pro con app JamCafe (credenciales de prueba)
- Pendiente: dashboard ventas (010), sembrar datos (011)