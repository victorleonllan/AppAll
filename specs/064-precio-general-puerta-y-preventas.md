# Spec 064 — Precio general/puerta + preventas agregables

**Capa: DATOS · `supabase/migrations/` · Depende de: spec 033 (equipo de evento), spec 040
(compra/canje de tickets) · Pedido desde `sonopolisWeb/specs/W-PENDIENTES.md` #24**

## Motivo

Hoy `events.precio` es un solo valor de texto libre. Victor pidió (vault, sesión
2026-09-01, evento real "Roda de Samba" en Quintal Clandesta — preventa $3.000, puerta
$5.000) que el precio deje de ser uno solo:

1. El precio base del evento elige entre **"General"** (no hay preventa, ese es el único
   precio) o **"Puerta"** (existe preventa — elegir "Puerta" es la señal de que aplica).
2. Aparte, un **número abierto de preventas** que el organizador agrega con un botón
   ("+ Agregar preventa"), cada una numerada sola (Preventa 1, Preventa 2...), con su
   propio precio y un cupo de tickets **opcional** — sin cupo, se vende hasta que el
   organizador la cierra a mano.
3. Tanto el precio base como las preventas se editan después de creado el evento — a
   diferencia de `artistId`/`venueId` (spec 034), acá la edición post-creación es el caso
   normal, no la excepción.

Este spec es solo DATOS: el esquema y las reglas de integridad que la BD puede garantizar
sola. Qué preventa se cobra en el checkout y el formulario para agregar/editar preventas
quedan en specs de LÓGICA y FRONTEND aparte (ver "Consecuencia para las apps" al final).

## `events.tipo_precio`

```sql
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS tipo_precio text NOT NULL DEFAULT 'general';

ALTER TABLE public.events
  ADD CONSTRAINT events_tipo_precio_check CHECK (tipo_precio IN ('general', 'puerta'));
```

`precio`/`monto` (columnas existentes) siguen siendo el valor de ese precio base — no
cambian de forma, solo se le agrega la etiqueta de qué significan. Default `'general'`
porque así están todos los eventos existentes hoy (un solo precio, sin preventa).

## Tabla nueva `event_preventas`

```sql
CREATE TABLE public.event_preventas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  nombre      text        NOT NULL,             -- "Preventa 1", "Preventa 2"... lo arma el frontend
  orden       integer     NOT NULL,              -- 1, 2, 3... cuál se cobra primero
  precio      text        NOT NULL,              -- mismo formato texto libre que events.precio
  monto       integer     NOT NULL,              -- CLP con recargo, mismo cálculo que events.monto
  cupo        integer,                           -- NULL = sin límite, se cierra a mano
  vendidos    integer     NOT NULL DEFAULT 0,
  activa      boolean     NOT NULL DEFAULT true, -- cierre manual del organizador, con o sin cupo
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_preventas_orden_unico UNIQUE (event_id, orden),
  CONSTRAINT event_preventas_cupo_valido CHECK (cupo IS NULL OR vendidos <= cupo)
);

CREATE INDEX event_preventas_event_idx ON public.event_preventas (event_id);

ALTER TABLE public.event_preventas ENABLE ROW LEVEL SECURITY;

-- Público: la cartelera y el checkout necesitan ver los precios, igual que events_select.
CREATE POLICY event_preventas_select ON public.event_preventas FOR SELECT USING (true);

-- Escritura: mismo criterio que el resto del equipo del evento (spec 033).
CREATE POLICY event_preventas_insert ON public.event_preventas FOR INSERT
  WITH CHECK (public.can_edit_event(event_id));
CREATE POLICY event_preventas_update ON public.event_preventas FOR UPDATE
  USING (public.can_edit_event(event_id));
CREATE POLICY event_preventas_delete ON public.event_preventas FOR DELETE
  USING (public.can_edit_event(event_id));
```

`event_preventas_cupo_valido` es la garantía real de que nunca se vende de más: no importa
qué bug tenga el checkout más adelante, la fila no puede terminar con `vendidos > cupo`.

