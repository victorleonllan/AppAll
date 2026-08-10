# Spec 033 — Propiedad y colaboradores de evento: quién reclama, quién edita, quién borra

> Estado: **implementado el 2026-08-10, sin desplegar.** Migración escrita en
> `supabase/migrations/20260810080442_spec_033_propiedad_colaboradores_evento.sql` y
> código de frontend aplicado (tipos, `EventosContext`, `useEventoPermisos`,
> `EquipoEventoScreen`, botones de gestión en `DetalleEventoScreen`, selector de
> artista en `CrearEventoScreen`). `tsc --noEmit` limpio salvo los errores preexistentes
> de las Edge Functions Deno (no tocadas por este spec).
>
> ⚠️ **La migración NO se aplicó a producción.** Es un cambio de esquema grande (tabla
> nueva, 6 funciones `SECURITY DEFINER`, 3 triggers, políticas RLS reemplazadas) y hoy
> no hay entorno local para probarlo primero (spec 024 sigue pendiente). Aplicarla
> exige `supabase db push` contra la única base que existe — producción — y requiere
> confirmación explícita de Victor en el momento, no autorización heredada de esta sesión.
> Hasta entonces, el código nuevo se degrada solo: `EventosContext` cae a "sin
> colaboradores" y `useEventoPermisos` cae al modelo viejo (`created_by`), igual que ya
> hace con `useMock` para `events`.
>
> Toca el mismo terreno que el spec 023 (borrado y rol admin) pero con otro alcance:
> el **023 manda sobre usuarios y locales**, este manda sobre **eventos**. No se pisan.

## Criterio de cierre real (falta todo esto)

1. `supabase db push` aplicado a producción — con confirmación explícita de Victor
2. Los 9 puntos del *Criterio de cierre* original (más abajo), verificados contra la base
3. Falta "Editar" como botón funcional en `DetalleEventoScreen` — hoy el panel de
   gestión tiene Equipo/Cancelar/Borrar porque no existe ninguna pantalla de edición
   de evento en la app (`CrearEventoScreen` es solo de alta). Construir un editor es
   trabajo aparte, no bloquea lo demás: cualquier colaborador ya puede seguir editando
   por API/RLS aunque la UI no lo exponga todavía.

## Contexto

Hoy la propiedad de un evento es una sola columna:

```sql
-- baseline 20260608000000
created_by uuid NOT NULL REFERENCES auth.users(id)

CREATE POLICY events_update ON public.events FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY events_delete ON public.events FOR DELETE USING (auth.uid() = created_by);
```

De ahí salen tres consecuencias que el producto ya no aguanta:

1. **El evento es de una sola persona, para siempre.** Un músico y un local que organizan
   el mismo show no pueden coordinarlo dentro de la app: quien lo creó primero es el único
   que puede tocarlo. El otro ni siquiera lo ve en su panel.
2. **El dueño del local no tiene voz sobre un show en su propia casa.** Si un músico crea
   el evento, `created_by` es del músico y el local se entera por la cartelera pública,
   sin poder corregir un horario ni un precio equivocado.
3. **Borrar es la única forma de deshacer, y destruye ventas en silencio.** `tickets` cuelga
   de `events` con `ON DELETE CASCADE`: un `DELETE` sobre un evento con entradas vendidas
   las borra sin aviso. Es el mismo peligro que `PENDIENTES.md` ya anota para `venues`,
   pero un escalón más cerca del dinero.

No hay estado en el evento: no existe "cancelado" ni "borrador". Un evento existe o no existe.

## Decisiones tomadas

| Pregunta | Decisión |
|---|---|
| ¿El dueño del local controla eventos creados por un músico en su local? | **Sí, co-admin automático.** Entra como `admin` al crearse el evento: puede editar, no puede borrar ni cancelar. |
| ¿El artista del evento se vincula a un perfil real? | **Sí**, `events.artist_id` como FK opcional a `profiles`. `artist_name` se conserva para artistas sin cuenta. |

Ambas son simétricas: **quien pone el lugar y quien pone la música entran al equipo del
evento sin pedir permiso; quien lo creó conserva el poder de destruirlo.**

## El modelo

### Creador ≠ dueño

`events.created_by` se queda **como hecho histórico inmutable**: quién apretó "Publicar".
No vuelve a usarse para autorizar nada. El dueño actual es un **rol**, vive en la tabla
nueva y es transferible. Separarlos es lo que permite que el creador se vaya del proyecto
sin dejar el evento sin gobierno, y que la auditoría siga sabiendo quién lo originó.

### `event_collaborators`

