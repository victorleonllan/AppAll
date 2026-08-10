# Spec 036 — Entradas individuales: `ticket_items`, folio y token QR

> Estado: **planificado el 2026-08-10, sin implementar.** Capa de datos del flujo de
> entradas. Es el primero de la serie 036-041 y el único que los otros cinco necesitan
> antes de empezar. Solo toca `supabase/migrations/`: ningún archivo de `src/`.

## Contexto

Hoy una compra es **una fila** en `tickets` con una columna `cantidad`:

```sql
-- baseline 20260608000000
CREATE TABLE public.tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  status        text NOT NULL DEFAULT 'pending',
  preference_id text NOT NULL DEFAULT '',
  payment_id    text,
  monto         integer NOT NULL,
  cantidad      integer NOT NULL DEFAULT 1,
  created_at    timestamptz DEFAULT now()
);
```

Eso alcanza para cobrar y para contar dinero, y por eso el spec 009 lo dejó así. No alcanza
para la puerta del local, por tres razones que se ven recién cuando alguien tiene que entrar:

1. **Una compra de 3 entradas tiene un solo `id`.** Un QR por compra se escanea una vez y
   deja tres personas adentro, o se escanea tres veces y no hay forma de distinguir el
   segundo ingreso legítimo de una foto del mismo QR reenviada por WhatsApp.
2. **No hay número visible.** "Enumerar los tickets" pide un correlativo que el comprador
   pueda leer en voz alta y el portero buscar a mano cuando la cámara falle. `tickets.id`
   es un UUID: sirve para la base, no para gritarlo en una puerta.
3. **No hay estado de ingreso.** `TicketStatus` (`pending`/`completed`/`refunded`/`cancelled`)
   describe el **pago**. Que una entrada esté pagada no dice si ya se usó, y meter `'used'`
   en esa misma columna mezcla dos ciclos de vida distintos: el del dinero y el de la puerta.
   Un reembolso sobre una entrada ya canjeada tiene que poder registrarse sin perder ninguno
   de los dos hechos.

## La decisión de fondo: una fila por entrada

`tickets` se queda **como está y con el significado que ya tiene: la compra**. Encima cuelga
`ticket_items`, una fila por persona que entra. No se toca ni una columna del baseline.

Es lo mismo que el spec 033 hizo con `created_by`: en vez de sobrecargar una columna que ya
significaba algo, se agrega la tabla donde vive el concepto nuevo. La compra tiene monto,
`payment_id` y estado de Mercado Pago; la entrada tiene folio, QR y estado de puerta. Son dos
cosas y se modelan como dos cosas.

## El modelo

```sql
CREATE TABLE public.ticket_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  evento_id   uuid        NOT NULL REFERENCES public.events(id)  ON DELETE CASCADE,
  folio       integer     NOT NULL,
  qr_token    text        NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  status      text        NOT NULL DEFAULT 'valid',
  redeemed_at timestamptz,
  redeemed_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ticket_items_status_check
    CHECK (status IN ('valid','used','void')),
  -- Un ticket usado sin fecha de canje, o una fecha sin estado 'used', es un dato que
  -- miente. El CHECK lo hace imposible en vez de dejarlo a la disciplina del código.
  CONSTRAINT ticket_items_redeem_coherente
    CHECK ((status = 'used') = (redeemed_at IS NOT NULL))
);

-- La enumeración es POR EVENTO: el folio 1 existe una vez en cada evento, no una vez
-- en toda la base. Es lo que hace que "entrada 7 de 40" signifique algo en la puerta.
CREATE UNIQUE INDEX ticket_items_folio_evento ON public.ticket_items (evento_id, folio);

-- El token es la llave de canje: único global y con su propio índice porque el escáner
-- entra siempre por acá y por nada más.
CREATE UNIQUE INDEX ticket_items_qr_token ON public.ticket_items (qr_token);

-- El dashboard del evento cuenta por estado; el escáner lista pendientes del evento.
CREATE INDEX ticket_items_evento_status_idx ON public.ticket_items (evento_id, status);
CREATE INDEX ticket_items_ticket_idx ON public.ticket_items (ticket_id);
```

