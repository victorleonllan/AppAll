# Specs — AppAll

> Bitácora de desarrollo. Cada spec es una tarea ejecutable por OpenCode.

## Flujo de trabajo

1. Hermes escribe el spec
2. Victor ejecuta con OpenCode
3. OpenCode implementa
4. Hermes revisa vía SSH
5. Hermes documenta en Obsidian

## Lista de specs

| # | Spec | Estado |
|---|------|--------|
| 001 | AGENTS.md + fundación (theme, types, data mock) | ✅ Completado |
| 002 | Refactor código (componentes, screens, navegación) | ✅ Completado |
| 003 | Autenticación con roles (Supabase Auth) | ✅ Completado |
| 004 | Perfil músico privado + Landing de roles | ✅ Completado |
| 005 | Dashboard café | ✅ Completado |
| **006** | **Músico crea eventos + sistema de venues** | **✅ Completado** |
| **007** | **Migrar mock a Supabase (venues, events, perfiles)** | **✏️ Escrito** |

## Notas

- **006**: Eventos se asocian a venues. Cafés (tipo "cafe") = siempre visibles. Locales no cafés (tipo "venue") = solo aparecen con eventos. Músicos y cafés crean eventos con selector de venue.
- **007**: Crear tablas venues y events en Supabase. Conectar screens via providers. Guardar perfiles, eventos y venues en DB real.
- Siguientes: E(Onboarding) → A(Detalle evento) → D(Perfil público) → B(Conexión café→músico)