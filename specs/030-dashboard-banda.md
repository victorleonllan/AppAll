# Spec 030 — Dashboard de banda: perfil completo y panel de gestión

> Estado: **implementado el 2026-08-09**. Migración aplicada a producción
> (`supabase/migrations/20260809034408_spec_030_perfil_banda.sql`, confirmada en
> `supabase migration list`). Falta el cierre de punta a punta: los 5 puntos del
> Criterio de cierre requieren probar la app con un músico real.
>
> ⚠️ Al aplicar apareció una causa raíz que este spec no tenía: la migración baseline
> (`20260608000000`) figuraba como no aplicada en el historial remoto pese a estar
> desplegada, lo que bloqueaba `db push` (`LegacyDbPushMissingRemoteError`). Se resolvió
> con `supabase migration repair --status applied 20260608000000` — solo corrige el
> registro de control, no ejecuta DDL. Es la brecha que el spec 024 ya tenía anotada
> ("la cadena de migraciones nunca se probó de punta a punta"); queda resuelta para
> este push pero el spec 024 sigue pendiente como tal.
> Par del spec 031 (dashboard de local). Se pueden trabajar en cualquier orden.

## Contexto

La pantalla del músico (`PerfilMusicoScreen`, spec 004) es un formulario de seis campos con
una lista de eventos abajo. Nunca creció desde junio. Hoy no alcanza para lo que el producto
promete: un local que entra a Sonópolis a contratar una banda **no tiene con qué decidir**.

Estado verificado en producción el 2026-08-08 (`select … from profiles`):

| id (corto) | role | nombre | tipo_proyecto | bio | redes |
|---|---|---|---|---|---|
| 65766e7e | musician | QuintalClandesta | NULL | — | ninguna |
| 3e8bbba0 | musician | Da Gota | NULL | — | ninguna |
| c38ca1d6 | public | victor.leon.llanten | NULL | — | ninguna |
| 0df21e3d | public | (vacío) | NULL | — | ninguna |

**Los dos perfiles de músico están vacíos salvo el nombre.** No es que falten datos por
cargar: `tipo_proyecto` es NULL en las cuatro filas, lo que significa que el formulario de
perfil **nunca se guardó con éxito ni una vez** desde que existe. Ver problema 2.

## Los tres problemas

### 1. Faltan los datos con los que se contrata a una banda

Hoy se piden seis: `nombre`, `género` (que en realidad guarda `tipo_proyecto`), `bio`,
`instagram`, `spotify`, `youtube`. Con eso no se puede responder ninguna de las preguntas
que hace un local antes de agendar: ¿cuántos suben al escenario?, ¿de qué ciudad son?,
¿cuánto dura el show?, ¿qué necesitan de sonido?, ¿a quién le escribo?

### 2. El error se disfraza de éxito

```typescript
// PerfilMusicoScreen.tsx:89-92
Alert.alert('Guardado', 'Perfil actualizado en Supabase');
} catch {
  Alert.alert('Guardado', 'Tus cambios se han guardado (mock)');
}
```

Las **dos** ramas dicen "Guardado". Si el `upsert` falla por RLS, por red o por un campo
inexistente, el músico ve un mensaje de éxito y sus datos no existen en ninguna parte —
"(mock)" no significa nada para quien usa la app. Es el mismo patrón que `createVenue`
(un `catch` vacío convirtiendo un error en éxito aparente) que `CLAUDE.md` ya señala como
causa raíz recurrente del proyecto.

**Esto explica la tabla de arriba**: los perfiles están vacíos porque los guardados fallaron
en silencio, no porque nadie los haya llenado.

### 3. El músico sin perfil queda en una pantalla muerta

```typescript
if (!perfil) return <Text>No se encontró un perfil de músico asociado a esta cuenta.</Text>;
```

`perfil` solo se llena si la consulta a `profiles` devuelve fila **o** si el usuario existe en
`musicosMock`. Un músico nuevo cuyo `SELECT` falle cae acá y **no tiene ningún camino de
salida**: no hay botón de crear perfil, no hay reintento. El trigger `handle_new_user` crea la
fila al registrarse, así que en el camino feliz no ocurre — pero cualquier fallo de red deja
la cuenta inutilizable hasta reabrir la app.

## Modelo de datos

### Decisión: extender `profiles`, no crear una tabla `bands`

Un usuario = un proyecto musical. Es falso en general —Victor mismo toca en varios proyectos—
pero **una tabla `bands` con relación N:1 obliga a un selector de proyecto activo en toda la
app**: los eventos dejarían de colgar de `created_by` y pasarían a colgar de un `band_id`, lo
que toca `events`, `tickets`, el dashboard de ventas y la cartelera.