### Por qué `evento_id` está duplicado

Se puede derivar de `tickets.evento_id` con un join, y aun así va acá. Dos motivos, ninguno
de rendimiento:

- **El índice único `(evento_id, folio)` no se puede escribir sobre una columna de otra
  tabla.** Sin la columna, la unicidad del folio por evento queda en manos del código —
  exactamente el tipo de invariante que el spec 020 demostró que no sobrevive fuera de la base.
- El escáner y el dashboard consultan **por evento**, nunca por compra. Un join obligatorio en
  el camino caliente del canje es latencia en la puerta.

El costo es que puede desincronizarse de `tickets.evento_id`. Se cierra con un trigger que
lo rechaza (más abajo), no con una convención.

### Por qué el token es hex y no un UUID

`encode(gen_random_bytes(16), 'hex')` da 32 caracteres, 128 bits de entropía. La razón de no
usar `gen_random_uuid()::text` no es la entropía —es la misma— sino el **QR**: un texto de
solo dígitos y `a-f` mayusculizado entra en el modo alfanumérico del estándar QR, que produce
un código con menos módulos que el modo byte. Menos módulos = cuadros más grandes = lo lee una
cámara barata con mala luz, que es la condición real de la puerta de un bar.

El token es **opaco**: no codifica el evento, ni el folio, ni el comprador. Quien lo intercepte
no aprende nada y no puede fabricar otro. La validación es contra la base, siempre.

### Los tres estados de la entrada

| Estado | Qué significa | Quién lo escribe |
|---|---|---|
| `valid` | Emitida, todavía no entró | `issue_ticket_items` al emitir |
| `used` | Ya entró | `redeem_ticket_item` (spec 040) |
| `void` | Anulada — reembolso, evento cancelado, error de emisión | Todavía nadie: reservado |

`void` nace sin escritor a propósito. El reembolso es del spec 022/023 y la cancelación con
devolución quedó fuera del 033; cuando lleguen, van a necesitar un estado donde poner la
entrada sin borrarla, y borrar una entrada de un evento que ya pasó destruye la evidencia de
quién entró. Dejar el valor en el CHECK ahora cuesta una línea; agregarlo después es una
migración con datos vivos.

## El contador de folios

El folio es correlativo **por evento**, y una compra de 3 entradas necesita 3 folios
consecutivos asignados de una vez. `MAX(folio) + 1` no sirve: dos compras que confirman en el
mismo instante leen el mismo máximo y la segunda choca contra el índice único.

Postgres no permite crear una secuencia por evento sin DDL en tiempo de ejecución. La salida
es una fila-contador:

```sql
CREATE TABLE public.event_folio_counters (
  evento_id  uuid    PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  next_folio integer NOT NULL DEFAULT 1
);
ALTER TABLE public.event_folio_counters ENABLE ROW LEVEL SECURITY;
-- Sin policies: nadie la toca por API. Solo la escribe issue_ticket_items.
```

`UPDATE ... SET next_folio = next_folio + n RETURNING` bloquea **esa fila** hasta el commit y
devuelve el rango reservado. Dos compras del mismo evento se serializan por un lock de una
fila; compras de eventos distintos no se ven entre sí. Es la diferencia con `MAX()`, que no
bloquea nada, y con un lock de tabla, que serializaría toda la venta de la plataforma.

⚠️ **Los folios reservados no se devuelven.** Si una emisión falla después de reservar, el
contador ya avanzó y esos números no se usan nunca. Es deliberado: un hueco en la numeración
es cosmético, mientras que reciclar un folio significa dos entradas con el mismo número en la
misma puerta.

## La función de emisión

Vive en este spec porque es SQL y opera sobre estas tablas. **Quién la llama y cuándo es el
spec 037** — ese corte es lo que deja los dos specs en archivos distintos.

