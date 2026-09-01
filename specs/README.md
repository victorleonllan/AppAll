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
| 021 | Cerrar el flujo de compra en web | Código completo — los 9 problemas del spec verificados contra el repo actual, checklist al día. Falta solo la prueba end-to-end (depende del 028) |
| 022 | Endurecer webhook y creación de preferencias: firma x-signature, validar cantidad, límite de aforo | Aplicado y verificado (2026-08-13) — migración, `create-preference` y `webhook-mp` desplegados, 12/12 criterios de cierre verificados (RPC directa + HTTP con firma real) |
| 028 | Correo transaccional por Resend (SMTP + plantillas + dominio propio) | Aplicado y confirmado (2026-08-11) — SMTP, límites, plantilla y remitente en `sonopolis.org` (verificado en Resend). El primero con `onboarding@resend.dev` cayó en spam; con dominio propio, confirmado que ya no |
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
| 042 | Login con Google (OAuth) además del magic link | Código listo (`AuthContext`/`LoginScreen`, `tsc` limpio) — bloqueado por Client ID/Secret de Google Cloud Console |
| 043 | Migración de la web a Next.js (spec puente) — el trabajo real vive en `sonopolisWeb/specs/`, empezando por el `001-andamiaje.md` | Fase 0 (andamiaje) aplicada — remote al molde cortado, Mongo/NextAuth/Stripe/R2 fuera, Supabase agregado, `yarn build` limpio. Fases 1-6 pendientes |
| 044 | `reservar_ticket_pending` no miraba `events.status`: se podía cobrar por un evento cancelado o en draft. Pedido desde `sonopolisWeb/specs/w008-datos-guarda-cancelacion.md` | Aplicado y verificado (2026-08-13) — migración en producción, 6/6 criterios de cierre verificados por RPC/SQL directo (transacciones con `ROLLBACK`). También cancela los tickets `pending` en curso al cancelar el evento y habilita Realtime en `events` |
| 045 | `comienza_at timestamptz` en `events` — la fecha del evento como dato comparable, para la web nueva. Pedido desde `sonopolisWeb/specs/w005-datos-comienza-at.md` | Aplicado en producción (2026-08-13), pero el `.sql` y este spec se aplicaron vía `apply_migration` sin guardar archivo — drift detectado desde `sonopolisWeb` y cerrado recreando el archivo el 2026-08-14, verificado byte a byte contra `information_schema`/`pg_indexes` antes de escribirlo |
| 046 | Rol `fan`, rename `cafe`→`local`, guest checkout y claim por email. Pedido desde el vault (`plan-datos-fan-guest-checkout-20260815.md`) | Aplicado a producción (2026-08-15) — 2 bugs encontrados y corregidos al aplicar: orden del backfill contra el CHECK viejo, y `_reservar_ticket_shared`/`claim_guest_tickets`/`set_my_role` ejecutables por `anon`/`authenticated` de más (grant por defecto de Supabase, no por el `REVOKE FROM PUBLIC` del archivo). Ver spec para detalle y qué quedó sin probar |
| 047 | Seguir músicos y locales (`follows_musicians`, `follows_venues`) | Aplicado a producción (2026-08-15), sin incidentes. Independiente del 046 |
| 048 | Lógica y frontend para 046/047: rename de literales de rol, guest checkout real en `create-preference`/`DetalleEventoScreen`, seguir + dashboard del fan en `PerfilScreen` | Propuesto — 046 y 047 ya están aplicados, este es el que falta implementar |
| 049 | `event_sources` + `external_events` para eventos scrapeados (difusión con link a la fuente, **sin** dato de compra). Pedido desde `sonopolisWeb/specs/w022-datos-eventos-externos.md` | **Aplicado** (2026-08-19) — `supabase/migrations/20260819164643_spec_049_eventos_externos.sql` corrida contra producción (`xluinfihjjtxkglihxqz`), 5 criterios de aceptación verificados. Desbloquea W-023/W-024 de `sonopolisWeb` |
| 050 | `pais` en `event_sources` y `external_events` — deja el dato listo para cuando exista una segunda fuente de otro país. Pedido desde `sonopolisWeb/specs/w026-logica-pais-fuentes.md` | Migración escrita (`supabase/migrations/20260819144528_spec_050_pais_fuentes.sql`), **sin aplicar en producción** — bloquea W-026 de `sonopolisWeb` en runtime (código y `yarn build` verdes, pero el pipeline fallaría por columna inexistente hasta correr esta migración) |
| 051 | Disponibilidad del músico (`profiles.available`) y solicitudes de bolo (`booking_requests`) — negociación previa a crear un evento, sin disparar nada sobre `events`. Pedido desde `sonopolisWeb/specs/w031-datos-disponibilidad-y-solicitudes.md` | **Aplicado** (2026-08-20) — `supabase/migrations/20260820183953_spec_051_disponibilidad_y_solicitudes.sql` corrida contra producción (`xluinfihjjtxkglihxqz`). Desbloquea W-033/W-034 de `sonopolisWeb` |
| 052 | Invitar por email a un colaborador de evento sin cuenta (`event_collaborator_invites` + claim al signup). Extiende el spec 033 (aditivo puro). Pedido desde `sonopolisWeb/specs/w032-datos-invitar-colaborador-email.md` | **Aplicado** (2026-08-20) — `supabase/migrations/20260820183954_spec_052_invitar_colaborador_email.sql` corrida contra producción (`xluinfihjjtxkglihxqz`). Desbloquea W-033/W-034 de `sonopolisWeb` |
| 054 | Vocabulario cerrado de géneros musicales (`GENEROS_MUSICALES`, 174 géneros, base OffStep) — sin `CHECK`/FK en DB, ver spec para el motivo. Pedido desde el vault (`08-KNOWLEDGE/Sonopolis/2026-08-24 Géneros musicales - listado OffStep.md`) | Aplicado — solo constante TS, sin migración |
| 055 | Búsqueda (`buscarGeneros`) y filtro (`eventoCoincideConGenero`) sobre el listado del 054 | Aplicado |
| 056 | Picker de género (`GeneroPicker`) en Crear/Editar evento (single), perfil de banda (multiple, reemplaza el campo de texto libre "separados por coma") y filtro de Cartelera (primer filtro que tiene esa pantalla) | Implementado — sin verificar en runtime, `node_modules` no instalado en la máquina donde se escribió |
| 057 | Corregir Site URL de Supabase Auth — causa raíz de por qué un login de Google cancelado en `sonopolis.org` terminaba en `app-all-lemon.vercel.app` con `bad_oauth_state` y 404. Config del dashboard, sin código | Aplicado (2026-08-27) — verificado por captura, ver addendum en el spec |
| 058 | Pantalla de error tras login con Google fallido en AppAll web (`OAuthErrorScreen`) — red de seguridad, defensa en profundidad. El caso real (`sonopolisWeb`) es el spec w038 | Aplicado (2026-08-24) — sin verificar en el navegador, diseño visual pendiente |
| 061 | Tabla `artists` — placeholder de banda simétrico al de local (`venues`), `events.artist_id` pasa a apuntar acá en vez de `profiles` | Aplicado (2026-08-27) — fix 2026-09-01: `events_claim_owner_trg` (spec 033) no se había actualizado y rompía `event_collaborators_user_id_fkey` al crear evento con artista, ver addendum en el spec |
| 064 | `events.tipo_precio` (general/puerta) + tabla `event_preventas` — preventas agregables con cupo opcional. Pedido desde `sonopolisWeb/specs/W-PENDIENTES.md` #24 | Aplicado (2026-09-01) — solo DATOS, LÓGICA (checkout) y FRONTEND (formulario) pendientes |