```sql
CREATE TABLE public.event_collaborators (
  event_id    uuid        NOT NULL REFERENCES public.events(id)  ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  role        text        NOT NULL,
  can_delete  boolean     NOT NULL DEFAULT false,
  source      text        NOT NULL DEFAULT 'invited',
  invited_by  uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id),
  CONSTRAINT event_collaborators_role_check
    CHECK (role IN ('owner','admin','editor')),
  CONSTRAINT event_collaborators_source_check
    CHECK (source IN ('claim','venue_owner','artist','invited','backfill')),
  -- El owner nunca puede quedar sin permiso de borrado: es la definición del rol.
  CONSTRAINT event_collaborators_owner_can_delete
    CHECK (role <> 'owner' OR can_delete)
);

-- Un solo owner por evento. Índice único PARCIAL: es lo que hace que "reclamar" sea
-- una operación con resultado único y no una carrera entre dos inserts.
CREATE UNIQUE INDEX event_collaborators_one_owner
  ON public.event_collaborators (event_id) WHERE role = 'owner';

-- Para "mis eventos": el panel del músico y del local filtran por user_id.
CREATE INDEX event_collaborators_user_idx ON public.event_collaborators (user_id);
```

`source` no es decorativo: distingue al que reclamó de los que entraron solos. La UI lo usa
para explicar por qué alguien está en la lista ("dueño del local") en vez de mostrar un
nombre sin contexto.

⚠️ **Las dos FKs nacen con `ON DELETE CASCADE`, a propósito.** Las cuatro FKs contra
`auth.users` del baseline usan `NO ACTION` y son lo que hoy impide borrar un usuario
(spec 023). Esta tabla no suma un quinto bloqueo. El costo: si se borra al owner, el
evento queda sin dueño. Es el argumento de fondo del 023 a favor de **soft delete**;
mientras tanto, la consulta de eventos huérfanos queda en el Criterio de cierre.

### `events`: estado y artista

```sql
ALTER TABLE public.events
  ADD COLUMN status        text NOT NULL DEFAULT 'published',
  ADD COLUMN cancelled_at  timestamptz,
  ADD COLUMN cancel_reason text,
  ADD COLUMN artist_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT events_status_check CHECK (status IN ('draft','published','cancelled'));
```

`DEFAULT 'published'` es lo que hace la migración segura: el único evento sembrado
(`b3f2760c`) y todo lo que exista al aplicarla siguen apareciendo en la cartelera sin
backfill de estado.

`artist_id` es **opcional y no reemplaza a `artist_name`**: un local puede anunciar a un
artista que todavía no tiene cuenta en Sonópolis. Cuando sí la tiene, `artist_id` es lo que
permite que ese músico entre al equipo automáticamente y vea el evento en su panel.

### Quién puede qué

| Acción | owner | admin | editor |
|---|---|---|---|
| Ver el evento aunque sea `draft` | ✅ | ✅ | ✅ |
| Editar fecha, hora, precio, descripción | ✅ | ✅ | ✅ |
| Invitar y quitar colaboradores | ✅ | ✅ | ❌ |
| Otorgar `can_delete` a otro | ✅ | ❌ | ❌ |
| Cancelar el evento | ✅ | solo con `can_delete` | ❌ |
| Borrar el evento | ✅ ⚠️ | solo con `can_delete` ⚠️ | ❌ |
| Transferir la propiedad | ✅ | ❌ | ❌ |
| Quitar al owner del equipo | ❌ nadie | ❌ | ❌ |

⚠️ El borrado además está sujeto a la regla de tickets (más abajo). Ser owner no alcanza.

**`can_delete` cubre cancelar y borrar como un solo permiso**, y solo el owner lo otorga.
Un admin con `can_delete` no puede pasárselo a un tercero: si pudiera, el permiso se
propagaría solo y el owner perdería el control que justifica el rol.

## Autorización: funciones antes que policies