```sql
CREATE OR REPLACE FUNCTION public.issue_ticket_items(p_ticket uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_evento   uuid;
  v_cantidad integer;
  v_status   text;
  v_ya       integer;
  v_faltan   integer;
  v_desde    integer;
BEGIN
  -- FOR UPDATE es la guarda de idempotencia real: dos entregas simultáneas del mismo
  -- webhook de MP se serializan acá, y la segunda ve el conteo que dejó la primera.
  SELECT evento_id, cantidad, status INTO v_evento, v_cantidad, v_status
    FROM public.tickets WHERE id = p_ticket FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket % no existe', p_ticket;
  END IF;
  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'Ticket % está en %, solo se emiten entradas de compras completed',
      p_ticket, v_status;
  END IF;

  SELECT count(*) INTO v_ya FROM public.ticket_items WHERE ticket_id = p_ticket;
  v_faltan := v_cantidad - v_ya;
  IF v_faltan <= 0 THEN
    RETURN 0;                    -- ya emitido: reentrada silenciosa, no error
  END IF;

  INSERT INTO public.event_folio_counters (evento_id) VALUES (v_evento)
    ON CONFLICT DO NOTHING;

  UPDATE public.event_folio_counters
     SET next_folio = next_folio + v_faltan
   WHERE evento_id = v_evento
   RETURNING next_folio - v_faltan INTO v_desde;

  INSERT INTO public.ticket_items (ticket_id, evento_id, folio)
  SELECT p_ticket, v_evento, v_desde + g
    FROM generate_series(0, v_faltan - 1) AS g;

  RETURN v_faltan;
END; $$;

REVOKE ALL ON FUNCTION public.issue_ticket_items(uuid) FROM public, anon, authenticated;
```

Tres decisiones dentro de esas 40 líneas:

- **Devolver 0 en vez de fallar cuando ya está emitido.** Mercado Pago reenvía notificaciones
  y el reenvío es normal, no un error. Si la función tirara excepción, el webhook la
  registraría como fallo y MP seguiría reintentando contra algo que ya funcionó.
- **Emitir `v_faltan` y no `v_cantidad`.** Si una emisión anterior se cortó a la mitad, la
  siguiente completa el resto en vez de duplicar. La función converge al estado correcto
  desde cualquier punto intermedio.
- **`REVOKE` explícito.** Es `SECURITY DEFINER` y escribe: nadie debe poder llamarla desde el
  cliente. El único que la invoca es la Edge Function con el service role, que ignora los
  grants. Es la lección directa del spec 020 — el agujero de aquella vez fue una policy
  permisiva, no un descuido de sintaxis.

`SET search_path = public` en toda función `SECURITY DEFINER`: sin él resuelve nombres contra
el `search_path` de quien llama y se vuelve un vector de escalada de privilegios.

## Trigger de coherencia

```sql
CREATE OR REPLACE FUNCTION public.ticket_items_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.evento_id <> (SELECT evento_id FROM public.tickets WHERE id = NEW.ticket_id) THEN
    RAISE EXCEPTION 'ticket_items.evento_id no coincide con el de su compra';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.folio <> OLD.folio OR NEW.qr_token <> OLD.qr_token
                           OR NEW.ticket_id <> OLD.ticket_id) THEN
    RAISE EXCEPTION 'folio, qr_token y ticket_id son inmutables';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER ticket_items_guard_trg
  BEFORE INSERT OR UPDATE ON public.ticket_items
  FOR EACH ROW EXECUTE FUNCTION public.ticket_items_guard();
```

Lo único que cambia después de emitida una entrada es su estado de puerta. El folio impreso en
el QR del comprador y el token que lo identifica no pueden reescribirse ni por el equipo del
evento: si el token cambiara, el QR que ya tiene el comprador en el teléfono dejaría de servir
sin que nadie se enterara hasta la puerta.

## RLS

```sql
ALTER TABLE public.ticket_items ENABLE ROW LEVEL SECURITY;

-- Lo ve el comprador (es su entrada) y el equipo del evento (la tiene que controlar).
CREATE POLICY ti_select ON public.ticket_items FOR SELECT USING (
  public.can_edit_event(evento_id)
  OR EXISTS (SELECT 1 FROM public.tickets t
              WHERE t.id = ticket_items.ticket_id AND t.user_id = auth.uid())
);
```