Eso es un rediseño del modelo, no un dashboard. Con el Demo Day el 23-sep-2026 y el flujo de
compra todavía sin cerrar (spec 021), extender `profiles` da el 90 % del valor con una
migración aditiva y cero riesgo sobre lo que ya funciona.

**Multi-proyecto queda anotado como spec futuro**, no descartado. La señal para hacerlo es un
músico real pidiendo publicar con dos nombres distintos.

### Migración — `supabase/migrations/<ts>_spec_030_perfil_banda.sql`

Toda aditiva: columnas nuevas nullable. Ninguna fila existente se invalida.

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ciudad          text,
  ADD COLUMN IF NOT EXISTS generos         text[],
  ADD COLUMN IF NOT EXISTS integrantes     integer,
  ADD COLUMN IF NOT EXISTS duracion_show   integer,
  ADD COLUMN IF NOT EXISTS telefono        text,
  ADD COLUMN IF NOT EXISTS email_contacto  text,
  ADD COLUMN IF NOT EXISTS sitio_web       text,
  ADD COLUMN IF NOT EXISTS tiktok          text,
  ADD COLUMN IF NOT EXISTS rider_tecnico   text,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();

-- tipo_proyecto pasa de texto libre a vocabulario cerrado.
-- Seguro hoy: las 4 filas lo tienen NULL, y un CHECK admite NULL.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tipo_proyecto_check
  CHECK (tipo_proyecto IS NULL
         OR tipo_proyecto IN ('solista','duo','banda','dj','colectivo'));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_integrantes_check
  CHECK (integrantes IS NULL OR integrantes BETWEEN 1 AND 50);
