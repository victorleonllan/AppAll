# Specs — AppAll

> Bitácora de desarrollo. Cada spec es una tarea ejecutable por OpenCode.

## Flujo de trabajo

1. Hermes escribe el spec
2. Victor ejecuta con OpenCode
3. OpenCode implementa
4. Hermes revisa vía SSH
5. Hermes documenta en Obsidian

## Roadmap Beta 1.0 — Venta de Entradas

**Contexto (actualizado 12 Jun 2026):** El equipo de Victor necesita una app para vender entradas. Foco: músicos crean eventos → público compra entradas.

| Prioridad | Spec | Descripción |
|-----------|------|-------------|
| 🔴 Crítico | A — Detalle de evento + compra | Pantalla al tocar evento: artista, venue, fecha, precio, bio, botón "Comprar entrada" |
| 🔴 Crítico | B — Tickets + flujo de pago | Tabla tickets en Supabase. Seleccionar cantidad → confirmar → ticket mock |
| 🟡 Importante | C — Dashboard ventas músico | El músico ve cuántas entradas vendió |
| 🟡 Importante | D — Sembrar datos prueba | Músico real, venue, evento en Supabase |
| ⚪ Después | Onboarding, Perfil público, Conexión café→músico | Depriorizado |

## Lista de specs

| # | Spec | Estado |
|---|------|--------|
| 001 | AGENTS.md + fundación (theme, types, data mock) | ✅ Completado |
| 002 | Refactor código (componentes, screens, navegación) | ✅ Completado |
| 003 | Autenticación con roles (Supabase Auth) | ✅ Completado |
| 004 | Perfil músico privado + Landing de roles | ✅ Completado |
| 005 | Dashboard café (redefinir) | ⏳ Pendiente |
| 006 | Músico crea eventos + sistema de venues | ✅ Completado |
| 007 | Migrar mock a Supabase (venues, events, perfiles) | ✅ Completado |
| 008 | 🔴 Detalle de evento + compra de entradas (estructura MP) | ✅ Completado |
| 009 | 🔴 Tickets + flujo de pago (conexión MP real) | ⏳ Pendiente |
| 010 | 🟡 Dashboard ventas músico | ⏳ Pendiente |
| 011 | 🟡 Sembrar datos de prueba | ⏳ Pendiente |

## Estado del proyecto (12 Jun 2026)

- Supabase proyecto activo: `xluinfihjjtxkglihxqz`
- `.env` actualizado con URL y anon key correctos
- Tablas creadas: `venues`, `events`, `profiles` (extendida con bio/instagram/spotify/youtube)
- Pendiente: crear tabla `tickets` cuando se implemente el Spec B
- Pendiente: sembrar datos iniciales (Spec D)
- Supabase URL (desde WSL no resuelve DNS, desde Mac sí)