# Sonópolis — Guía de Arquitectura

> Proyecto: Sonópolis — plataforma triple que conecta público + músicos + locales en Santiago.
> Stack: React Native + Expo SDK 56 + Supabase + **Mercado Pago Checkout Pro**
> AI Agents: Esta guía es el punto de entrada para cualquier IA que trabaje en el proyecto.

## 📁 Estructura de directorios

```
src/
├── components/     → Componentes UI reutilizables (TarjetaEvento, etc.)
├── context/        → Providers: AuthContext, VenuesContext, EventosContext
├── data/
│   └── mock/       → Datos mock y constantes (fallback cuando Supabase no está configurado)
├── lib/            → Supabase client
├── navigation/     → Configuración de navegación (tabs, stacks)
├── screens/        → Pantallas de la app (Cartelera, Locales, Perfil...)
├── theme/          → Tokens de diseño: colores, spacing, borderRadius
└── types/          → Interfaces TypeScript compartidas
```

## 🎨 Sistema de Tema

NUNCA hardcodear colores ni valores de estilo en los screens. Importar desde `src/theme/index.ts`.

Colores del branding:
- Fondo: #FAF0E6 (beige claro)
- Primario: #3D2B1F (marrón oscuro, títulos)
- Secundario: #6B4F3A (marrón medio, textos secundarios)
- Acento: #8B4513 (marrón tierra, botones, bordes)
- Acento claro: #F5EDE6 (fondos de botones inactivos)
- Tenue: #A0897A (textos tenues)
- Card: #FFFFFF

## 📐 Convenciones de código

1. **ESPAÑOL**: Nombres de componentes, archivos, variables y comentarios en español
2. **Importaciones relativas**: Usar `../` desde el archivo
3. **Estilos**: Usar `StyleSheet.create()` con theme tokens, NO estilos inline
4. **Data flow**: Screens usan hooks (`useVenues()`, `useEventos()`, `useAuth()`). Los providers intentan Supabase primero, fallback a mock si no hay conexión.
5. **Tipos**: TODAS las interfaces en `src/types/index.ts`. Los providers mapean snake_case (DB) a camelCase (frontend).
6. **Componentes**: Un archivo por componente, export default
7. **Pantallas**: Cada screen recibe sus datos por hooks, no importa mock directamente
8. **NO modificar AGENTS.md sin spec explícito**

## 📋 Specs

Los specs están en `specs/` y se ejecutan con OpenCode:
```
opencode run 'Implementa specs/NNN-nombre.md -f specs/NNN-nombre.md'
```
