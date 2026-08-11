# Spec 038 — Quién ve las ventas de un evento: de `created_by` a `event_collaborators`

> Estado: **aplicado a producción el 2026-08-10** (migración
> `20260810233000_spec_038_rls_ventas_por_colaborador.sql`). Verificado que la policy
> quedó como especifica este documento (`tickets_select_event_team` usando
> `can_edit_event(evento_id)`, `tickets_select_own` y `tickets_insert` intactas). **Falta
> el criterio de cierre completo**: producción tiene 0 tickets y una sola fila en
> `event_collaborators`, así que no hay datos para comparar "ve ventas" vs "ve cero" con
> un caso real. Mismo bloqueo que arrastran 030/031/033 — depende de que el 021/028
> destraben la primera compra real y de que exista un segundo colaborador de prueba.

## Contexto — el hueco ya estaba anotado

Este spec no descubre nada: cierra un hueco que dos specs anteriores dejaron escrito en el
código, esperando número propio.

`MiLocalStack.tsx`, comentario del spec 031:

> ⚠️ El spec 033 degradó `created_by` a hecho histórico: ahora quien autoriza es
> `event_collaborators`. La policy de tickets siguió usando `created_by`, así que un
> colaborador con `role='owner'` que no creó el evento no ve sus ventas. Es un hueco real,
> no un descuido de este spec — corregirlo es cambiar la policy, y eso pide su propio número.

Y `PENDIENTES.md`, sección del spec 031:

> Además hereda un hueco del 033: `tickets_select_event_owner` filtra por `events.created_by`,
> que el 033 degradó a dato histórico. Un local que entró como `owner` sin crear el evento ve
> sus ventas en cero.

La policy sigue tal cual la escribió el baseline en junio:

```sql
-- baseline 20260608000000 — nunca se tocó desde entonces
CREATE POLICY tickets_select_event_owner ON public.tickets FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.events
          WHERE events.id = tickets.evento_id AND events.created_by = auth.uid())
);
```

## Por qué está roto ahora y no antes

Hasta el spec 033, `events.created_by` era **la** noción de dueño: quien creaba el evento era
el único que podía editarlo, borrarlo y ver sus ventas. Las tres cosas coincidían, así que
esta policy era correcta.

El 033 partió esa columna en dos conceptos que ya no coinciden:

| Concepto | Dónde vive tras el 033 |
|---|---|
| Quién apretó "Publicar" | `events.created_by` — **hecho histórico inmutable**, no autoriza nada |
| Quién manda hoy sobre el evento | `event_collaborators` + `can_edit_event()` / `can_delete_event()` |

El 033 reemplazó `events_update`, `events_delete` y `events_select` para que miraran al lugar
nuevo. **`tickets_select_event_owner` quedó afuera** porque el 033 declaró explícitamente que
no entraba en el flujo de compra. Fue una decisión correcta de alcance que dejó una
inconsistencia conocida.

Las tres personas que el 033 puede meter en el equipo de un evento son exactamente las que hoy
no ven las ventas:

1. **El dueño del local**, que entra como `admin` con `source='venue_owner'` cuando un músico
   publica un show en su local. Puede corregir la hora del evento y no puede ver cuántas
   entradas se vendieron en su propia casa.
2. **El artista vinculado** (`source='artist'`), en el caso simétrico: el local publica y el
   músico entra al equipo.
3. **Cualquier invitado** desde `EquipoEventoScreen` — que es literalmente el *"segundo
   administrador"* del pedido de Victor.
4. Y el caso más raro y peor: **un `owner` por transferencia**. `transfer_event_ownership`
   mueve el rol pero no toca `created_by`, así que el nuevo dueño del evento no ve nada y el
   anterior —que quizás ya se fue del proyecto— sigue viendo todo.

## El cambio

```sql
DROP POLICY IF EXISTS tickets_select_event_owner ON public.tickets;

-- Mismo nombre no: el nombre viejo dice "event_owner" y ya no es el criterio.
CREATE POLICY tickets_select_event_team ON public.tickets FOR SELECT
  USING (public.can_edit_event(evento_id));
```

`can_edit_event()` es del spec 033, es `SECURITY DEFINER` y devuelve verdadero para `owner`,
`admin` y `editor`. Consultarla desde una policy de `tickets` no arma recursión —el problema
que el 033 resolvió con `SECURITY DEFINER`— porque la función consulta `event_collaborators`,
no `tickets`.