Las policies de `event_collaborators` necesitan consultar `event_collaborators` ("puedes ver
al equipo si eres del equipo"). Escrito directo en la policy, eso es **recursión infinita**:
Postgres evalúa la policy de la tabla para resolver la subconsulta contra la misma tabla.
La salida estándar es una función `SECURITY DEFINER`, que corre con los privilegios del
dueño y por lo tanto **no dispara RLS**.

```sql
CREATE OR REPLACE FUNCTION public.event_role_of(p_event uuid, p_user uuid DEFAULT auth.uid())
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.event_collaborators
   WHERE event_id = p_event AND user_id = p_user;
$$;

-- Cualquier miembro del equipo edita.
CREATE OR REPLACE FUNCTION public.can_edit_event(p_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.event_role_of(p_event) IS NOT NULL;
$$;

-- owner y admin gestionan el equipo.
CREATE OR REPLACE FUNCTION public.can_manage_team(p_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.event_role_of(p_event) IN ('owner','admin');
$$;

-- El owner siempre; los demás solo con el permiso explícito.
CREATE OR REPLACE FUNCTION public.can_delete_event(p_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_collaborators
     WHERE event_id = p_event AND user_id = auth.uid()
       AND (role = 'owner' OR can_delete)
  );
$$;
```

`SET search_path = public` en las cuatro no es adorno: sin él, una función `SECURITY DEFINER`
resuelve nombres contra el `search_path` de quien la llama y se vuelve un vector de escalada.

⚠️ **`SECURITY DEFINER` es exactamente la clase de objeto que causó el agujero del spec 020.**
Estas cuatro solo devuelven booleanos sobre el `auth.uid()` de quien llama y no aceptan un
`p_user` arbitrario salvo `event_role_of` (que es de lectura). Ninguna escribe.

### Policies

```sql
-- events ------------------------------------------------------------------
-- Los borradores solo los ve el equipo. Cancelados y publicados siguen públicos:
-- quien compró una entrada tiene que poder ver que el show se canceló.
DROP POLICY IF EXISTS events_select ON public.events;
CREATE POLICY events_select ON public.events FOR SELECT
  USING (status <> 'draft' OR public.can_edit_event(id));

DROP POLICY IF EXISTS events_update ON public.events;
CREATE POLICY events_update ON public.events FOR UPDATE
  USING      (public.can_edit_event(id))
  WITH CHECK (public.can_edit_event(id));   -- explícito: la lección del spec 020

DROP POLICY IF EXISTS events_delete ON public.events;
CREATE POLICY events_delete ON public.events FOR DELETE
  USING (public.can_delete_event(id));

-- events_insert NO cambia: sigue exigiendo auth.uid() = created_by.
-- El reclamo del rol owner ocurre después, en el trigger de alta.
```

RLS decide **si** se puede escribir la fila, nunca **qué columnas** cambiaron: no ve `OLD`.
Dos reglas quedan entonces en trigger, no en policy:

- `created_by` es inmutable — un editor no puede reescribir la historia del evento.
- Pasar `status` a `'cancelled'` exige `can_delete_event(id)`, no solo `can_edit_event(id)`.
  Sin esto, cualquier editor cancela el show por la puerta de atrás de un `UPDATE`.

```sql
-- event_collaborators -----------------------------------------------------
ALTER TABLE public.event_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY ec_select ON public.event_collaborators FOR SELECT
  USING (public.can_edit_event(event_id));

-- Un admin invita, pero no puede repartir can_delete: eso es del owner.
CREATE POLICY ec_insert ON public.event_collaborators FOR INSERT
  WITH CHECK (
    public.can_manage_team(event_id)
    AND role <> 'owner'
    AND (can_delete = false OR public.event_role_of(event_id) = 'owner')
  );

CREATE POLICY ec_update ON public.event_collaborators FOR UPDATE
  USING (public.can_manage_team(event_id) AND role <> 'owner')
  WITH CHECK (
    public.can_manage_team(event_id)
    AND role <> 'owner'
    AND (can_delete = false OR public.event_role_of(event_id) = 'owner')
  );

-- Quitar a alguien, o renunciar uno mismo. Al owner no lo saca nadie:
-- para sacarlo hay que transferir primero.
CREATE POLICY ec_delete ON public.event_collaborators FOR DELETE
  USING (role <> 'owner' AND (public.can_manage_team(event_id) OR user_id = auth.uid()));
```

## Las tres operaciones que no son un INSERT suelto

### 1. Reclamar al crear — trigger de alta

```sql
CREATE OR REPLACE FUNCTION public.events_claim_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.event_collaborators (event_id, user_id, role, can_delete, source)
  VALUES (NEW.id, NEW.created_by, 'owner', true, 'claim');

  -- El dueño del local, si existe y no es el mismo que creó.
  INSERT INTO public.event_collaborators (event_id, user_id, role, can_delete, source)
  SELECT NEW.id, v.owner_id, 'admin', false, 'venue_owner'
    FROM public.venues v
   WHERE v.id = NEW.venue_id AND v.owner_id IS NOT NULL AND v.owner_id <> NEW.created_by
  ON CONFLICT DO NOTHING;

  -- El artista, si está vinculado a un perfil real.
  INSERT INTO public.event_collaborators (event_id, user_id, role, can_delete, source)
  SELECT NEW.id, NEW.artist_id, 'admin', false, 'artist'
   WHERE NEW.artist_id IS NOT NULL AND NEW.artist_id <> NEW.created_by
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

CREATE TRIGGER events_claim_owner_trg
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_claim_owner();
```

`SECURITY DEFINER` es obligatorio acá: en el instante del INSERT el creador **todavía no es
colaborador**, así que `ec_insert` lo rechazaría. El trigger tiene que poder escribir la
primera fila desde afuera de RLS.

⚠️ **El alta automática solo corre al crear el evento.** Si un local reclama su `venue`
después (spec 031), no entra retroactivamente a los eventos ya publicados. Se resuelve con
un backfill puntual cuando el 031 pueble `venues.owner_id`, no con un trigger sobre `venues`:
agregar gente en silencio a eventos viejos sorprende más de lo que ayuda.

### 2. Transferir la propiedad — función, no dos updates

El índice único parcial se evalúa por fila, no al final de la transacción: si el cliente
promueve al nuevo owner antes de degradar al viejo, el segundo owner choca contra el índice
y la operación falla a medias. El orden correcto no puede quedar en manos de la app.

```sql
CREATE OR REPLACE FUNCTION public.transfer_event_ownership(p_event uuid, p_new_owner uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.event_role_of(p_event) <> 'owner' THEN
    RAISE EXCEPTION 'Solo el dueño del evento puede transferir la propiedad';
  END IF;

  UPDATE public.event_collaborators                        -- 1. degradar
     SET role = 'admin'
   WHERE event_id = p_event AND role = 'owner';

  INSERT INTO public.event_collaborators                    -- 2. promover
         (event_id, user_id, role, can_delete, source, invited_by)
  VALUES (p_event, p_new_owner, 'owner', true, 'claim', auth.uid())
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET role = 'owner', can_delete = true;
END; $$;
```

El viejo owner queda como `admin` con el `can_delete` que ya tenía: transferir no es
renunciar al equipo. Si además quiere salirse, borra su propia fila (`ec_delete`).

### 3. Cancelar vs. borrar — el guardrail que protege las ventas

```sql
CREATE OR REPLACE FUNCTION public.events_block_delete_with_tickets()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tickets
              WHERE evento_id = OLD.id AND status IN ('pending','completed')) THEN
    RAISE EXCEPTION
      'El evento tiene entradas vendidas o en proceso: cancélalo en vez de borrarlo';
  END IF;
  RETURN OLD;
END; $$;

CREATE TRIGGER events_block_delete_with_tickets_trg
  BEFORE DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_block_delete_with_tickets();
```

La regla en una línea: **un evento sin entradas se borra; un evento con entradas solo se
cancela.** `pending` cuenta igual que `completed` — puede haber un pago de Mercado Pago en
vuelo, y borrar el evento debajo de una compra en curso deja al comprador sin destino.

Cancelar es un `UPDATE status='cancelled'` con `cancelled_at` y `cancel_reason`. El evento
sigue existiendo, las entradas siguen existiendo, y el comprador puede ver qué pasó.

⚠️ **Cancelar no reembolsa.** El reembolso necesita la API de refunds de Mercado Pago y
avisar por correo a los compradores: queda fuera de este spec (ver *Fuera de alcance*).

## Migración

Un solo archivo, en este orden — **el backfill no puede ir en una migración posterior**:
en cuanto las policies dejan de mirar `created_by`, un evento sin fila de owner queda
inmodificable para todo el mundo, incluido quien lo creó.

1. `CREATE TABLE event_collaborators` + índices
2. `ALTER TABLE events` (status, cancelled_at, cancel_reason, artist_id)
3. Las cuatro funciones de autorización
4. Los triggers (alta, columnas protegidas, guardrail de borrado)
5. **Backfill**, antes de tocar policies:
   ```sql
   INSERT INTO public.event_collaborators (event_id, user_id, role, can_delete, source)
   SELECT id, created_by, 'owner', true, 'backfill' FROM public.events
   ON CONFLICT DO NOTHING;
   ```
6. `DROP`/`CREATE` de las policies de `events`, y las de `event_collaborators`

Aplicar con `supabase db push`. Ojo con la brecha del spec 024 que ya apareció en el 030:
si el historial remoto de migraciones vuelve a discrepar, `migration repair` corrige el
registro de control sin ejecutar DDL.

## Frontend

| Archivo | Cambio |
|---|---|
| `src/types/index.ts` | `EventoStatus`, `EventRole`, `Colaborador`; `Evento` suma `status`, `artistId` |
| `src/context/EventosContext.tsx` | `cancelEvento`, `colaboradores`, `invitar`, `cambiarRol`, `transferir`; **`deleteEvento` debe propagar el error** |
| `src/hooks/useEventoPermisos.ts` (nuevo) | `{ esOwner, puedeEditar, puedeInvitar, puedeBorrar }` desde una sola consulta |
| `src/screens/EquipoEventoScreen.tsx` (nuevo) | Lista del equipo con el `source` visible, invitar, toggle "puede borrar", transferir |
| `src/screens/CrearEventoScreen.tsx` | Selector de artista registrado (opcional) además del texto libre |
| `src/screens/DetalleEventoScreen.tsx` | Botones Editar / Equipo / Cancelar / Borrar según permisos; banda de "Evento cancelado" |
| `src/navigation/MusicoStack.tsx`, `MiLocalStack.tsx` | Ruta `EquipoEvento` |

⚠️ **`deleteEvento` hoy miente.** `EventosContext.tsx:114-121` traga el error con un `catch {}`
vacío y saca el evento del estado local igual. Con las policies nuevas eso deja de ser
inocuo: a quien no tenga permiso el evento le desaparece de la pantalla y le reaparece al
recargar. Es el mismo patrón que el spec 030 encontró en `PerfilMusicoScreen` y que
`CLAUDE.md` marca como causa raíz recurrente. Se arregla acá.

### Buscar a quién invitar

La invitación es **solo a usuarios que ya tienen cuenta**. Invitar por correo a alguien sin
cuenta exige mandar correo, y el correo está bloqueado (spec 028, sin API key de Resend).

Pero buscar tampoco funciona hoy: tras el spec 020, `profiles` solo expone
`role = 'musician'`. Un dueño de local es invisible para todos menos para sí mismo, así que
no se lo puede encontrar por nombre. Hace falta una función `SECURITY DEFINER`
`search_collaborator_candidates(q text)` que devuelva **solo `id`, `nombre`, `role`** —
nunca teléfono ni email, que son las columnas que el 030 agregó y que el 020 protege.

## Dependencias

- **Spec 031 (dashboard de local)** — no bloquea implementar, **sí bloquea verificar**. Los
  3 venues tienen `owner_id = NULL` y ningún usuario tiene `role = 'cafe'`: sin el 031, la
  rama "dueño del local entra como admin" es código correcto que nunca se dispara.
- **Spec 023** — comparte diagnóstico (borrado destructivo, FKs `NO ACTION`) y no compite:
  este resuelve eventos, el 023 resuelve usuarios y locales. Hacer este primero le quita
  al 023 la parte de eventos.
- **Spec 022** — el estado `cancelled` es donde después colgará el reembolso, y `artist_id`
  y el equipo son datos que el control de aforo necesita para saber a quién avisar.
- **Spec 021** — no lo toca. Este spec no entra en el flujo de compra.

## Criterio de cierre

No se cierra por código escrito. Se cierra cuando, **verificado contra la base**:

1. Un músico crea un evento y `event_collaborators` tiene su fila `owner` con `source='claim'`
2. Ese evento en un local con `owner_id` poblado da **dos** filas: el músico `owner`, el local
   `admin` con `can_delete = false`
3. El dueño del local edita la hora y guarda; **intenta borrar y la API lo rechaza**
4. El owner le da `can_delete` al local, y recién entonces el local puede cancelar
5. Un admin **sin** `can_delete` intenta otorgárselo a sí mismo por API y `ec_update` lo rechaza
6. Borrar un evento con un ticket `completed` falla con el mensaje del trigger; cancelarlo funciona
7. `transfer_event_ownership` deja exactamente un `owner` y al anterior como `admin`
8. Sin eventos huérfanos: `SELECT e.id FROM events e WHERE NOT EXISTS (SELECT 1 FROM
   event_collaborators c WHERE c.event_id = e.id AND c.role = 'owner')` devuelve 0 filas
9. La cartelera pública sigue mostrando lo mismo que antes de la migración

## Fuera de alcance

Cada uno es un spec propio, no un olvido:

- **Reembolso al cancelar** — necesita la API de refunds de MP y decidir quién absorbe la
  comisión. Es una decisión de negocio antes que de código.
- **Avisar a los compradores de un evento cancelado** — depende del 028 y del 029.
- **Invitar por correo a quien no tiene cuenta** — depende del 028.
- **Historial de auditoría** (quién cambió qué y cuándo) — hoy solo queda el estado final.
- **Soft delete de eventos** — este spec impide el borrado peligroso; el borrado reversible
  es del 023.
