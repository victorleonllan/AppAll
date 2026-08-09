# Spec 032 — Renombrar "café" a "local" en archivos, símbolos y contrato de contexto

> Estado: **implementado el 2026-08-09**. `npx tsc --noEmit` limpio en `src/`.
> Falta verificar en runtime (ver Criterio de cierre, último punto).
> Completa lo que el spec 018 dejó fuera a propósito.

## Contexto

El spec 018 cambió el lenguaje **visible** de la UI de "cafés" a "locales", pero dejó
explícitamente fuera el renombrado de archivos y símbolos "para mantener el diff legible".
Quedó anotado en `PENDIENTES.md`, sección "Cosas menores":

> Renombrar archivos y símbolos (`CafesStack`, `DashboardCafeScreen`, `CafesScreen`) quedó
> fuera del spec 018 a propósito, para mantener el diff legible.
> `VenuesContext` sigue exponiendo `cafes` / `otherVenues` en su contrato, aunque ahora
> filtren por exclusión.

Victor notó que persisten textos "café" — nombres de archivo en particular — y pidió revisar
si además hay archivos obsoletos.

**Resultado de la revisión (9-ago-2026): no hay archivos obsoletos.** `TarjetaCafe.tsx` y
`data/mock/cafes.ts` ya se habían borrado en el spec 018 (verificado: no existen en el repo).
`CafeStack.tsx` (singular) y `CafesStack.tsx` (plural) parecen duplicados por el nombre pero
no lo son: son dos stacks de navegación distintos y ambos activos —`CafeStack` monta el
dashboard del dueño de un local ("Mi Local"), `CafesStack` monta el listado público
("Locales"). Lo que sobra es nomenclatura, no código muerto de archivos.

Sí apareció código muerto **dentro** de un archivo activo: ver punto 4.

## Dos usos de "café" que no hay que confundir

| Uso | Ejemplos | Se toca en este spec |
|---|---|---|
| **Legítimo** — `cafe` es uno de los 4 valores reales de la taxonomía de locales (spec 018) | `VenueType`, `VENUE_LABEL.cafe`, `VENUE_EMOJI.cafe`, nombres propios ("Café La Palma"), ids mock (`venue-cafe-1`) | No |
| **A corregir** — "cafe" usado como sinónimo genérico de "local", heredado de cuando el catálogo entero eran cafés | Nombres de archivo, componentes, tipos y el contrato de `VenuesContext` | Sí |

Un café sigue llamándose café. Lo que cambia es que un archivo o símbolo que representa
"cualquier tipo de local" deje de decir "cafe".

## Cambios

### 1. Renombrar archivos y símbolos de navegación/pantallas

| Archivo actual | Archivo nuevo | Símbolos afectados |
|---|---|---|
| `src/navigation/CafesStack.tsx` | `src/navigation/LocalesStack.tsx` | `CafesStack` → `LocalesStack`, `CafesStackParamList` → `LocalesStackParamList` |
| `src/navigation/CafeStack.tsx` | `src/navigation/MiLocalStack.tsx` | `CafeStack` → `MiLocalStack`, `CafeStackParamList` → `MiLocalStackParamList` |
| `src/screens/CafesScreen.tsx` | `src/screens/LocalesScreen.tsx` | `CafesScreen` → `LocalesScreen` |
| `src/screens/DashboardCafeScreen.tsx` | `src/screens/DashboardLocalScreen.tsx` | `DashboardCafeScreen` → `DashboardLocalScreen` |

Nombres elegidos para que coincidan con lo que el usuario ya ve en los tabs: la pestaña
pública se llama "Locales" (`LocalesStack`/`LocalesScreen`), la del dueño se llama
"Mi Local" (`MiLocalStack`/`DashboardLocalScreen`). Se evita el par "Local/Locales" que
reproduciría la misma ambigüedad singular/plural que tenía "Cafe/Cafes".