Renombrar la policy en vez de sustituirla en el lugar es deliberado: un `grep` por
`tickets_select_event_owner` en un año va a devolver esta migración y el nombre nuevo, que es
la única pista de que el criterio cambió. Una policy con el mismo nombre y otro cuerpo miente
en cada búsqueda futura.

### La otra policy no se toca

```sql
-- se queda tal cual: el comprador ve sus propias compras
CREATE POLICY tickets_select_own ON public.tickets FOR SELECT USING (auth.uid() = user_id);
```

Las dos policies de SELECT son **OR** entre sí, que es lo correcto: se ve un ticket por ser el
comprador **o** por ser del equipo del evento.

### `tickets_insert` tampoco

```sql
CREATE POLICY tickets_insert ON public.tickets FOR INSERT WITH CHECK (auth.uid() = user_id);
```

Crear un ticket es comprar, y comprar es del comprador. Que el equipo del evento pueda ver las
ventas no significa que pueda fabricarlas. Ampliar esto sería vender en puerta, que Victor dejó
fuera de alcance (*todos los tickets se crean desde la compra*).

Y de UPDATE/DELETE sobre `tickets` no hay ninguna policy desde el spec 020: nadie modifica una
compra por API. Solo el webhook, con el service role. Se mantiene.

## Efecto colateral esperado en el frontend

`VentasMusicoScreen` está montada en `MusicoStack` **y** en `MiLocalStack` (spec 031, ruta
`Ventas`) sin ninguna diferencia de código: el componente muestra "las ventas que RLS me deja
ver". Por eso este spec no necesita tocar ni una línea de `src/` — al cambiar la policy, la
misma pantalla empieza a mostrar lo correcto para los dos roles.

Lo único que queda desactualizado es el comentario de 12 líneas en `MiLocalStack.tsx` que
documenta el hueco. **Borrarlo es del spec 039**, que ya va a tocar ese archivo para registrar
la ruta del dashboard de entradas. Dos specs escribiendo el mismo archivo de navegación es
justo lo que hay que evitar cuando corren en paralelo.

## Migración

Archivo único `<timestamp>_spec_038_rls_ventas_por_colaborador.sql`: un `DROP POLICY` y un
`CREATE POLICY`. Sin DDL de tablas, sin datos tocados, reversible con la sentencia inversa.

Es la migración más segura de la serie y conviene aplicarla **primero**, antes que la del 036:
es independiente de todo lo demás, y verificarla sola —un `admin` invitado abre "Ventas" y ve
números en vez de cero— cierra el requisito de permisos de Victor sin esperar al resto.

## Dependencias

- **Spec 033** — hard. `can_edit_event()` y `event_collaborators` son suyas y ya están en
  producción.
- **Spec 031** — no bloquea aplicar, **sí bloquea verificar el caso del local**: los 3 venues
  tienen `owner_id = NULL`, así que la rama `venue_owner` del trigger de alta nunca se
  disparó. El caso del invitado manual desde `EquipoEventoScreen` sí se puede verificar hoy.
- **Independiente del 036, 037, 039, 040 y 041.** No comparte ningún archivo con ellos.

## Criterio de cierre

1. Un usuario invitado como `admin` a un evento que **no** creó ve las ventas de ese evento
2. El mismo usuario **no** ve las ventas de un evento del que no es colaborador
3. El comprador sigue viendo sus propias compras (no se rompió `tickets_select_own`)
4. Tras `transfer_event_ownership`, el nuevo `owner` ve las ventas y el anterior —que queda
   como `admin`— también
5. `VentasMusicoScreen` abierta desde `MiLocalStack` muestra las ventas del evento del local
   sin haber cambiado una línea de frontend
6. Un usuario sin relación con el evento consulta `tickets` por API directa y recibe 0 filas

## Fuera de alcance

- **Que el equipo pueda modificar o anular una compra** — sigue siendo solo del webhook.
- **Diferenciar qué ve un `editor` de qué ve un `owner`** dentro de las ventas (por ejemplo,
  ocultar montos a un rol). Hoy los tres roles del 033 ven lo mismo; si hace falta separar,
  es una función de autorización nueva, no un cambio de esta policy.
- **Borrar el comentario obsoleto de `MiLocalStack.tsx`** — spec 039.
