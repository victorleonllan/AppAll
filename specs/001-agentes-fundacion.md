# Spec 001: AGENTS.md + Fundación del proyecto

## Objetivo

Crear la base arquitectónica del proyecto: AGENTS.md como constitución, sistema de tema, tipos compartidos y datos mock. Este spec NO modifica código existente — solo crea archivos nuevos.

---

## Fase 1: AGENTS.md (Constitución del proyecto)

Reemplazar TODO el contenido de `AGENTS.md` por:

```markdown
# AppAll — Guía de Arquitectura

> Proyecto: AppAll — plataforma triple que conecta público + músicos + cafés en Santiago.
> Stack: React Native + Expo SDK 56 + Supabase (futuro)
> AI Agents: Esta guía es el punto de entrada para cualquier IA que trabaje en el proyecto.

## 📁 Estructura de directorios

```
src/
├── components/     → Componentes UI reutilizables (nombres en español: TarjetaEvento, etc.)
├── data/
│   └── mock/       → Datos mock y constantes (mockEventos.ts, mockCafes.ts)
├── navigation/     → Configuración de navegación (tabs, stacks)
├── screens/        → Pantallas de la app (Cartelera, Cafes, Perfil...)
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
4. **Datos mock**: En `src/data/mock/`, NO inline en screens
5. **Tipos**: TODAS las interfaces en `src/types/index.ts`
6. **Componentes**: Un archivo por componente, export default
7. **Pantallas**: Cada screen recibe sus datos por import, no los define internamente
8. **NO modificar AGENTS.md sin spec explícito**

## 📋 Specs

Los specs están en `specs/` y se ejecutan con OpenCode:
```
opencode run 'Implementa specs/NNN-nombre.md -f specs/NNN-nombre.md'
```
```

---

## Fase 2: Crear estructura de directorios

```bash
mkdir -p src/theme src/types src/data/mock src/components src/navigation
```

---

## Fase 3: Sistema de tema

Crear `src/theme/index.ts`:

```typescript
export const colors = {
  background: '#FAF0E6',
  primary: '#3D2B1F',
  secondary: '#6B4F3A',
  accent: '#8B4513',
  accentLight: '#F5EDE6',
  muted: '#A0897A',
  cardBackground: '#FFFFFF',
  success: '#2E7D32',
  white: '#FFFFFF',
  border: '#E8DDD4',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 48,
} as const;
```

---

## Fase 4: Tipos compartidos

Crear `src/types/index.ts`:

```typescript
export interface Evento {
  id: string;
  artista: string;
  cafe: string;
  fecha: string;
  hora: string;
  genero: string;
  precio: string;
  imagen: string | null;
}

export interface Cafe {
  id: string;
  nombre: string;
  estilo?: string;
  distancia: string;
  rating?: number;
}

export interface Musico {
  id: string;
  nombre: string;
  genero: string;
  bio: string;
}
```

---

## Fase 5: Datos mock

### Crear `src/data/mock/cafes.ts`

```typescript
import { Cafe } from '../../types';

export const cafesAsociados: Cafe[] = [
  { id: '1', nombre: 'Café La Palma', estilo: 'Jazz en vivo', distancia: '2 km', rating: 4.8 },
  { id: '2', nombre: 'Café Central', estilo: 'Blues los sábados', distancia: '3 km', rating: 4.5 },
  { id: '3', nombre: 'Café del Artista', estilo: 'Rock acústico', distancia: '1.5 km', rating: 4.7 },
];

export const cafesPendientes: Cafe[] = [
  { id: '4', nombre: 'Café del Mar', distancia: '500 m' },
  { id: '5', nombre: 'Star cafés', distancia: '1 km' },
  { id: '6', nombre: 'Café Foresta', distancia: '800 m' },
];
```

### Crear `src/data/mock/eventos.ts`

```typescript
import { Evento } from '../../types';

export const eventos: Evento[] = [
  { id: '1', artista: 'Da Gota', cafe: 'Café La Palma', fecha: 'Sáb 14 Jun', hora: '20:00', genero: 'Samba / MPB', precio: '$5.000', imagen: null },
  { id: '2', artista: 'Los Andes Jazz', cafe: 'Café Central', fecha: 'Dom 15 Jun', hora: '19:30', genero: 'Jazz fusión', precio: '$4.000', imagen: null },
  { id: '3', artista: 'María Sol Trío', cafe: 'Café del Artista', fecha: 'Vie 20 Jun', hora: '21:00', genero: 'Pop acústico', precio: '$6.000', imagen: null },
  { id: '4', artista: 'Banda de Garage', cafe: 'Café Foresta', fecha: 'Sáb 21 Jun', hora: '18:00', genero: 'Rock alternativo', precio: '$3.500', imagen: null },
  { id: '5', artista: 'Tango Sur', cafe: 'Café La Palma', fecha: 'Dom 22 Jun', hora: '20:30', genero: 'Tango / Milonga', precio: '$5.000', imagen: null },
];
```

---

## Criterios de aceptación

- [ ] AGENTS.md reemplazado con la guía completa de arquitectura
- [ ] Directorios `src/theme/`, `src/types/`, `src/data/mock/`, `src/components/`, `src/navigation/` existen
- [ ] `src/theme/index.ts` existe con colors, spacing, borderRadius, fontSize
- [ ] `src/types/index.ts` existe con Evento, Cafe, Musico
- [ ] `src/data/mock/cafes.ts` tiene los 6 cafés (3 asociados + 3 pendientes)
- [ ] `src/data/mock/eventos.ts` tiene 5 eventos mock
- [ ] Ningún archivo existente fue modificado (solo se crearon nuevos)
- [ ] La app sigue compilando y funcionando igual que antes