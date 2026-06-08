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

## Próximos specs propuestos

| # | Spec | Descripción |
|---|------|-------------|
| 003 | Pantalla Músicos | Lista de músicos + perfil detalle con datos mock |
| 004 | Supabase | Conectar base de datos, auth con roles, migraciones |