## `tickets.preventa_id` — qué preventa pagó cada ticket

```sql
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS preventa_id uuid REFERENCES public.event_preventas(id) ON DELETE SET NULL;

CREATE INDEX tickets_preventa_idx ON public.tickets (preventa_id) WHERE preventa_id IS NOT NULL;
```

`NULL` = se cobró el precio base del evento (general, o puerta sin preventa activa). Lo
llena el checkout (spec de LÓGICA aparte) al elegir cuál preventa está activa en ese
momento — este spec solo deja la columna lista.

## Trigger: `vendidos` se mantiene solo

Igual que `events_claim_owner_trg` (spec 033) no delega en el frontend la integridad del
equipo del evento, el contador de vendidos no se delega en el checkout — se mantiene desde
la propia transición de estado del ticket:

```sql
CREATE OR REPLACE FUNCTION public.tickets_track_preventa_vendidos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Entra a 'completed': suma la cantidad comprada al contador de su preventa.
  IF NEW.preventa_id IS NOT NULL AND NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.event_preventas SET vendidos = vendidos + NEW.cantidad
     WHERE id = NEW.preventa_id;
  END IF;

  -- Sale de 'completed' por reembolso o cancelación: libera el cupo.
  IF TG_OP = 'UPDATE' AND OLD.preventa_id IS NOT NULL AND OLD.status = 'completed'
     AND NEW.status IN ('refunded', 'cancelled') THEN
    UPDATE public.event_preventas SET vendidos = vendidos - OLD.cantidad
     WHERE id = OLD.preventa_id;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tickets_track_preventa_vendidos_trg ON public.tickets;
CREATE TRIGGER tickets_track_preventa_vendidos_trg
  AFTER INSERT OR UPDATE OF status ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.tickets_track_preventa_vendidos();
```

Si una compra intentara completar más allá del cupo, el `UPDATE` de arriba choca contra
`event_preventas_cupo_valido` y aborta la transacción — el checkout (spec de LÓGICA) tiene
que reservar/verificar cupo *antes* de llegar a `completed`, no confiar en que el trigger
avise a tiempo; el trigger es la última línea de defensa, no la primera.

## Fuera de alcance (specs futuros, no bloquean este)

- **Checkout: cuál preventa está "activa" ahora mismo.** La regla pedida es "la de menor
  `orden` que siga `activa`; si no queda ninguna, se cobra el precio de puerta" — eso es
  LÓGICA (probablemente un RPC `precio_vigente_de(event_id)` para no duplicar el criterio
  en cada cliente), no DATOS.
- **Formulario para agregar/editar preventas** (botón "+ Agregar preventa", numeración
  automática, cierre manual con o sin cupo) — FRONTEND, en `sonopolisWeb` (`FormEvento.js`
  y la pantalla de edición) y en AppAll si corresponde.
- **Migrar eventos existentes con precio de puerta ya escrito a mano en la descripción del
  flyer** (mencionado en W-PENDIENTES #24) a una preventa real. No hay forma automática de
  detectar esos casos — es trabajo manual del organizador, no una migración de datos.

## Consecuencia para las apps que consumen esto

`events.tipoPrecio` es un campo nuevo en `mapEventoFromDB`/`mapEventoToDB` (sonopolisWeb) —
mismo patrón que el resto de columnas snake_case↔camelCase en `libs/mappers.js`.
`event_preventas` necesita su propio `libs/data/preventas.js` (mismo molde que
`libs/data/colaboradores.js`: `getPreventas`, `crearPreventa`, `actualizarPreventa`,
`cerrarPreventa`), consumido desde el formulario de creación/edición y desde el checkout.

> Estado: aplicado en producción (2026-09-01) —
> `20260901131000_spec_064_precio_general_puerta_y_preventas.sql` corrida contra
> `xluinfihjjtxkglihxqz`. Pendiente: LÓGICA (precio vigente en checkout) y FRONTEND
> (formulario de agregar/editar preventas) — ver "Fuera de alcance" arriba.
