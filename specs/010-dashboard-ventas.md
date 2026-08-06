
# Spec 010 — Dashboard de Ventas del Músico

## Problema

El músico no tiene visibilidad de sus ventas. Hoy puede crear eventos y editar su perfil, pero no puede ver cuántas entradas se han vendido, cuánto dinero ha generado, ni el estado de cada ticket.

## Objetivo

Crear una pantalla "Mis Ventas" dentro del stack del músico (MusicoStack) que muestre:

1. **Resumen general**: total de entradas vendidas, monto total, eventos activos
2. **Listado por evento**: cada evento con sus tickets (vendidos / total, monto, estado)
3. **Detalle de tickets**: cada ticket con status (paid, pending, cancelled), comprador, fecha

## Data disponible

### Tabla tickets
- `id` (uuid)
- `evento_id` (uuid, FK a events)
- `user_id` (uuid, FK a profiles)
- `status` (text: paid, pending, cancelled)
- `preference_id` (text)
- `payment_id` (text, nullable)
- `monto` (integer)
- `cantidad` (integer)
- `created_at` (timestamptz)

### Tabla events
- `id` (uuid)
- `artist_name` (text)
- `venue_name` (text)
- `fecha` (text)
- `hora` (text)
- `precio` (text)
- `created_by` (uuid, FK a profiles)
- `monto` (integer)

### Query base
```sql
SELECT
  e.id as evento_id,
  e.artist_name,
  e.venue_name,
  e.fecha,
  e.precio,
  t.id as ticket_id,
  t.status,
  t.monto,
  t.cantidad,
  t.created_at
FROM events e
LEFT JOIN tickets t ON t.evento_id = e.id
WHERE e.created_by = :user_id
ORDER BY e.fecha DESC, t.created_at DESC;
```

## Plan de implementación

### 1. Pantalla `VentasMusicoScreen.tsx`
- Tab superior: "Resumen" | "Por Evento"
- **Resumen**: cards con totales (entradas vendidas, monto total, eventos activos)
- **Por Evento**: lista de eventos, cada uno expandible mostrando tickets

### 2. Navegación
- Agregar `VentasMusico` al `MusicoStackParamList`
- Agregar route en `MusicoStack.tsx`
- Agregar botón "Mis Ventas" en `PerfilMusicoScreen`

### 3. Query
- `supabase.from('tickets').select('*, events!inner(*)').eq('events.created_by', user.id)`
- Filtro por `status = 'paid'` para totales de ventas reales
- También mostrar `pending` y `cancelled` como info

### 4. UI
- Cards de resumen con números grandes
- Lista de eventos con badge de estado (cantidad vendida / total)
- Detalle expandible: cada ticket con status, comprador, fecha, monto
- Colors del theme existente (`colors.primary`, `colors.white`, etc.)

## Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `src/screens/VentasMusicoScreen.tsx` | **CREAR** — pantalla principal de ventas |
| `src/navigation/MusicoStack.tsx` | MODIFICAR — agregar route `VentasMusico` |
| `src/screens/PerfilMusicoScreen.tsx` | MODIFICAR — agregar botón "Mis Ventas" |

## Criterios de aceptación

- [ ] El músico ve un resumen con total de entradas vendidas y monto acumulado
- [ ] El músico ve cada evento con cantidad de tickets y estado
- [ ] El músico puede expandir un evento y ver los tickets individuales
- [ ] Solo se muestran los eventos creados por el músico logueado
- [ ] Funciona en web y móvil (React Native + Expo)
- [ ] Usa el theme existente (colors, spacing, fontSize)

## Estado: Pendiente
