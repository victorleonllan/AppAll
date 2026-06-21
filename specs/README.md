# Specs — AppAll

> Bitácora de desarrollo. Cada spec es una tarea ejecutable por OpenCode.

## Flujo de trabajo

1. Hermes escribe el spec
2. Victor ejecuta con OpenCode
3. OpenCode implementa
4. Hermes revisa vía SSH
5. Hermes documenta en Obsidian

## Roadmap Beta 1.0 — Venta de Entradas

**Contexto (actualizado 21 Jun 2026):** El equipo de Victor necesita una app para vender entradas. Foco: músicos crean eventos → público compra entradas. Gateway: **Mercado Pago Checkout Pro** (app JamCafé). MCP de MP configurado en Hermes.

| Prioridad | Spec | Descripción |
|-----------|------|-------------|
| 🔴 Crítico | A — Detalle de evento + compra (Spec 008) | Pantalla al tocar evento: artista, venue, fecha, precio, bio, botón "Comprar entrada" — ✅ mock listo, pendiente conexión MP real |
| 🔴 Crítico | B — Tickets + flujo de pago (Spec 009) | ⏳ Espec escrito pero NO implementado. Tabla tickets SQL + Edge Functions + MP real + IPN |
| 🟡 Importante | C — Dashboard ventas músico (Spec 010) | El músico ve cuántas entradas vendió |
| 🟡 Importante | D — Sembrar datos prueba (Spec 011) | Músico real, venue, evento en Supabase |
| ⚪ Después | Onboarding, Perfil público, Conexión café→músico | Depriorizado |

## Lista de specs

| # | Spec | Estado |
|---|------|--------|
| 001 | AGENTS.md + fundación (theme, types, data mock) | ✅ Completado |
| 002 | Refactor código (componentes, screens, navegación) | ✅ Completado |
| 003 | Autenticación con roles (Supabase Auth) | ✅ Completado |
| 004 | Perfil músico privado + Landing de roles | ✅ Completado |
| 005 | Dashboard café (redefinir) | ✅ Completado |
| 006 | Músico crea eventos + sistema de venues | ✅ Completado |
| 007 | Migrar mock a Supabase (venues, events, perfiles) | ✅ Completado |
| 008 | 🔴 Detalle de evento + compra de entradas (estructura MP mock) | ✅ Completado — frontend listo para MP |
| 009 | 🔴 Tickets + flujo de pago (conexión MP Checkout Pro real) | ⏳ Pendiente — spec escrito, no implementado |
| 010 | 🟡 Dashboard ventas músico | ⏳ Pendiente |
| 011 | 🟡 Sembrar datos de prueba | ⏳ Pendiente |
| 012 | Fix navegación crear evento desde perfil músico | ✅ Completado |

## Cambios recientes

### 21 Jun 2026 — Spec 009 reescrito con Mercado Pago

- **Gateway cambiado:** Transbank Webpay → **Mercado Pago (Checkout Pro)** como gateway principal
- **App MP creada:** **JamCafé** en MP Developers con credenciales de prueba
- **MCP MP configurado:** `mcp_servers.mercado-pago` agregado en `config.yaml` de Hermes
- **Spec 009 reescrito:** Ahora incluye:
  - SQL migration tabla `tickets`
  - Edge Function `create-preference` (genera preferencia en MP)
  - Edge Function `webhook-mp` (IPN para notificaciones)
  - Frontend: conexión desde `DetalleEventoScreen` a MP real
  - Configuración de Edge Functions y webhook en MP
- **Archivo renombrado:** `009-integracion-mercadopago-real.md` → `009-tickets-mercadopago-real.md`

### 14 Jun 2026 — Spec 012 completado

Fix de navegación: `PerfilMusicoScreen` intentaba `navigate('CrearEvento')` pero el screen no existía en el árbol de navegación. Se creó `MusicoStack.tsx` (Stack Navigator conteniendo PerfilMusico + CrearEvento) y se actualizó `src/navigation/index.tsx` para usarlo.

## Estado del proyecto (21 Jun 2026)

- Supabase proyecto activo: `xluinfihjjtxkglihxqz`
- `.env` actualizado con URL y publishable key correctos
- Tablas creadas: `venues`, `events`, `profiles`
- **Pendiente:** crear tabla `tickets` (Spec 009 Fase 0)
- **Pendiente:** Edge Functions `create-preference` + `webhook-mp` (Spec 009 Fase 1-2)
- **Pendiente:** conectar frontend a MP real (Spec 009 Fase 3)
- **Pendiente:** dashboard ventas músico (Spec 010)
- **Pendiente:** sembrar datos iniciales (Spec 011)
- **MCP MP:** configurado en Hermes, pendiente reinicio para activar
- **Credenciales MP prueba:** Access Token + Public Key guardadas en Hermes memoria