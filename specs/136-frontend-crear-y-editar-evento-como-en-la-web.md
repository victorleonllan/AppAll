# Spec 136 — Crear y editar un evento con todo lo que pide la web

> Estado: aplicado (17-oct-2026) — `npx tsc --noEmit` limpio fuera de `supabase/functions` (criterio 1), `npx expo export --platform web` sin error (criterio 10). Flyer con `CampoImagen` (spec 130) en `pendientes/<user.id>` al crear y `eventos/<id>` al editar: el 129 sí deja elegir carpeta. Editar manda `precio` solo si cambió, para no recalcular `monto` (criterio 9). **Pendiente:** criterios 2-9 contra la base y V-candidatas 136-a/136-b en teléfono
> Capa: FRONTEND. `src/screens/CrearEventoScreen.tsx`, `src/screens/EditarEventoScreen.tsx`, `src/components/ArtistaSelector.tsx` (nuevo), `src/components/PreventasEvento.tsx` (nuevo), `src/components/DatosPagoEvento.tsx` (nuevo).
> Depende de: spec 095, spec 129, spec 133, spec 135
> Alimenta: spec 137
> Hermano en la web: `components/FormEvento.js`, `components/ArtistaSelect.js`, `components/PreventasManager.js` (W-007, W-045, W-046, W-082, W-112–116, W-208, W-240).

> **En una frase:** el formulario de la app pasa a pedir lo mismo que el de la web —artista
> de la tabla `artists` (o creado ahí mismo), local nuevo con tipo y dirección, fecha
> exacta, descripción, precio general o de puerta con preventas, flyer y datos bancarios—,
> y editar un evento permite corregir todo eso.

## Contexto

Hoy `CrearEventoScreen` pide artista, local, fecha y hora como texto libre («Sáb 28 Jun»),
género y precio (`CrearEventoScreen.tsx:160-280`). Le falta lo que la web pide en
`FormEvento.js:98-680`, y tiene tres problemas propios:

1. Vincular un artista falla por FK: manda un id de `profiles` como `artist_id`, que apunta
   a `artists` desde el spec 061 (detalle en el spec 135, Contexto).
2. Si no se eligió local, crea uno llamado `"Sin nombre"` sin avisar
   (`CrearEventoScreen.tsx:129-131`), y el local al vuelo nace sin tipo real ni dirección
   (`:106-110`, tipo fijo `'sala'`).
3. La fecha es texto libre, así que `comienza_at` (el dato con el que cierran las preventas
   y se habilita el cobro) no se puede derivar.

`EditarEventoScreen` solo corrige artista (texto), fecha, hora, género y precio
(`EditarEventoScreen.tsx:31-37`).

## Diseño

La lógica la deja el spec 135. Esta capa solo arma pantallas y llama a esas funciones. Los
errores se muestran en un `Text` rojo (`colors.danger`) sobre el botón, no solo con
`Alert.alert`: en el build web de Expo `Alert.alert` no hace nada (`src/lib/confirm.ts:11-15`).
El aviso de éxito puede seguir siendo `Alert.alert`.

### 1. `src/components/ArtistaSelector.tsx` (nuevo)

Equivale a `ArtistaSelect.js`. Props: `{ userId: string; value: ArtistaBreve | null; onChange: (a: ArtistaBreve | null) => void }`.

- `TextInput` que busca con `buscarArtistas` (spec 135) 300 ms después de la última tecla,
  solo sin selección.
- Lista de resultados; tocar uno lo elige.
- Si lo escrito tiene 2 o más caracteres y ningún resultado coincide exacto (sin distinguir
  mayúsculas), una fila «+ Crear "<texto>" como artista nuevo». Debajo, un enlace «Agregar
  contacto (opcional)» que muestra dos campos: contacto e Instagram. Crear llama
  `crearArtista` y lo deja elegido.
- Con selección: el nombre fijo y un botón «Cambiar» que vuelve a `null`.

### 2. `CrearEventoScreen.tsx`

Orden de los campos, de arriba abajo:

1. **Artista \*** — `ArtistaSelector`. Reemplaza el buscador de `search_collaborator_candidates`
   (`:44-76`, `:165-190`). Texto de ayuda: «Si el artista tiene cuenta en Sonópolis y ya
   reclamó su perfil, entra al equipo del evento».
