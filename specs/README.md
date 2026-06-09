# Specs — AppAll

> Bitácora de desarrollo. Cada spec es una tarea ejecutable por OpenCode.

## Flujo de trabajo

1. Hermes escribe el spec
2. Victor ejecuta en VS Code terminal:
   ```
   opencode run "Implementa specs/NNN-nombre.md -f specs/NNN-nombre.md"
   ```
3. OpenCode implementa
4. Hermes revisa vía SSH
5. Siguiente spec

## Lista de specs

| # | Spec | Estado |
|---|------|--------|
| 001 | AGENTS.md + fundación (theme, types, data mock) | ✅ Completado |
| 002 | Refactor código (componentes, screens, navegación) | ✅ Completado |
| 003 | Autenticación con roles (Supabase Auth) | ⏳ Pendiente |

## Próximos specs propuestos

| # | Spec | Descripción |
|---|------|-------------|
| 004 | Perfil músico privado | Bio, Instagram, Spotify, YouTube — solo visible para cafés |
| 005 | Dashboard café privado | Crear eventos, buscar músicos por perfil |