Cuatro puntos de importación a actualizar en cascada:
- `src/navigation/index.tsx` — imports y uso de ambos stacks
- `src/screens/LocalesScreen.tsx` (ex `CafesScreen.tsx`) — import de `LocalesStackParamList`
- `src/screens/DashboardLocalScreen.tsx` (ex `DashboardCafeScreen.tsx`) — import de `MiLocalStackParamList`
- `src/navigation/MiLocalStack.tsx` (ex `CafeStack.tsx`) — import de `DashboardLocalScreen`
- `src/navigation/LocalesStack.tsx` (ex `CafesStack.tsx`) — import de `LocalesScreen`

### 2. `VenuesContext.tsx` — contrato y limpieza de código muerto

```typescript
interface VenuesState {
  cafes: Venue[];        // ← eliminar
  otherVenues: Venue[];  // ← eliminar
  allVenues: Venue[];
  ...
}
```

`cafes` y `otherVenues` se calculan pero **ningún componente los consume** (verificado con
grep sobre las tres llamadas a `useVenues()` que existen en el repo: `LocalesScreen`,
`DashboardLocalScreen` y `CrearEventoScreen` — las tres solo destructuran `allVenues`).
No es solo un nombre desactualizado, son dos filtros que se recalculan en cada render sin
que nada los lea. Se eliminan del contrato y de la implementación:

```typescript
// Se borra:
const cafes = allVenues.filter((v) => v.type === 'cafe');
const otherVenues = allVenues.filter((v) => v.type !== 'cafe');
```

Si en el futuro una pantalla necesita filtrar por tipo, se vuelve a calcular en el
componente que lo necesite — no en el contexto, para no repetir el patrón de exponer un
filtro que nadie audita.

### 3. Icono de la pestaña "Mi Local"

`src/navigation/index.tsx:21`:

```typescript
if (role === 'cafe') return { name: 'Mi Local' as const, component: MiLocalStack, icon: 'cafe' as const };
```

El icono de Ionicons es literalmente una taza de café, fijo sin importar el tipo real del
local del dueño (podría ser un bar, una sala o un centro cultural desde el spec 018). La
pestaña pública "Locales" ya usa `'location'` (pin de mapa, `index.tsx:45`) precisamente
para no atarse a un tipo. `icon: 'cafe'` pasa a `icon: 'location'` para ser consistente con
esa decisión y no prometer visualmente algo que el dato ya no garantiza.

### 4. Comentarios y nombres de variable menores

- `CafesScreen.tsx:24` (futura `LocalesScreen.tsx`) — el comentario dice "la separación
  café / 'otros'"; se actualiza a lenguaje neutro ("la separación por tipo").
- `DashboardCafeScreen.tsx:20` (futura `DashboardLocalScreen.tsx`) — comentario ya usa
  "locales" correctamente, no requiere cambio.

### 5. Documentación viva (no numerada, se actualiza junto con el código)

`CLAUDE.md` y `AGENTS.md` en la raíz no son specs — son documentación que debe reflejar el
estado real del repo. Referencias a actualizar cuando se implemente:

- `CLAUDE.md:73` — `` `cafe` → `CafeStack` `` pasa a `` `cafe` → `MiLocalStack` ``
- `AGENTS.md:3` — "conecta público + músicos + cafés en Santiago" pasa a "... + locales
  en Santiago" (ya nadie más que músicos y cafés existía cuando se escribió esa frase;
  hoy el catálogo incluye bares, salas y centros culturales)
- `AGENTS.md:17` — el árbol de carpetas menciona "Cafes" como pantalla; pasa a "Locales"

## Lo que NO cambia (y por qué)

- **`profiles.role = 'cafe'` en la base de datos.** Cambiarlo exige migrar
  `auth.users.raw_user_meta_data` de usuarios reales — mismo motivo por el que el spec 018
  lo dejó fuera. Sigue siendo, en palabras de ese spec, "un spec aparte": mayor riesgo,
  toca datos de producción, y ningún cambio de este spec lo requiere como prerequisito.
