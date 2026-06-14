# Specs — AppAll

> Bitácora de desarrollo. Cada spec es una tarea ejecutable por OpenCode.

## Flujo de trabajo

1. Hermes escribe el spec
2. Victor ejecuta con OpenCode
3. OpenCode implementa
4. Hermes revisa vía SSH
5. Hermes documenta en Obsidian

## Roadmap Beta 1.0 — Venta de Entradas

**Contexto (actualizado 14 Jun 2026):** El equipo de Victor necesita una app para vender entradas. Foco: músicos crean eventos → público compra entradas.

| Prioridad | Spec | Descripción |
|-----------|------|-------------|
| 🔴 Crítico | A — Detalle de evento + compra (Spec 008) | Pantalla al tocar evento: artista, venue, fecha, precio, bio, botón "Comprar entrada" |
| 🔴 Crítico | B — Tickets + flujo de pago (Spec 009) | Tabla tickets en Supabase. Seleccionar cantidad → confirmar → ticket mock |
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
| 008 | 🔴 Detalle de evento + compra de entradas (estructura MP) | ✅ Completado |
| 009 | 🔴 Tickets + flujo de pago (conexión MP real) | ⏳ Pendiente |
| 010 | 🟡 Dashboard ventas músico | ⏳ Pendiente |
| 011 | 🟡 Sembrar datos de prueba | ⏳ Pendiente |
| 012 | Fix navegación crear evento desde perfil músico | ✅ Completado |

## Cambios recientes

### 14 Jun 2026 — Spec 012 completado

Fix de navegación: `PerfilMusicoScreen` intentaba `navigate('CrearEvento')` pero el screen no existía en el árbol de navegación. Se creó `MusicoStack.tsx` (Stack Navigator conteniendo PerfilMusico + CrearEvento) y se actualizó `src/navigation/index.tsx` para usarlo.

## Estado del proyecto (14 Jun 2026)

- Supabase proyecto activo: `xluinfihjjtxkglihxqz`
- `.env` actualizado con URL y publishable key correctos
- Tablas creadas: `venues`, `events`, `profiles` (extendida con bio/instagram/spotify/youtube)
- Pendiente: crear tabla `tickets` + Edge Functions MP (Spec 009)
- Pendiente: dashboard ventas músico (Spec 010)
- Pendiente: sembrar datos iniciales (Spec 011)
- Supabase URL (desde WSL no resuelve DNS, desde Mac sí)
