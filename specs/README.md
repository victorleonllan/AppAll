# Specs — AppAll

> Bitácora de desarrollo. Cada spec es una tarea ejecutable por OpenCode.

## Flujo de trabajo

1. **Hermes** escribe el spec
2. **Victor** ejecuta en VS Code terminal:
   ```
   opencode run "Implementa specs/NNN-nombre.md -f specs/NNN-nombre.md"
   ```
3. **OpenCode** implementa
4. **Hermes** revisa vía SSH
5. **Hermes** documenta en Obsidian

## Lista de specs

| # | Spec | Estado |
|---|------|--------|
| 001 | AGENTS.md + fundación (theme, types, data mock) | ✅ Completado |
| 002 | Refactor código (componentes, screens, navegación) | ✅ Completado |
| 003 | Autenticación con roles (Supabase Auth) | ✅ Completado |
| 004 | Perfil músico privado + Landing de roles | ✅ Completado |
| 005 | Dashboard café privado (crear eventos, buscar músicos) | ⏳ Pendiente |

## Notas

- **004 completado**: OpenCode implementó PerfilMusicoScreen, VerMusicoScreen, CafesStack, mock de músicos. Hermes editó directo el AuthScreen (landing con 3 roles: Público/Músico/Café), RegisterScreen (preselectedRole + Volver), LoginScreen (Volver), y navegación (tercer tab "AppAll" sin sesión).
- **005 pendiente**: Crear DashboardCafeScreen completo con lista de eventos, crear evento, y músicos disponibles.
- Siguientes specs planificados: E → A → D → B → C (Onboarding, Detalle evento, Perfil público, Conexión café-músico, Migrar mock a Supabase)