```

⚠️ Escribir el `.sql` **antes** de aplicarlo (`CLAUDE.md`). `apply_migration` del MCP no crea
el archivo: usarlo primero desincroniza el repo de la base en silencio.

### Campos

| Campo | Tipo | Por qué está |
|---|---|---|
| `nombre` | text (ya existe) | Nombre de la banda o del proyecto, no el nombre legal de la persona |
| `tipo_proyecto` | text + CHECK | `solista` / `duo` / `banda` / `dj` / `colectivo`. Hoy es texto libre y el label de la UI dice **"Género"**, que es otra cosa — ver abajo |
| `generos` | text[] | Géneros musicales: `{jazz, bossa, fusión}`. Arreglo y no texto porque ningún proyecto real es de un solo género, y un filtro de cartelera necesita valores buscables, no la cadena `"Jazz fusión / bossa"` |
| `bio` | text (ya existe) | Descripción del proyecto |
| `ciudad` | text | Dónde tocan. Un local de Ñuñoa no contrata a una banda de Concepción para un martes |
| `integrantes` | integer | Cuántos suben al escenario. Es la primera pregunta del local: define si caben y cuántos micrófonos hacen falta |
| `duracion_show` | integer (minutos) | Define si la banda llena una noche o si el local necesita dos actos |
| `rider_tecnico` | text | Qué necesita de sonido/backline. Sin esto la conversación se va a WhatsApp y Sonópolis deja de ser el canal |
| `telefono`, `email_contacto` | text | Contacto directo. Hoy el único canal es Instagram |
| `instagram`, `spotify`, `youtube`, `tiktok`, `sitio_web` | text | Redes. `tiktok` y `sitio_web` son nuevos |
| `foto` | text (ya existe) | **Existe en la tabla y en `PerfilMusico`, pero no hay UI que lo escriba.** Ver alcance |
| `updated_at` | timestamptz | Perfil desactualizado = perfil que no se muestra bien en cartelera |

### El bug de nomenclatura que se cierra acá

`PerfilMusicoScreen` muestra el label **"Género"** sobre un input cuyo estado se llama `genero`
y que se persiste en la columna `tipo_proyecto`. Son tres nombres para un campo, y el label
describe un concepto distinto del que guarda.

El spec 019 fijó la convención (`tipo_proyecto` en DB / `tipoProyecto` en TS / `genero` en el
estado del formulario). Este spec la completa por el lado de la UI:

- El label pasa a decir **"Tipo de proyecto"** y el control pasa a ser un selector de los cinco
  valores, no un input libre
- El estado local se renombra `genero` → `tipoProyecto`, y `genero` deja de existir en esta
  pantalla. La excepción del spec 019 existía porque no había otro campo que se llamara así;
  con `generos` en escena, mantenerla garantiza el próximo bug
- **Los géneros musicales pasan a `generos`**, que es lo que el label decía y el código no hacía

## Alcance de la UI

`PerfilMusicoScreen` se reorganiza en tres tarjetas. Deja de ser un formulario suelto y pasa a
ser un panel:

```
┌─ Mi banda ──────────────────────────────┐
│  [foto]  Nombre                          │
│          Tipo de proyecto · Ciudad       │
│          ● Perfil completo 8/12          │
├─ Resumen ───────────────────────────────┤
│  Eventos publicados: 3                   │
│  Entradas vendidas: 12   ·  $60.000      │
├─ Acciones ──────────────────────────────┤
│  [ + Crear evento ]  ← primario          │
│  [ 📊 Mis ventas ]   [ ✏️ Editar perfil ] │
├─ Mis eventos ───────────────────────────┤
│  (lista con TarjetaEvento)               │
└──────────────────────────────────────────┘
```

1. **El formulario se separa a `EditarPerfilBandaScreen`.** Doce campos no caben arriba de la
   lista de eventos, y hoy el músico tiene que hacer scroll por todo el formulario para llegar
   a sus propias fechas. El dashboard muestra el resumen; la edición es una pantalla aparte del
   `MusicoStack`.

2. **El botón de crear evento sube a la zona de acciones**, antes de la lista. Hoy está al
   final: con tres eventos ya queda fuera de pantalla. Es la acción principal del rol y tiene
   que ser lo primero que se ve.

3. **Indicador de completitud del perfil** (`n/12`). Un perfil vacío es invisible para los
   locales, y hoy nada se lo dice al músico. Es también la señal de que el guardado funcionó —
   el antídoto directo al problema 2.

4. **Foto**: se muestra si existe. **Subirla queda fuera de este spec** — exige Supabase
   Storage, un bucket con policies y manejo de imágenes en web y nativo. Es un spec propio.
   Acá se acepta una **URL** en el formulario, que es lo que ya soporta la columna `text`.

5. **Estados que hoy no existen**:
   - Guardado que falla → mensaje de error **con el mensaje real de Supabase**, no "(mock)".
     Éxito y error dejan de decir lo mismo
   - Perfil ausente → botón "Crear mi perfil" que hace el `upsert` con `role: 'musician'`, en
     vez de la pantalla muerta del problema 3
   - Datos viniendo de mock → aviso visible. Hoy el fallback es indistinguible de los datos
     reales, que es la trampa que `CLAUDE.md` marca como la que más confunde del proyecto

## Archivos

| Archivo | Cambio |
|---|---|
| `supabase/migrations/<ts>_spec_030_perfil_banda.sql` | nuevo — columnas + CHECKs |
| `src/types/index.ts` | `PerfilMusico` gana los campos nuevos; `TipoProyecto` como union type |
| `src/screens/PerfilMusicoScreen.tsx` | pasa de formulario a dashboard; resumen y acciones |
| `src/screens/EditarPerfilBandaScreen.tsx` | nuevo — el formulario completo |
| `src/navigation/MusicoStack.tsx` | ruta `EditarPerfilBanda` |
| `src/screens/VerMusicoScreen.tsx` | muestra los campos nuevos (es la vista que abre el local) |

⚠️ **No hay mapper para `profiles`.** `EventosContext` y `VenuesContext` centralizan el mapeo
snake_case ↔ camelCase, pero `PerfilMusicoScreen` lo hace inline, campo por campo, en dos
lugares (carga y guardado). Con 12 campos eso se vuelve el próximo bug de "agregué el campo en
un lado y no en el otro". **Extraer `mapProfileFromDB` / `mapProfileToDB` a
`src/lib/profiles.ts` es parte de este spec**, no una mejora opcional.

## Criterio de cierre

No se cierra por código escrito. Se cierra cuando, **verificado contra la base**:

1. Un músico llena los 12 campos, guarda, y `select * from profiles where id = …` los devuelve
2. Recargar la app los muestra (no quedaron en memoria)
3. Un guardado forzado a fallar muestra **error**, no "Guardado"
4. El local ve esos datos en `VerMusicoScreen`
5. "Crear evento" desde el dashboard publica un evento que aparece en la cartelera

## Dependencias

- **Ninguna dura.** Es aditivo y no toca el flujo de compra
- Conviene **después del 021**, no porque lo necesite, sino porque el 021 es el camino crítico
  y este spec toca `MusicoStack`, que el 021 no toca — hacerlos en paralelo es seguro, pero
  sumar diff antes de cerrar la compra alarga la verificación