2. **Local \*** — el buscador actual. «+ Agregar "<texto>" como nuevo local» ya no crea el
   local al tocarlo: abre un subformulario con nombre (precargado), tipo (cuatro chips con
   `venueLabel`/`venueEmoji` de `src/lib/venues.ts`), dirección \*, país (el selector del
   spec 095), comuna, teléfono e Instagram (opcionales), y «Cancelar, elegir de la lista».
   Se elimina el camino de `"Sin nombre"`: sin local elegido ni subformulario completo, el
   error es «Elige un local o crea uno nuevo».
3. **Fecha \*** y **Hora \*** — dos `TextInput` con placeholder `2026-11-28` y `21:00`. Se
   validan con `fechaHoraValidas` (spec 135). Error: «La fecha va como AAAA-MM-DD y la hora
   como HH:MM».
4. **Género** — sin cambios.
5. **Descripción** — `TextInput` multilínea, `maxLength={900}`, placeholder «De qué va el
   show, qué esperar, quién toca...», contador «N caracteres disponibles» (W-165).
6. **Precio \*** y **tipo** — el texto de precio, más dos chips «General» / «Puerta». Si
   `montoDesdePrecio(precio) <= 0`, aviso «Sin un número en el precio, el evento no se
   puede comprar».
7. **Preventas** — solo con «Puerta»: `PreventasEvento` en modo `borrador` (§4).
8. **Flyer** — el selector de imagen del spec 129 (lee su spec: define nombre y firma). Al
   crear sube a `pendientes/<user.id>/…`, la única carpeta que la policy
   `media_insert_pendientes` deja escribir antes de que el evento exista (spec 062). Muestra
   la vista previa y «Quitar flyer». Si la función del 129 no deja elegir la carpeta, es un
   bug del 129: se reporta, no se resuelve acá.
9. **Datos para el pago \*** — `DatosPagoEvento` (§5), obligatorio al crear.

Al publicar, en este orden (el mismo de `FormEvento.js:194-322`):

1. Validar todo lo anterior, incluido `datosPagoCompletos`.
2. Si hay subformulario de local: `createVenue({ name, type, pais, telefono, instagram, ownerId: user.id })`
   y después crear su dirección con la función del spec 133. No se pasa `address` a
   `createVenue`: la dirección entra por `venue_addresses`, y el trigger de W-062 escribe
   `venues.address`.
3. `armarFechaHora(fechaISO, horaISO)` → `fecha`, `hora`, `comienzaAt`.
4. `createEvento({ artista: artista.nombre, artistId: artista.id, venueId, venueName, pais: venue.pais, fecha, hora, comienzaAt, genero, descripcion, precio, tipoPrecio, imagen, createdBy })`.
5. `guardarDatosPago(creado.id, datos)`: después del evento, porque `event_payouts_insert`
   exige `event_role_of = 'owner'`, que recién existe cuando corrió `events_claim_owner_trg`.
6. Con «Puerta» y borradores: `crearPreventasDeBorrador(creado.id, borradores)`.

Si falla el paso 4 o antes, no se creó nada del evento: error y el formulario sigue lleno.
Si falla el 5 o el 6, el evento **ya existe**: el error dice «El evento se publicó, pero no
se guardaron <los datos bancarios | las preventas>: <mensaje>. Complétalo desde Editar.»,
y el aviso de éxito ofrece «Editar evento» además de «Ver entradas».

### 3. `EditarEventoScreen.tsx`

Precarga desde `evento` y, para el banco, `getPayout(evento.id)` al montar.

- Artista: sigue siendo texto (spec 034: `artistId` y `venueId` no se cambian al editar).
- Fecha y hora: `separarFechaHora(evento.comienzaAt)`. Si `comienzaAt` es `null` (eventos
  viejos), los campos quedan vacíos con la ayuda «Este evento no tiene fecha exacta:
  complétala».
- País: el selector del spec 095 con «Dónde ocurre el evento — decide en qué cartelera
  aparece» (W-114, Decisión 5). `events.pais` es una copia, y sin esto un evento mal
  marcado no se corrige nunca.
- Descripción, precio y tipo como al crear. Con «Puerta», `PreventasEvento` en modo
  `enVivo`.
- Flyer: sube a `eventos/<evento.id>/…` (ahí la policy exige `can_edit_event`, que ya
  existe).
- Datos para el pago: solo si `useEventoPermisos(evento.id).esOwner` (la RLS de
  `event_payouts` es solo del owner). Opcionales al editar: vacíos no se guardan; a medias
  dan el error «Completa todos los datos para el pago, o déjalos todos vacíos».

Guardar: `updateEvento(id, { artista, fecha, hora, comienzaAt, genero, descripcion, precio, tipoPrecio, imagen, pais })`
y, si `datosPagoCompletos`, `guardarDatosPago`. Se mantiene el aviso «El local y el artista
vinculado no se pueden cambiar desde acá.».

