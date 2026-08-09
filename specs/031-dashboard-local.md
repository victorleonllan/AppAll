# Spec 031 — Dashboard de local: perfil editable, dueño y panel de gestión

> Estado: **propuesto**. Escrito el 2026-08-08, sin implementar.
> Par del spec 030 (dashboard de banda). Este está **más atrás**: ver "El local no existe".

## Contexto

`DashboardCafeScreen` (spec 005) es de **solo lectura**. Muestra `name`, `address` y `estilo`
del local, la lista de eventos propios, un botón de crear evento y una lista de músicos que
sale de `musicosMock`.

No hay ninguna pantalla en toda la app donde el dueño de un local pueda **escribir** los datos
de su local. Ni crearlo, ni editarlo. `createVenue` existe en `VenuesContext`, pero el único
lugar que lo llama es `CrearEventoScreen`, de pasada, cuando el músico escribe un nombre de
local que no existe.

## El local no existe — tres hechos verificados

Consultas a producción, 2026-08-08:

**1. Ningún usuario tiene el rol `cafe`.**

```
auth.users:  musician(2) · public(1) · sin rol(1)   → cafe: 0
```

La tercera pestaña se decide por `session.user.user_metadata.role`. Sin ningún usuario `cafe`,
**`CafeStack` nunca se montó**. Este dashboard no está "poco avanzado": no ha sido abierto
nunca por nadie. `RegisterScreen` sí ofrece el rol, así que el camino existe — no se recorrió.

**2. Los tres locales tienen `owner_id = NULL`.**

```
Bar La Peña · Café La Palma · Quintal Clandesta   → owner_id: NULL en los tres
```

El dashboard hace `allVenues.find(v => v.ownerId === user.id)`. Con `owner_id` NULL en toda la
tabla, **el `find` no puede devolver nada**: el encabezado dice *"Bienvenido, Local"* para
cualquiera. Y como `venues_update` exige `auth.uid() = owner_id`, **nadie puede editar esos
tres locales tampoco por API**. Están huérfanos y congelados.

**3. `createVenue` no puede crear un local con dueño.**

```typescript
// VenuesContext.tsx:38
owner_id: venue.ownerId ?? null,
```

`CrearEventoScreen` llama a `createVenue({ name, type: "sala" })` — sin `ownerId`. La policy
`venues_insert` exige `auth.uid() = owner_id`, el insert se rechaza, el `catch {}` se lo traga
y la función devuelve un venue falso con id `venue-<timestamp>`. Ya está documentado en
`CLAUDE.md` como fallo en silencio; acá es además **la razón de que el hecho 2 se perpetúe**:
todo local nuevo nace huérfano.

Los tres hechos se encadenan: sin rol `cafe` nadie entra, y si entrara no tendría local, y si
creara uno nacería sin dueño. **Arreglar la propiedad del local es el prerequisito de todo lo
demás en este spec.**

## Alcance

### 1. Que el local tenga dueño

- `createVenue` pasa a exigir `ownerId`. Su firma deja de aceptar un venue sin dueño:
  `createVenue(venue: Omit<Venue,'id'> & { ownerId: string })`
- El `catch {}` deja de tragarse el error. `createVenue` **lanza**, y quien la llama decide
  qué mostrar. Un local que no se guardó no puede verse como un local guardado
- `CrearEventoScreen` (camino del músico) pasa el `user.id` del músico. Consecuencia
  deliberada: **el músico que inventa un local queda como su dueño**. Es mejor que huérfano —
  hoy ese local no lo puede editar nadie. La transferencia de propiedad al local real es parte
  del punto 5
- **Los tres locales huérfanos** se resuelven en el mismo movimiento, con un `UPDATE` puntual
  en la migración cuando exista un usuario `cafe` a quien asignárselos. Mientras no exista,
  quedan como están y el dashboard muestra el estado vacío del punto 4

### 2. Datos del local

Migración aditiva sobre `venues` — `supabase/migrations/<ts>_spec_031_perfil_local.sql`:

```sql
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS ciudad          text,
  ADD COLUMN IF NOT EXISTS comuna          text,
  ADD COLUMN IF NOT EXISTS aforo           integer,
  ADD COLUMN IF NOT EXISTS telefono        text,
  ADD COLUMN IF NOT EXISTS email_contacto  text,
  ADD COLUMN IF NOT EXISTS instagram       text,
  ADD COLUMN IF NOT EXISTS sitio_web       text,
  ADD COLUMN IF NOT EXISTS horarios        text,
  ADD COLUMN IF NOT EXISTS tiene_escenario boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiene_sonido    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiene_backline  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();

ALTER TABLE public.venues
  ADD CONSTRAINT venues_aforo_check
  CHECK (aforo IS NULL OR aforo BETWEEN 1 AND 100000);
```

| Campo | Tipo | Por qué está |
|---|---|---|
| `name` | text (ya existe) | Nombre del local |
| `type` | text (ya existe) | `cafe` / `bar` / `sala` / `centro_cultural` — taxonomía del spec 018, **no se toca** |
| `address` | text (ya existe) | Dirección. Hoy es el único dato de ubicación y es texto libre |
| `ciudad`, `comuna` | text | `address` guarda `"Av. Italia 890, Ñuñoa"` — la comuna está adentro de la cadena y por eso no se puede filtrar por ella. Un músico busca "locales en Ñuñoa", no una dirección |
| `aforo` | integer | Cuánta gente cabe. **Es el dato que el spec 022 necesita para el control de cupo**: hoy nada impide vender 500 entradas en un local de 40 |
| `description` | text (ya existe) | Descripción del local |
| `estilo` | text (ya existe) | Estilo musical de la programación (`"Jazz/Experimental"`) |
| `horarios` | text | Cuándo hay música. Texto libre a propósito: un jsonb de horarios exige un editor de horarios, y eso es un spec entero para un dato que hoy se lee, no se consulta |
| `tiene_escenario`, `tiene_sonido`, `tiene_backline` | boolean | Las tres preguntas que hace toda banda antes de aceptar una fecha. Contraparte directa de `rider_tecnico` en el spec 030 |
| `telefono`, `email_contacto` | text | Contacto directo. Hoy no hay ninguno |
| `instagram`, `sitio_web` | text | Redes del local. La banda mira el Instagram antes de aceptar |
| `image` | text (ya existe) | **Existe en la tabla y en `Venue`, sin UI que lo escriba.** Igual que en el 030: se acepta URL; subir archivo es un spec de Storage |
| `lat`, `lng` | numeric (ya existen) | Sin UI y sin mapa. Se dejan como están; el mapa es otro spec |
| `rating` | numeric (ya existe) | ⚠️ **Nadie lo escribe.** Los valores actuales (4.0 / 4.5 / 4.3) se cargaron a mano y no salen de ninguna reseña. Mostrarlo como si fuera real es engañoso: **se oculta de la UI** hasta que exista un spec de reseñas |

### 3. Pantalla de edición

`EditarLocalScreen`, nueva en `CafeStack` — el equivalente de `EditarPerfilBandaScreen` en el
030. Es la primera pantalla del proyecto donde se escribe un `venue`.

- Selector de `type` con los cuatro valores del spec 018 y sus emojis (`venueEmoji` ya existe
  en `src/lib/venues.ts`)
- Guardado: `update` si el local existe, `insert` con `owner_id = user.id` si no
- Éxito y error **dicen cosas distintas** — misma corrección que el problema 2 del spec 030

### 4. El dashboard

```
┌─ Mi local ──────────────────────────────┐
│  [imagen]  Nombre        ☕ Café         │
│            Dirección · Comuna            │
│            Aforo 40 · 🎤 sonido ✓        │
│            ● Perfil completo 9/16        │
├─ Resumen ───────────────────────────────┤
│  Eventos publicados: 3                   │
│  Entradas vendidas: 12   ·  $60.000      │
├─ Acciones ──────────────────────────────┤
│  [ + Crear evento ]  ← primario          │
│  [ 📊 Ventas ]  [ ✏️ Editar local ]       │
├─ Próximos eventos ──────────────────────┤
│  (lista con TarjetaEvento)               │
├─ Músicos disponibles ───────────────────┤
│  (de profiles, no de mock)               │
└──────────────────────────────────────────┘
```