- **`UserRole`/`RoleOption` como tipos TypeScript siguen usando el literal `'cafe'`.** Es
  el valor que realmente viaja en `session.user.user_metadata.role` y en `profiles.role`;
  cambiarlo sin migrar la base rompería la comparación `role === 'cafe'` en
  `navigation/index.tsx`, `AuthScreen.tsx` y `RegisterScreen.tsx`. El tipo debe mentir lo
  mismo que miente la base, no menos.
- **`VenueType` sigue teniendo `'cafe'` como uno de sus 4 valores.** Es correcto: un café
  es un tipo real de local, igual que bar, sala o centro cultural. No se toca `lib/venues.ts`
  (`VENUE_LABEL`, `VENUE_EMOJI`) ni el `CHECK` de `venues.type`.
- **Nombres propios de locales** ("Café La Palma", "Café Central", "Café del Artista") y
  sus `id` mock (`venue-cafe-1`, etc.). Un café se llama café.
- **`specs/` anteriores** (005, 018 y cualquier otro que mencione "cafe"/"café"). Un spec
  numerado es un commit; son registro histórico y no se editan retroactivamente.
- **`supabase/migrations/`.** Las migraciones ya aplicadas son historial; el `role`/`type`
  que usan es el que correspondía en su momento.

## Criterios de aceptación

- [x] `CafeStack.tsx` → `MiLocalStack.tsx`, `CafesStack.tsx` → `LocalesStack.tsx`,
      `DashboardCafeScreen.tsx` → `DashboardLocalScreen.tsx`, `CafesScreen.tsx` →
      `LocalesScreen.tsx` (con `git mv` para conservar historial)
- [x] Todos los símbolos exportados (`ParamList`s, componentes) renombrados en cascada;
      cero referencias residuales a `Cafe`/`Cafes` en `src/navigation/` y `src/screens/`
      — incluida la route key `CafesList` → `LocalesList`, que no estaba listada
      explícitamente arriba pero cae bajo el mismo criterio
- [x] `VenuesContext`: `cafes` y `otherVenues` eliminados del contrato y de la
      implementación; `allVenues` sigue funcionando en los tres consumidores existentes
- [x] `icon: 'cafe'` → `icon: 'location'` en `navigation/index.tsx`
- [x] `CLAUDE.md` y `AGENTS.md` actualizados en las líneas listadas en la sección 5
- [x] `PENDIENTES.md` — se borra la entrada de "Cosas menores" que este spec resuelve
      (hecho en la sesión anterior, al escribir el spec)
- [x] Ningún archivo bajo `src/` (excluyendo `data/mock/*`, `types/index.ts` y
      `lib/venues.ts`, donde "cafe" es legítimo) contiene "Cafe"/"Cafes" en nombre de
      archivo o símbolo exportado — verificado con grep, cero resultados
- [x] `npx tsc --noEmit` sin errores nuevos (los de `supabase/functions/*` son
      preexistentes, por tipos de Deno ausentes en el tsconfig de Node — no relacionados)
- [x] `npx expo export --platform web` compila sin errores (670 módulos, bundle de
      1.6MB) — confirma que todos los imports resuelven y que `icon: 'location'` es un
      glyph válido de Ionicons. **No verificado con clic interactivo** en las pestañas
      "Locales"/"Mi Local"; queda como el único punto sin cerrar de este spec

## Deuda que deja abierta

- **`profiles.role = 'cafe'`** sigue divergiendo del lenguaje "local" en todo lo demás.
  Migrar `auth.users.raw_user_meta_data` de usuarios reales y actualizar el flujo de
  registro/login es su propio spec, con su propio riesgo — ya señalado en el 018 y en
  `CLAUDE.md`, sección "Vocabularios que se parecen y no son lo mismo".
- Este spec es puramente de nomenclatura frontend: no toca esquema, no despliega Edge
  Functions, no tiene dependencias de los specs 021/028 en curso. Puede implementarse en
  cualquier momento sin bloquear ni ser bloqueado por el resto del roadmap.
