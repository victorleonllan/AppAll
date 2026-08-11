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
| 034 | Editar evento (spec aislado, separado a propósito del 033) | Implementado — `tsc` y `expo export --platform web` limpios, falta verificar en runtime |
| 035 | Fix: login roto por columnas de token NULL en `auth.users` (`musico@prueba.appall`) | Completado — aplicado en producción y migración verificada |
| 036 | Entradas individuales: `ticket_items`, folio y token QR | Aplicado a producción — criterios 1-5 verificados por RPC, faltan 6-7 (piden sesión autenticada real) |
| 037 | Emisión de entradas al confirmar el pago | Desplegado — migración de backfill y `webhook-mp` en producción, código confirmado vía Management API. Falta el criterio de punta a punta (depende del 021/028) |
| 038 | Quién ve las ventas: de `created_by` a `event_collaborators` | Aplicado a producción — falta criterio de cierre (0 tickets, sin segundo colaborador de prueba) |
| 039 | Dashboard de entradas del evento | Implementado — `tsc` y `expo export --platform web` limpios, falta verificar en runtime |
| 040 | Canje atómico: `redeem_ticket_item(token)` | Aplicado a producción — los 8 puntos del criterio de cierre verificados por RPC |
| 041 | Escáner de QR montado en los dos dashboards | Implementado — `tsc` y `expo export --platform web` limpios. Falta la puerta: 7 de 9 puntos del criterio de cierre necesitan entradas emitidas |

## Progreso: 30 specs aplicados; 021 y 028 abiertos; 030, 031, 032, 033, 034, 036, 038, 039 y 041 en `main` sin verificar en runtime completo (031, 033, 036, 037, 038 y 040 sí tienen su migración y/o deploy verificado contra producción — 040 con los 8 puntos de su criterio de cierre por RPC); 029 propuesto. **La serie 036-041 está completa en código** — ver nota abajo.

## Serie 036-041 — flujo de entradas con QR

Un solo pedido de producto ("dashboard de entradas por evento, numeradas, con QR, y lectura
de QR en los dos dashboards") cortado en seis specs **por capa**, para que se puedan trabajar
sin pisarse:

```
036 (ticket_items + emisión SQL) ──┬──▶ 037 (webhook emite)  ──┐
                                   └──▶ 040 (canje atómico)  ──┤
038 (RLS ventas por colaborador) ─────────────────────────────┴──▶ 039 (dashboard) ──▶ 041 (escáner)
```

| Spec | Capa | Archivos que toca |
|---|---|---|
| 036 | Datos | `supabase/migrations/` |
| 037 | Comportamiento | `supabase/functions/webhook-mp/` + migración de backfill |
| 038 | Datos | `supabase/migrations/` |
| 039 | Frontend | `src/screens/`, `src/hooks/`, `src/navigation/`, `package.json` |
| 040 | Comportamiento | `supabase/migrations/` |
| 041 | Frontend | `src/screens/`, `src/hooks/`, `src/navigation/`, `package.json` |

**Los seis specs — hecho (2026-08-10/11).** Dos y hasta tres sesiones de Claude Code
trabajaron a la vez sobre el mismo working tree (mismo `.git`, mismo disco), se coordinaron
por mensaje antes de tocar archivos compartidos (`README.md`/`PENDIENTES.md`) y no hubo
pisada porque cada spec es dueño de sus propios archivos, tal como anticipaba esta nota — con
una excepción: Victor asignó el 041 a dos sesiones a la vez por un cruce de mensajes; la
segunda vio el trabajo en curso al abrir los archivos y frenó antes de escribir nada, sin
pisada real. El 040 verificó sus 8 criterios de cierre por RPC contra producción y de paso
encontró y corrigió un bug real en el propio SQL del spec (`RETURNING … INTO` vaciando la
fila en el segundo canje — ver `specs/040-canje-atomico-de-entradas.md`). El 037 desplegó el
backfill (0 filas, esperado) y `webhook-mp` con la llamada a `issue_ticket_items`; confirmado
por Management API que lo desplegado coincide con el repo. El 039 agregó
`react-native-qrcode-svg`/`react-native-svg`, `EntradasEventoScreen`, `useEntradasEvento` y
borró el comentario de 12 líneas de `MiLocalStack.tsx` que documentaba el hueco del 038. El
041 cierra la serie: `expo-camera`, `EscanerQRScreen` y `useCanjeEntrada` (un solo camino de
canje para cámara y folio manual), montado con el mismo nombre de ruta en las tres stacks.
Decisión que no estaba en el spec: llama a `peek_ticket_item` antes de `redeem_ticket_item`
para que un escaneo accidental no queme una entrada — detalle en
`specs/041-escaner-qr-en-dashboards.md`. `tsc` y `expo export --platform web` limpios en
036-041. **Nada de esto se verificó en runtime real**: producción sigue en 0 tickets, así que
los criterios de cierre que piden una entrada de verdad (036 puntos 6-7, 038, 039, 041 puntos
1-3-5-6-8) quedan pendientes — no son seis deudas distintas, son la misma deuda: nunca hubo
una compra de punta a punta. El camino crítico sigue siendo el 028 (Resend) y detrás el
dominio propio — ver `PENDIENTES.md`.

**Verificado aparte, sin depender de una compra real:** el criterio 3 del 040 (dos canjes
simultáneos del mismo QR) se probó con dos transacciones Postgres genuinamente concurrentes
(vía Management API, `pg_sleep` para forzar la contención del lock en vez de confiar en el
timing de la red) — la perdedora quedó bloqueada ~3.8 s hasta que la ganadora liberó el lock,
y el resultado final fue exactamente un canje. Datos de prueba borrados después.

⚠️ **`webhook-mp/index.ts` es del spec 037; `create-preference/index.ts` es del spec 022.**
El 037 se lleva la guarda de idempotencia que el 022 tenía anotada (punto 2), porque emitir
entradas la vuelve obligatoria. Ver `PENDIENTES.md`, spec 022.

Los permisos que este flujo necesita **ya están construidos** por el spec 033
(`event_collaborators`, `can_edit_event()`): el creador entra como `owner` y el segundo admin
invitado como `admin`. Lo único que faltaba era que la policy de `tickets` los mirara — eso es
el spec 038.

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