- **Botón de crear evento arriba**, no al final. Hoy queda debajo de toda la lista de eventos
- **Estado vacío real**: sin local asociado, el dashboard muestra "Aún no registras tu local" y
  un botón que lleva a `EditarLocalScreen`. Es lo que hoy no existe y lo que deja al rol `cafe`
  sin camino de entrada
- **"Músicos disponibles" deja de leer `musicosMock`** y consulta
  `profiles where role = 'musician'`. Hoy muestra músicos que no existen, y los perfiles reales
  (`QuintalClandesta`, `Da Gota`) no aparecen. Con el 030 aplicado, además muestra ciudad,
  tipo de proyecto e integrantes
- **Ventas del local**: el músico tiene `VentasMusicoScreen` desde el spec 010; el local no
  tiene equivalente. La policy `tickets_select_event_owner` filtra por `events.created_by`, así
  que **el local solo ve las ventas de los eventos que él creó**, no las de un músico que tocó
  en su local. Ampliarla a "dueño del venue" es cambio de RLS y **queda fuera de este spec**:
  se reutiliza `VentasMusicoScreen` tal cual, renombrada a `VentasScreen` y compartida por
  ambos stacks

### 5. Fuera de alcance, anotado

- **Transferencia de propiedad de un local** (el músico lo creó, el local reclama que es suyo).
  Necesita un flujo de verificación — si no, cualquiera reclama cualquier local. Spec propio
- **`profiles.role = 'cafe'` no se renombra a `'local'`.** Ya está decidido en el spec 018:
  exige migrar `auth.users.raw_user_meta_data` de usuarios reales
- **Mapa y geolocalización** (`lat`/`lng` existen y están vacíos)
- **Reseñas y rating real**
- **Subida de imágenes** (Supabase Storage)

## Archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/<ts>_spec_031_perfil_local.sql` | nuevo — columnas + CHECK |
| `src/types/index.ts` | `Venue` gana los campos nuevos |
| `src/context/VenuesContext.tsx` | `ownerId` obligatorio en `createVenue`; el `catch` deja de tragarse el error; `updateVenue` nuevo; `mapVenueToDB`/`FromDB` con los campos nuevos |
| `src/screens/DashboardCafeScreen.tsx` | dashboard completo, estado vacío, músicos reales |
| `src/screens/EditarLocalScreen.tsx` | nuevo — formulario del local |
| `src/navigation/CafeStack.tsx` | rutas `EditarLocal` y `Ventas` |
| `src/screens/CrearEventoScreen.tsx` | pasa `ownerId` a `createVenue`; desde el rol `cafe` preselecciona el local propio |
| `src/screens/CafesScreen.tsx` | la ficha pública muestra los campos nuevos |

## Criterio de cierre

Verificado contra la base, no contra el código:

1. Existe un usuario con `role = 'cafe'` que puede iniciar sesión y ver `CafeStack`
2. Ese usuario crea su local desde `EditarLocalScreen` y
   `select owner_id from venues where id = …` devuelve **su uuid**, no NULL
3. Edita el local y los cambios persisten tras recargar
4. El dashboard muestra su nombre real, no *"Bienvenido, Local"*
5. "Crear evento" desde el local publica un evento con su local preseleccionado, y el evento
   aparece en la cartelera pública
6. La lista de músicos muestra los perfiles reales de `profiles`, no `musicosMock`

## Dependencias

- **`aforo` habilita el spec 022** (control de cupo). No al revés: este spec solo agrega el
  dato, la validación de cupo sigue siendo del 022
- **Solapa con el spec 023** (ciclo de vida de datos): aquel resuelve el borrado y los
  `owner_id` NULL desde la perspectiva de limpieza; éste los resuelve desde la perspectiva de
  producto. **Si el 023 se hace antes, el punto 1 de este spec se reduce.** No hay conflicto:
  ambos empujan `owner_id` a dejar de ser NULL
- **Independiente del 030.** Comparten forma, no código
