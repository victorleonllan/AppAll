# Spec 034 — Editar evento

> Estado: **planificado el 2026-08-10, sin implementar.** Separado del spec 033 a pedido
> de Victor, deliberadamente aislado: no toca la migración ni el modelo de permisos que
> el 033 ya dejó desplegado, solo agrega la pantalla y el flujo de edición.

## Contexto

Tras el spec 033, `event_collaborators` decide quién puede tocar un evento y la policy
`events_update` ya lo permite (`can_edit_event(id)`, cualquier `owner`/`admin`/`editor`).
Pero nada en la app **usa** ese permiso: `CrearEventoScreen` es la única pantalla que
escribe en `events`, y solo sabe insertar. Si el músico se equivoca en la hora o el local
quiere corregir el precio, hoy la única vía es un `UPDATE` a mano por API.

## Por qué va separado del 033

El 033 ya es un spec grande (tabla nueva, funciones `SECURITY DEFINER`, triggers, RLS
reemplazada). Meter la pantalla de edición ahí habría significado revisar dos cosas a la
vez — permisos y formulario — con más superficie para que un bug en una tape al otro.
Separarlos deja cada spec verificable por su cuenta, y si algo sale mal en la edición,
revertir este spec no toca nada de lo que el 033 ya tiene corriendo en producción.

## Por qué es aislado

**No hay migración nueva.** La policy `events_update` del 033 ya autoriza esto:

```sql
-- ya existe, del spec 033 — este spec no la toca
CREATE POLICY events_update ON public.events FOR UPDATE
  USING      (public.can_edit_event(id))
  WITH CHECK (public.can_edit_event(id));
```

Y el trigger `events_guard_protected_columns_trg` (también del 033) ya protege lo que
un editor no debería poder tocar por un `UPDATE` de este formulario: `created_by` es
inmutable, y pasar a `status='cancelled'` exige `can_delete_event()`. Este spec no
necesita agregar ninguna regla nueva — hereda las que ya están.

**Alcance del formulario, acotado a propósito:**

| Campo | Editable |
|---|---|
| `fecha`, `hora`, `genero`, `precio`, `imagen` | ✅ |
| `artista` (texto) | ✅ |
| `venue_id`, `artist_id` | ❌ — ver *Fuera de alcance* |
| `status`, `created_by` | ❌ — bloqueados por trigger, ni se muestran en el form |

Excluir `venue_id` y `artist_id` es lo que mantiene este spec chico. Cambiarlos reabre la
pregunta que el 033 resolvió con `events_claim_owner_trg`: ese trigger solo corre en el
`INSERT`, así que cambiar el artista o el local de un evento ya creado **no** agrega
automáticamente a nadie nuevo al equipo. Meterse ahí es una decisión de producto propia
(¿se re-ejecuta el claim? ¿se avisa al artista/local saliente?) que no vale la pena
resolver solo para poder corregir una fecha.

## Frontend

| Archivo | Cambio |
|---|---|
| `src/context/EventosContext.tsx` | `updateEvento(id, cambios)` — `UPDATE` directo, sin `catch{}` silencioso (mismo criterio que `deleteEvento` tras el 033: el error se propaga) |
| `src/screens/EditarEventoScreen.tsx` (nuevo) | Formulario igual al de `CrearEventoScreen` pero precargado y sin selector de venue/artista |
| `src/screens/DetalleEventoScreen.tsx` | Botón "✏️ Editar" en el panel de gestión, visible si `permisos.puedeEditar` |
| `src/navigation/CarteleraStack.tsx`, `MusicoStack.tsx`, `MiLocalStack.tsx` | Ruta `EditarEvento: { eventoId: string }`, mismo patrón que `EquipoEvento` (registrada en las tres, porque `DetalleEventoScreen` vive en `CarteleraStack`) |

```typescript
// EventosContext.tsx — nueva función, mismo patrón que cancelEvento
const updateEvento = useCallback(async (id: string, cambios: Partial<Pick<Evento,
  'artista' | 'fecha' | 'hora' | 'genero' | 'precio' | 'imagen'
>>) => {
  if (useMock) {
    setEventos((prev) => prev.map((e) => (e.id === id ? { ...e, ...cambios } : e)));
    return;
  }
  const { data, error } = await supabase
    .from('events')
    .update({
      artist_name: cambios.artista,
      fecha: cambios.fecha,
      hora: cambios.hora,
      genero: cambios.genero,
      precio: cambios.precio,
      imagen: cambios.imagen,
      // monto se recalcula si precio cambió — mapEventoToDB ya tiene montoDesdePrecio
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;   // RLS rechaza sin permiso; el mensaje llega tal cual al Alert
  setEventos((prev) => prev.map((e) => (e.id === id ? mapEventoFromDB(data) : e)));
}, [useMock]);
```

El `Partial<Pick<...>>` en la firma es la forma en TypeScript de dejar explícito en el
tipo lo que la tabla de arriba dice en prosa: `venueId` y `artistId` no son parámetros
válidos de esta función. Si más adelante se decide permitirlos, ese es el momento de
diseñar qué pasa con el equipo — no antes.

`EditarEventoScreen` reusa la validación de `CrearEventoScreen` (artista/fecha/hora
obligatorios) y llama a `useEventoPermisos(eventoId).puedeEditar` para no renderizar el
formulario si el usuario no es del equipo — defensa en profundidad: RLS ya lo bloquearía
en el `UPDATE`, esto solo evita mostrar un formulario que va a fallar.

## Dependencias

- **Spec 033** — hard. Sin `event_collaborators` y `can_edit_event()`, este spec no tiene
  contra qué autorizar la edición.
- Nada más. No depende del 028, del 021 ni del 031.

## Criterio de cierre

1. Un `admin` (no `owner`) edita la hora de un evento y el cambio persiste
2. Un usuario sin fila en `event_collaborators` intenta `UPDATE` por API directa y RLS
   lo rechaza
3. Editar no dispara `events_claim_owner_trg` ni cambia el equipo — cambiar la fecha de
   un evento con 3 colaboradores lo deja con los mismos 3 después
4. El formulario no ofrece cambiar venue ni artista vinculado

## Fuera de alcance

- **Cambiar `venue_id` o `artist_id` de un evento ya creado** — necesita decidir qué pasa
  con el equipo existente (spec propio si llega a hacer falta)
- **Historial de cambios** (quién editó qué) — mismo punto que el 033 dejó fuera para el
  equipo; edición hereda el mismo hueco
- **Notificar a compradores de un cambio de hora/lugar** — depende del 028/029, igual que
  el aviso de cancelación del 033