### 4. `src/components/PreventasEvento.tsx` (nuevo)

Props: `{ modo: 'borrador'; value: BorradorPreventa[]; onChange: (v: BorradorPreventa[]) => void } | { modo: 'enVivo'; eventoId: string }`.
En `enVivo` usa `usePreventas(eventoId)`.

Fila para agregar: precio, cupo (numérico, obligatorio, `> 0`) y cierre con dos chips:
«Horas antes del show» (número, viene en 3 con la etiqueta «Recomendado»; si se cambia, la
etiqueta pasa a ser el botón «Volver al recomendado») y «Fecha exacta» (`AAAA-MM-DD HH:MM`).
El botón dice **«✓ Confirmar preventa»** con fondo `colors.accent`: W-240 lo cambió en la
web porque una persona real dejó preventas escritas sin confirmar y no se guardaron. Sin
cupo: «Falta el cupo de la preventa — toda preventa necesita un límite».

Lista: «Preventa N · <precio> · cupo C» y, en `enVivo`, «vendidas V», «cierra <fecha corta>»
(`cierraAt`) y «(cerrada)» si `activa` es `false`.

- `borrador`: «Quitar» saca la fila del arreglo. El nombre «Preventa N» se muestra por
  posición; el definitivo lo pone el 135 al insertar.
- `enVivo`: precio y cupo editables mientras `activa`, guardados al terminar de escribir
  (`onEndEditing`); «Cerrar» pide `confirmar` con «¿Cerrar "Preventa N"? Deja de venderse
  aunque le quede cupo — no se puede reabrir desde acá.».

### 5. `src/components/DatosPagoEvento.tsx` (nuevo)

Controlado: `{ value: DatosPago; onChange; obligatorio: boolean }`. Texto de cabecera:
«Acá te transferimos lo recaudado después del show. El público paga un 10% sobre tu precio,
que se queda Sonópolis: tú recibes íntegro el precio que pusiste arriba.». Campos: banco
(placeholder «Banco de Chile»), tipo de cuenta (chips de `TIPOS_CUENTA`, por defecto
«corriente»), número de cuenta, titular, RUT (placeholder «12.345.678-9») y correo de
contacto (opcional). Con `obligatorio`, el asterisco en los cuatro primeros.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. Crear un evento eligiendo un artista existente de `artists` no da `23503`, y la fila
   tiene `artist_id` = ese id.
3. Crear un artista y un local nuevos desde el formulario deja una fila en `artists`
   (`created_by` = quien publica), una en `venues` con el tipo y el país elegidos, y una en
   `venue_addresses` activa.
4. Sin local elegido, publicar muestra «Elige un local o crea uno nuevo» y no inserta nada
   (ninguna fila `"Sin nombre"`).
5. Fecha `2026-11-28` y hora `21:00` dejan `fecha = '28 de noviembre'`, `hora = '21:00'` y
   `comienza_at` no nulo. Fecha `28/11` muestra el error de formato.
6. Con «Puerta» y dos preventas confirmadas, el evento queda con `tipo_precio = 'puerta'` y
   dos filas en `event_preventas`.
7. Al crear, faltando el RUT, no se publica y se muestra el error. Al editar, banco vacío
   guarda igual; banco a medias muestra «Completa todos los datos para el pago, o déjalos
   todos vacíos».
8. Un colaborador `editor` no ve el bloque de datos bancarios en Editar.
9. Editar la descripción y el país de un evento los guarda; editar solo la hora no cambia
   `monto`.
10. `npx expo export --platform web` termina sin error.

## Fuera de alcance

- Cancelar, borrar y ocultar: spec 137.
- El aviso por país «Todavía no vendemos entradas en <país>» (`paises_cobro`, W-168).
- Un selector nativo de fecha y hora (dependencia nueva). Los campos de texto con formato
  ISO bastan para derivar `comienza_at`.
- Cambiar el local o el artista de un evento ya creado (spec 034).
- Datos bancarios fuera de Chile: el formulario pide RUT y tipos de cuenta chilenos, igual
  que la web hoy.

## Verificación manual

- **V-candidata 136-a:** en un teléfono, crear un evento completo (artista nuevo, local
  nuevo, puerta con dos preventas, flyer, banco) y abrirlo en `sonopolis.org/cartelera/<id>`
  para comparar con lo que muestra la web. Borrarlo al terminar.
- **V-candidata 136-b:** editar ese evento desde la app, cerrar una preventa, cambiar el
  flyer, y confirmar en la web.
