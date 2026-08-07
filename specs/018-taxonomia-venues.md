# Spec 018 — Taxonomía de venues: de "cafés" a "locales"

## Contexto

Sonópolis se presenta como una plataforma que conecta público, músicos y **cafés**. Esa palabra quedó incrustada en el esquema (`venues.type CHECK IN ('cafe','venue')`), en el código y en toda la UI.

El problema no es de copy. Con el MCP de Supabase conectado se revisaron los 3 venues reales en producción y **dos de tres están mal categorizados**:

| Venue | `type` actual | Su propia `description` |
|---|---|---|
| Café La Palma | `cafe` | "Café acogedor con terraza y música en vivo los fines de semana" ✅ |
| Bar La Peña | `cafe` | "**Bar** con escenario, sonido profesional y **parrilla**" ❌ |
| Quintal Clandesta | `venue` | "**Espacio cultural** independiente con programación semanal" ❌ |

`'venue'` es un catch-all sin significado: no dice si es una sala, un bar o un centro cultural. Y `'cafe'` se estaba usando como sinónimo de "local con música", que es justo lo que hay que dejar de hacer.

**Decisión de diseño:** no se renombran los nombres propios. Un café se llama café — "Local La Palma" sería absurdo. Lo que cambia es la **taxonomía** (el `type`) y el **lenguaje de la interfaz** (la categoría se llama "locales", no "cafés").

## Cambios

### 1. Ampliar el CHECK de `venues.type`

```sql
ALTER TABLE public.venues DROP CONSTRAINT venues_type_check;
ALTER TABLE public.venues ADD CONSTRAINT venues_type_check
  CHECK (type IN ('cafe','bar','sala','centro_cultural'));
```

Se elimina `'venue'` porque no aporta información. Los cuatro valores nuevos son descriptivos y mutuamente excluyentes.

### 2. Recategorizar los venues existentes

```sql
UPDATE public.venues SET type = 'bar'             WHERE name = 'Bar La Peña';
UPDATE public.venues SET type = 'centro_cultural' WHERE name = 'Quintal Clandesta';
-- Café La Palma se queda en 'cafe'
```

El orden importa: el `UPDATE` va **antes** del nuevo `CHECK`, porque `Quintal Clandesta` tiene hoy `type = 'venue'`, valor que el constraint nuevo ya no admite.

### 3. `src/types/index.ts`

```typescript
export type VenueType = "cafe" | "bar" | "sala" | "centro_cultural";

export interface Venue {
  type: VenueType;   // antes: "cafe" | "venue"
  // ...
}
```

Se elimina también `interface Cafe` (código muerto, ver punto 6).

### 4. `src/context/VenuesContext.tsx` — bug latente

```typescript
const cafes       = allVenues.filter((v) => v.type === 'cafe');
const otherVenues = allVenues.filter((v) => v.type === 'venue');   // ← queda vacío
```

Tras la migración **ningún** venue tiene `type === 'venue'`, así que `otherVenues` quedaría permanentemente vacío y `CafesScreen` dejaría de mostrar la mitad del catálogo. El filtro pasa a ser por exclusión:

```typescript
const locales      = allVenues.filter((v) => v.type === 'cafe');
const otrosLocales = allVenues.filter((v) => v.type !== 'cafe');
```

Se mantienen los nombres `cafes`/`otherVenues` en el contrato del context: renombrar archivos y símbolos (`CafesStack`, `DashboardCafeScreen`, …) queda fuera de alcance para que el diff sea legible.

**Dos consumidores quedaban rotos por asumir que "local" = "café":**

- `DashboardCafeScreen` buscaba el local del usuario con `cafes.find(...)`. Un dueño de bar o centro cultural no habría encontrado el suyo. Pasa a `allVenues`.
- `CafesScreen` titulaba "Locales" una lista que solo contenía cafés, mandando Bar La Peña y Quintal Clandesta a una sección "otros locales". Se unifica en un solo listado sobre `allVenues`, cada uno con su emoji y etiqueta de tipo.

La separación "cafés asociados" vs "otros locales" se pierde a propósito: usaba `type` como si fuera un tier de asociación, que nunca fue. Si esa distinción importa comercialmente, necesita su propia columna.

### 5. Lenguaje de la interfaz

| Archivo | Antes | Después |
|---|---|---|
| `CafesScreen.tsx:86` | `☕ Cafés` | `📍 Locales` |
| `CafesScreen.tsx:39` | "Inicia sesión como café…" | "Inicia sesión como local…" |
| `navigation/index.tsx:61` | tab `Cafés` | tab `Locales` |
| `navigation/index.tsx:21` | `Mi Café` | `Mi Local` |
| `CafeStack.tsx:24` | `title: 'Mi Café'` | `title: 'Mi Local'` |
| `AuthScreen.tsx:40` | "…músicos y cafés en Santiago" | "…músicos y locales en Santiago" |
| `AuthScreen.tsx:48` | "…en los mejores cafés" | "…en los mejores locales" |
| `AuthScreen.tsx:79` | "Dueño de café" | "Dueño de local" |
| `RegisterScreen.tsx:94` | `☕ Dueño de café` | `📍 Dueño de local` |
| `PerfilScreen.tsx:20,24` | "Dueño de café" / "músico o café" | "Dueño de local" / "músico o local" |
| `DashboardCafeScreen.tsx:34` | `☕ Bienvenido, {… ?? "Café"}` | `📍 Bienvenido, {… ?? "Local"}` |

El emoji `☕` se reemplaza por `📍`, que ya se usa en las tarjetas para dirección y funciona para cualquier tipo de local. `CrearEventoScreen` pasa a mostrar un emoji por tipo (`☕` café · `🍺` bar · `🎪` sala · `🎭` centro cultural).

### 6. Borrar código muerto

Nada del proyecto los importa (verificado con grep):

- `src/components/TarjetaCafe.tsx`
- `src/data/mock/cafes.ts`
- `interface Cafe` en `src/types/index.ts`

Son restos del spec 002, anteriores a la migración a Supabase del spec 007.

## Lo que NO cambia

- **`profiles.role = 'cafe'`.** El rol del usuario sigue diciendo `'cafe'`. Cambiarlo exige migrar `auth.users.raw_user_meta_data` de usuarios reales y tocar el flujo de registro — es un spec aparte, con más riesgo y sin beneficio visible.
- **Nombres propios de venues.** "Café La Palma" sigue llamándose así.
- **`specs/` anteriores.** Un spec numerado es un commit; son registro histórico.

## Criterios de aceptación

- [ ] `venues_type_check` admite `cafe`, `bar`, `sala`, `centro_cultural` y rechaza `venue`
- [ ] Bar La Peña tiene `type = 'bar'`; Quintal Clandesta, `type = 'centro_cultural'`
- [ ] `otherVenues` filtra por exclusión y no queda vacío
- [ ] Ningún texto visible dice "café" salvo en nombres propios
- [ ] `TarjetaCafe.tsx`, `data/mock/cafes.ts` e `interface Cafe` eliminados
- [ ] `npx tsc --noEmit` sin errores

## Deuda que deja abierta

Los 3 venues tienen `owner_id = NULL`: ningún local tiene dueño vinculado, así que nadie puede editarlos (`venues_update` exige `auth.uid() = owner_id`). Se aborda cuando exista el flujo de reclamar local.
