# Spec 011: Sembrar datos de prueba

> **Fecha:** 21 Jun 2026
> **Prioridad:** 🟡 Importante
> **Dependencias:** Spec 007 (tablas venues, events, profiles en Supabase), Spec 009 (tabla tickets)
> **Objetivo:** Poblar Supabase con datos reales para que la beta tenga contenido visible.

## Estado actual

Hoy la base de datos de Supabase está vacía:
- `venues`: 0 filas
- `events`: 0 filas
- `profiles`: 1 fila (solo el perfil de Victor)
- `tickets`: 0 filas

La app funciona con datos mock en `src/data/mock/`, pero al cambiar a providers reales (cuando Supabase está conectado), la cartelera se ve vacía.

## Qué hay que crear

### 1. Venues (lugares) de prueba

Insertar venues realistas de Santiago. La tabla `venues` tiene estas columnas:
- `id` (UUID, auto)
- `name` (TEXT) — nombre del lugar
- `type` (TEXT) — 'cafe' o 'venue'
- `owner_id` (UUID) — usuario cafe que lo creo, puede ser NULL para datos de prueba
- `address` (TEXT)
- `description` (TEXT)
- `estilo` (TEXT)
- `rating` (NUMERIC, default 0)
- `image` (TEXT)
- `created_at` (TIMESTAMPTZ, auto)

### 2. Eventos de prueba

Insertar eventos con artistas reales de la escena santiaguina. La tabla `events` tiene:
- `id` (UUID, auto)
- `artist_name` (TEXT)
- `venue_id` (UUID) — FK a venues
- `venue_name` (TEXT)
- `fecha` (TEXT) — ej: "Sab 28 Jun"
- `hora` (TEXT) — ej: "20:00"
- `genero` (TEXT) — ej: "Jazz", "Funk", "Rock", "Pop"
- `precio` (TEXT) — ej: "$5.000"
- `monto` (INTEGER) — precio en CLP para Mercado Pago, ej: 5000
- `imagen` (TEXT)
- `created_by` (UUID) — FK a auth.users
- `created_at` (TIMESTAMPTZ, auto)

### 3. Usuario músico de prueba

Crear un usuario en Supabase Auth con role='musician' para que los eventos tengan un creador.

## Datos a insertar

### Usuario músico de prueba

| Campo | Valor |
|-------|-------|
| email | musico@prueba.appall |
| password | Test123! |
| user_metadata.role | musician |
| user_metadata.nombre | Da Gota |

### Venues (3 lugares)

```sql
INSERT INTO venues (name, type, address, description, estilo, rating) VALUES
('Café La Palma', 'cafe', 'Av. Providencia 1234, Providencia', 'Café acogedor con terraza y música en vivo los fines de semana', 'Indie/Folk', 4.5),
('Quintal Clandesta', 'venue', 'Merced 567, Bellavista', 'Espacio cultural independiente con programación semanal de música en vivo', 'Jazz/Experimental', 4.3),
('Bar La Peña', 'cafe', 'Av. Italia 890, Ñuñoa', 'Bar con escenario, sonido profesional y parrilla. Música todas las noches.', 'Rock/Pop', 4.0);
```

### Eventos (6 eventos, algunos pasados, algunos futuros)

