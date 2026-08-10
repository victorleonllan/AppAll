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
| 021 | Cerrar el flujo de compra en web | En curso — sin desplegar del todo |
| 028 | Correo transaccional por Resend (SMTP + plantillas) | Bloqueado — falta la API key |
| 029 | Correo de confirmación de compra | Propuesto — depende del 028 y del 021 |
| 030 | Dashboard de banda: perfil completo y panel | Implementado y desplegado — falta verificar en runtime |
| 031 | Dashboard de local: perfil editable, dueño y panel | Aplicado (migración + código en `main`, sin verificar en runtime) |
| 032 | Renombrar "café" a "local" en archivos, símbolos y contrato de contexto | Implementado — falta verificar en runtime |
| 033 | Propiedad y colaboradores de evento: quién reclama, quién edita, quién borra | Desplegado y mergeado — falta verificar en runtime |
| 034 | Editar evento (spec aislado, separado a propósito del 033) | Propuesto |
| 035 | Fix: login roto por columnas de token NULL en `auth.users` (`musico@prueba.appall`) | Completado — aplicado en producción y migración verificada |

## Progreso: 23 specs aplicados; 021 y 028 abiertos; 030, 031, 032 y 033 en `main` sin verificar en runtime completo (031 y 033 sí tienen su migración verificada contra producción); 029 y 034 propuestos.

⚠️ **"Aplicado" no significa "verificado".** El flujo de compra nunca se completó
de punta a punta (0 tickets en la base) y no hay tests. Ver `PENDIENTES.md` para
el inventario de lo detectado y no corregido, organizado en specs 021-029.

⚠️ **El correo es el camino crítico.** El magic link es el único acceso a la compra,
así que el **028 va antes que el 021**: con 2 correos/hora no se puede ni depurar.
Y Resend sin dominio propio solo entrega al dueño de la cuenta, con lo cual **ningún
tercero puede comprar todavía**. Comprar y verificar el dominio es requisito duro del
Demo Day (23-sep-2026) y la dependencia de mayor plazo del proyecto.

⚠️ **Ni "verificado" significa "desplegado".** Auditoría del 8-ago-2026: el repo,
las Edge Functions y el build de Vercel corrían tres versiones distintas. Antes de
diagnosticar un bug de runtime, confirma qué corre en cada capa — ver `CLAUDE.md`,
sección *Tres estados que se desincronizan*.

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
