# Specs — AppAll

> Bitácora de desarrollo. Cada spec es una tarea ejecutable por OpenCode.

## Flujo de trabajo

1. Hermes escribe el spec
2. Victor ejecuta con OpenCode
3. OpenCode implementa
4. Hermes revisa vía SSH
5. Hermes documenta en Obsidian

## Roadmap Beta 1.0 — Venta de Entradas

**Contexto (actualizado 21 Jun 2026):** El equipo de Victor necesita una app para vender entradas. Foco: músicos crean eventos → público compra entradas.
Gateway: **Mercado Pago Checkout Pro** (app JamCafé). MCP de MP configurado en Hermes.

| Prioridad | Spec | Descripción | Estado |
|-----------|------|-------------|--------|
| 🔴 Crítico | Spec 009 — Tickets + MP Checkout Pro real | 5 fases: SQL migration, Edge Functions create-preference + webhook-mp, Frontend, Webhook MP | ⏳ Fases 0-2 ✅, Fase 3 pendiente |
| 🟡 Importante | Spec 010 — Dashboard ventas músico | El músico ve cuántas entradas vendió | ⏳ Pendiente |
| 🟡 Importante | Spec 011 — Sembrar datos prueba | Músico real, venue, evento en Supabase | ⏳ Pendiente |

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
| **009** | 🔴 **Tickets + MP Checkout Pro real** | **⏳ Fases 0-2 ✅ — Fase 3 (frontend) pendiente** |
| 010 | 🟡 Dashboard ventas músico | ⏳ Pendiente |
| 011 | 🟡 Sembrar datos de prueba | ⏳ Pendiente |
| 012 | Fix navegación crear evento desde perfil músico | ✅ Completado |

## Cambios recientes

### 21 Jun 2026 — Spec 009: Fases 0-2 completadas

1. **SQL migration:** Tabla  + columna  en  — ✅
2. **Edge Function :** Deployada, crea preferencia en MP — ✅
3. **Edge Function :** Deployada, recibe IPN de MP — ✅
4. **Secrets:**  configurado — ✅
5. 🔲 **Frontend:** Pendiente — conectar DetalleEventoScreen + polling en ConfirmacionCompraScreen

### 14 Jun 2026 — Spec 012 completado + reestructuración

- **Spec 012:** Fix navegación:  crea stack para navegar a CrearEvento
- **README.md reestructurado:** Fechas, cambios recientes, prioridades claras

## Estado del proyecto (21 Jun 2026)

- Supabase proyecto activo: 
-  actualizado con URL y publishable key
- Tablas: , , ,  ✅
- Edge Functions:  ✅,  ✅
- Pendiente frontend: conectar DetalleEventoScreen a Edge Function real
- Pendiente: Configurar Webhook URL en Dashboard de MP
- Pendiente: dashboard ventas músico (Spec 010)
- Pendiente: sembrar datos iniciales (Spec 011)