⚠️ **No hay policy de INSERT, UPDATE ni DELETE, y eso no es un olvido.** Con RLS activa, la
ausencia de policy es una negación total: nadie escribe esta tabla por API. Las dos únicas
escrituras legítimas son la emisión (esta función) y el canje (spec 040), ambas
`SECURITY DEFINER` con su propia autorización adentro.

Es exactamente lo contrario de lo que hacía `tickets_update_own` en el baseline —una policy de
UPDATE con `USING` y sin `WITH CHECK`, que dejaba al comprador cambiarse el `status` y el
`monto` de su propia compra— y que el spec 020 tuvo que eliminar. Acá el default es "nadie".

`can_edit_event()` viene del spec 033 y ya está en producción: cubre `owner`, `admin` y
`editor` del evento. Es la respuesta a "el segundo admin también tiene que ver esto" —
no hace falta ninguna regla nueva, hace falta usar la que ya existe.

## Migración

Un solo archivo `<timestamp>_spec_036_entradas_individuales.sql`, en este orden:

1. `CREATE TABLE ticket_items` + los cuatro índices
2. `CREATE TABLE event_folio_counters` + `ENABLE ROW LEVEL SECURITY`
3. `issue_ticket_items` + `REVOKE`
4. `ticket_items_guard` + trigger
5. `ENABLE ROW LEVEL SECURITY` sobre `ticket_items` + `ti_select`

**Sin backfill.** Hoy la base tiene 0 tickets `completed` (el flujo de compra nunca se cerró
de punta a punta — ver `specs/README.md`), así que no hay nada que retro-emitir. El backfill
para compras que existan al momento de aplicar es del spec 037, junto al resto de la emisión.

Antes de `db push`, correr `supabase migration list` y confirmar que el historial local y el
remoto coinciden. Es el paso que el spec 033 se saltó y le costó descubrir a mitad del push
que la migración del 031 estaba aplicada en remoto sin archivo local.

## Dependencias

- **Spec 033** — hard. `ti_select` llama a `can_edit_event()`, que el 033 creó y ya está en
  producción. Sin esa función la migración ni siquiera aplica.
- **Spec 021 (cerrar flujo de compra)** — no bloquea. Este spec no toca el camino de compra;
  crea la estructura donde la compra va a depositar entradas.

## Criterio de cierre

Verificado contra la base, no contra el código escrito:

1. `issue_ticket_items` sobre un ticket `completed` con `cantidad = 3` crea 3 filas con folios
   consecutivos y tres `qr_token` distintos
2. Llamarla otra vez sobre el mismo ticket devuelve `0` y no crea filas nuevas
3. Sobre un ticket `pending` levanta excepción y no crea nada
4. Dos compras de 2 entradas del **mismo evento** emitidas seguidas dan folios 1,2 y 3,4 —
   sin repetidos y sin huecos
5. Un `UPDATE` por API sobre `ticket_items` es rechazado por RLS, incluso siendo `owner` del
   evento
6. Un comprador ve sus propias entradas y **no** ve las de otro comprador del mismo evento
7. Un `admin` del evento que no lo creó ve todas las entradas del evento
   (esto es lo que el spec 038 tiene que arreglar para `tickets`; acá nace bien de fábrica)

## Fuera de alcance

- **Emitir las entradas** — spec 037. Acá solo está la función; nadie la llama todavía.
- **Canjear** — spec 040.
- **Mostrar el QR** — spec 039.
- **Aforo / límite de entradas por evento** — sigue sin existir en el modelo (spec 022, y
  `venues.aforo` que aportó el 031). Este spec no lo agrega: emitir sin tope es el
  comportamiento de hoy y cambiarlo es una decisión de producto aparte.
- **Entradas de cortesía o venta en puerta** — Victor lo acotó explícitamente: *todos los
  tickets se crean desde la compra*. Una entrada sin `ticket_id` no es representable en este
  modelo, y eso es intencional hasta que exista la decisión de negocio.
- **Nombre del asistente por entrada** (entradas nominativas) — hoy las 3 entradas de una
  compra son idénticas salvo el folio. Nominarlas exige pedir datos en la compra: spec propio.
