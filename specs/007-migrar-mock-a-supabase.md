# Spec 007: Migrar datos mock a Supabase

## Objetivo

Reemplazar todos los datos mock por consultas reales a Supabase. Crear las tablas `venues` y `events`, conectar screens, guardar perfiles y eventos desde la base de datos real.

**Dependencia**: Requiere spec 006 completo (tipos `Venue`, `Evento` actualizados).

---

## Archivos a tocar

- **Supabase SQL Editor** — migraciones (crear tablas, políticas RLS)
- `src/lib/supabase.ts` — verificar tipos
- `src/types/index.ts` — actualizar con snake_case para Supabase (opcional)
- `src/context/VenuesContext.tsx` — crear provider
- `src/context/EventosContext.tsx` — crear provider
- `src/data/mock/` — mantener como fallback temporal
- `src/screens/CarteleraScreen.tsx` — conectar a EventosContext
- `src/screens/CafesScreen.tsx` — conectar a VenuesContext
- `src/screens/CrearEventoScreen.tsx` — insertar eventos a Supabase
- `src/screens/PerfilMusicoScreen.tsx` — guardar perfil en Supabase
- `src/screens/DashboardCafeScreen.tsx` — datos desde Supabase
- `App.tsx` — envolver en providers
- `AGENTS.md` — actualizar con estructura de datos real

---

## Pasos de implementación

### FASE 0: Setup manual en Supabase (SQL Editor)

Ejecutar en SQL Editor, seleccionando **"Run and enable RLS"** en cada CREATE TABLE.

```sql
-- TABLA: venues (locales)
CREATE TABLE venues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cafe', 'venue')),
  owner_id UUID REFERENCES auth.users(id),
  address TEXT,
  description TEXT,
  estilo TEXT,
  rating DECIMAL(2,1) DEFAULT 0,
  lat DECIMAL(10,7),
  lng DECIMAL(10,7),
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venues_select" ON venues FOR SELECT USING (true);
CREATE POLICY "venues_insert" ON venues FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "venues_update" ON venues FOR UPDATE USING (auth.uid() = owner_id);

-- TABLA: events
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_name TEXT NOT NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  venue_name TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  genero TEXT NOT NULL,
  precio TEXT NOT NULL,
  imagen TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_select" ON events FOR SELECT USING (true);
CREATE POLICY "events_insert" ON events FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "events_update" ON events FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "events_delete" ON events FOR DELETE USING (auth.uid() = created_by);

-- Extender profiles con datos de músico
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS genero TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS spotify TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS youtube TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS foto TEXT;
```

### FASE 1: Crear context providers

**`src/context/VenuesContext.tsx`** — fetch desde `supabase.from("venues").select("*")`. Separar por type: cafes vs otherVenues. Exponer: `cafes`, `otherVenues`, `loading`, `refresh`, `createVenue`.

**`src/context/EventosContext.tsx`** — fetch desde `supabase.from("events").select("*")`. Exponer: `eventos`, `loading`, `refresh`, `createEvento`, `deleteEvento`.

Provider + hook (`useVenues`, `useEventos`). Envolver en `App.tsx`.

### FASE 2: Conectar screens

**CarteleraScreen**: `const { eventos, loading } = useEventos();`

**CafesScreen (→ Locales)**: `const { cafes, otherVenues, loading } = useVenues();` + `useEventos()` para filtrar otros venues con eventos activos.

**CrearEventoScreen**: 
- `const { createVenue } = useVenues();`
- `const { createEvento } = useEventos();`
- `await createEvento({ artist_name, venue_id, venue_name, fecha, hora, genero, precio, created_by: user.id })`
- Si venue nuevo: `const newVenue = await createVenue({ name: venueQuery, type: "venue" })`

**PerfilMusicoScreen**: 
- Guardar: `supabase.from("profiles").upsert({ id: user.id, genero, bio, instagram, spotify, youtube }).select().single()`
- Cargar: `supabase.from("profiles").select("*").eq("id", user.id).single()`

**DashboardCafeScreen**: 
- `supabase.from("venues").select("*").eq("owner_id", user.id).single()` para obtener datos del café
- `useEventos()` filtrado por `created_by === user.id`

### FASE 3: Data flow final

- Mock data se mantiene como archivo pero ya no se importa en screens
- Opcional: flag `EXPO_PUBLIC_USE_MOCK=true` en `.env` para alternar

---

## Criterios de aceptación

### FASE 0 (manual en SQL Editor)
- [ ] Tabla `venues` creada con RLS
- [ ] Tabla `events` creada con RLS
- [ ] Columnas adicionales en `profiles`

### FASE 1–2 (código)
- [ ] VenuesContext creado y funcional
- [ ] EventosContext creado y funcional
- [ ] CarteleraScreen muestra eventos reales
- [ ] CafesScreen muestra venues reales
- [ ] CrearEventoScreen inserta eventos + venues
- [ ] PerfilMusicoScreen guarda/lee de Supabase
- [ ] DashboardCafeScreen usa datos reales
- [ ] App.tsx envuelto en providers
- [ ] TypeScript compila sin errores