```sql
INSERT INTO events (artist_name, venue_id, venue_name, fecha, hora, genero, precio, monto, imagen, created_by)
SELECT
  'Da Gota',
  v.id, v.name,
  'Sab 28 Jun', '21:00', 'Funk', '$5.000', 5000,
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400',
  u.id
FROM venues v, auth.users u
WHERE v.name = 'Quintal Clandesta' AND u.email = 'musico@prueba.appall'

UNION ALL

SELECT
  'Los Santos Dumont',
  v.id, v.name,
  'Vie 27 Jun', '20:30', 'Rock', '$4.000', 4000,
  'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=400',
  u.id
FROM venues v, auth.users u
WHERE v.name = 'Bar La Peña' AND u.email = 'musico@prueba.appall'

UNION ALL

SELECT
  'La Otra',
  v.id, v.name,
  'Dom 29 Jun', '19:00', 'Pop', '$3.500', 3500,
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400',
  u.id
FROM venues v, auth.users u
WHERE v.name = 'Café La Palma' AND u.email = 'musico@prueba.appall'

UNION ALL

SELECT
  'QuintalClandesta',
  v.id, v.name,
  'Sab 5 Jul', '21:30', 'Jazz', '$6.000', 6000,
  'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400',
  u.id
FROM venues v, auth.users u
WHERE v.name = 'Quintal Clandesta' AND u.email = 'musico@prueba.appall'

UNION ALL

SELECT
  'Funkdaora',
  v.id, v.name,
  'Vie 11 Jul', '22:00', 'Funk', '$4.500', 4500,
  'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?w=400',
  u.id
FROM venues v, auth.users u
WHERE v.name = 'Bar La Peña' AND u.email = 'musico@prueba.appall'

UNION ALL

SELECT
  'Trio Jazz Santiago',
  v.id, v.name,
  'Dom 13 Jul', '18:30', 'Jazz', '$3.000', 3000,
  'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=400',
  u.id
FROM venues v, auth.users u
WHERE v.name = 'Café La Palma' AND u.email = 'musico@prueba.appall';
```

## Pasos de implementación

### Paso 1: Crear usuario músico de prueba

Ejecutar via Admin API de Supabase (usando service_role key) o via SQL:

```sql
-- La creacion de auth.users via SQL es delicada.
-- MEJOR USAR: Supabase Dashboard > Authentication > Add User
-- O via API:

-- Curl (desde el Mac):
-- curl -X POST 'https://xluinfihjjtxkglihxqz.supabase.co/auth/v1/admin/users' \
--   -H "apikey: $SUPABASE_SERVICE_KEY" \
--   -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
--   -H "Content-Type: application/json" \
--   -d '{"email":"musico@prueba.appall","password":"Test123!","email_confirm":true,"user_metadata":{"role":"musician","nombre":"Da Gota"}}'
```

### Paso 2: Insertar venues

Abrir Supabase Dashboard > SQL Editor y ejecutar el INSERT de venues de arriba.

### Paso 3: Insertar eventos

Despues de tener el user_id del musico creado y los venue_ids, ejecutar el INSERT de eventos.

## Alternativa: Seed script

Crear un archivo `supabase/seed.sql` con todo el INSERT, y configurar en `supabase/config.toml`:

```toml
[db.seed]
enabled = true
sql_paths = ["./seed.sql"]
```

Luego ejecutar:
```bash
supabase db reset
```

## Criterios de aceptacion

- [ ] La cartelera muestra al menos 3 venues y 6 eventos (pasados y futuros)
- [ ] Los eventos tienen precio en formato texto (precio) y numerico (monto) para MP
- [ ] El usuario musico@prueba.appall existe y puede loguearse
- [ ] Los eventos tienen created_by apuntando al musico de prueba
- [ ] Las imagenes cargan correctamente (usar URLs de Unsplash o placeholder)
- [ ] Al hacer clic en un evento, se ve el detalle con boton "Comprar entrada"
- [ ] La compra funciona con precios reales (monto > 0)
- [ ] mock data en `src/data/mock/` queda como respaldo

## Archivos que tocar

| Archivo | Cambio |
|---------|--------|
| `specs/011-sembrar-datos-prueba.md` | Escribir el spec (este archivo) |
| Ninguno en src/ | Son solo inserts en Supabase |

## Notas

- Las URLs de imagenes son de Unsplash. Si no cargan, se puede usar un placeholder local.
- Los venues no tienen owner_id (NULL). Esto es correcto para datos de prueba.
- Los eventos usan fechas relativas al 21 Jun 2026. Actualizar si se usa despues.
- Para ver la cartelera con datos reales, asegurarse de que `EventosContext` tenga conexion a Supabase (no debe estar en modo "no network").