## Progreso: 41 specs aplicados (el 022 se suma, 2026-08-13, con sus 12 criterios de cierre verificados; 046 y 047 se suman, 2026-08-15; 049 se suma, 2026-08-19, con sus 5 criterios de cierre verificados contra producción); 042 abierto (bloqueado por credenciales de Google); 043 abierto (Fase 0 de 7 aplicada, vive en otro repo); 048 propuesto, sin implementar; 050, 051 y 052 se suman, 2026-08-20, migraciones aplicadas contra producción; 021, 030, 031, 032, 033, 034, 036, 038, 039 y 041 en `main` sin verificar en runtime completo (021, 022, 028, 031, 033, 036, 037, 038 y 040 sí tienen su código y/o migración verificados contra producción o el repo actual — 022 y 040 con el 100% de su criterio de cierre); 029 propuesto. **La serie 036-041 está completa en código** — ver nota abajo. **021 también** — ver la nota del spec.

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
de punta a punta (6 tickets en `pending`, 0 en `completed`) y no hay tests. Intento
end-to-end del 2026-08-13 sin cerrar — quedó trabado en el checkout de MP, ver
`PENDIENTES.md` spec 021 para el detalle y cómo retomarlo.

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

✅ **`profiles.role` ya usa `'local'`/`'fan'`**, no `'cafe'`/`'public'` — migrado por el
spec 046 (2026-08-15). El frontend de AppAll todavía compara contra los valores viejos
en 4 archivos (`navigation/index.tsx`, `AuthContext.tsx`, `AuthScreen.tsx`,
`RegisterScreen.tsx`) — sigue funcionando por el alias que `handle_new_user()` acepta,
pero corregirlo es el spec 048, sin implementar.

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
