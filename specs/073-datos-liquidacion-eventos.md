# Spec 073 — Liquidación de eventos: a qué cuenta se transfiere y si ya se pagó

> Estado: escrito (4-sep-2026), sin aplicar
> Capa: DATOS. Cabeza de la cadena `073 → W-081 → W-082/W-083 → W-084`.
> Pedido de Victor (sesión 4-sep-2026): "al crear el evento dieran inmediatamente los
> datos donde se transfiera el dinero… y cuando se cierre el evento, el botón de pagar".

## Contexto

El dinero de las entradas no llega a quien toca. Mercado Pago cobra contra la cuenta de
Sonópolis (Checkout Pro, spec 008/009), así que después de cada show Victor tiene que
transferir a mano al local o al artista — y hoy **no existe en ninguna parte ni la cuenta
de destino ni el registro de si ya se pagó**. Se resuelve por WhatsApp, sin rastro.

El recargo ya está resuelto y no se toca: `RECARGO_PLATAFORMA = 0.1` en
`sonopolisWeb/libs/mappers.js` (2026-08-29) hace que `montoDesdePrecio` cobre
`precio × 1,10`. **El comprador paga 10% más; el organizador recibe íntegro el precio que
puso.** Lo que falta no es cuánto, sino a dónde y si ya salió.

## Decisión: tabla aparte, no columnas en `events`

`event_payouts`, una fila por evento, **no** columnas nuevas en `events`.

**Por qué:** `events_select` (spec 033) es `status <> 'draft' OR can_edit_event(id)` — o
sea, cualquier evento publicado lo lee `anon`, que es lo que hace funcionar la Cartelera.
Un número de cuenta bancaria en esa misma fila viajaría al navegador de cualquier visitante
junto con el póster del show. RLS filtra filas, no columnas: no hay forma de publicar
`artist_name` y esconder `numero_cuenta` estando en la misma tabla. Por eso la separación
no es orden, es la única manera de que el dato no sea público.

```sql
CREATE TABLE public.event_payouts (
  event_id        uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,

  -- Datos que carga el organizador al crear el evento (W-082).
  banco           text NOT NULL,
  tipo_cuenta     text NOT NULL CHECK (tipo_cuenta IN ('corriente','vista','ahorro','rut')),
  numero_cuenta   text NOT NULL,
  titular         text NOT NULL,
  rut             text NOT NULL,
  email_contacto  text,

  -- Estado de la liquidación. Lo escribe SOLO Sonópolis (service role, W-083).
  status          text NOT NULL DEFAULT 'pendiente'
                    CHECK (status IN ('pendiente','pagado')),
  pagado_at       timestamptz,
  pagado_por      uuid REFERENCES auth.users(id),
  monto_pagado    integer,
  avisado_at      timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

**`monto_pagado` se congela al marcar pagado** en vez de recalcularse siempre: el monto
sale de sumar tickets, y una devolución posterior cambiaría el número que se muestra sobre
una transferencia que ya salió. Lo que se transfirió es un hecho histórico, no una consulta.

**`avisado_at` existe para que el correo no se repita.** Sin esa marca, el cron diario
(W-084) manda el mismo aviso todas las mañanas hasta que Victor pague.

**Los montos no se guardan acá.** Se derivan de `tickets` (W-081). Duplicarlos sería una
segunda fuente de verdad que se desincroniza con la primera devolución.

## RLS

```sql
ALTER TABLE public.event_payouts ENABLE ROW LEVEL SECURITY;

-- Lee y escribe SOLO el owner del evento. No los colaboradores admin/editor:
-- `can_edit_event` incluye a quien puede editar el póster, y una cuenta bancaria
-- no es del mismo orden que un póster (mismo criterio que el spec 033 usó para
-- separar `can_manage_team` de `can_edit_event`).
CREATE POLICY event_payouts_select ON public.event_payouts FOR SELECT
  USING (public.event_role_of(event_id) = 'owner');

CREATE POLICY event_payouts_insert ON public.event_payouts FOR INSERT
  WITH CHECK (public.event_role_of(event_id) = 'owner');

CREATE POLICY event_payouts_update ON public.event_payouts FOR UPDATE
  USING      (public.event_role_of(event_id) = 'owner')
  WITH CHECK (public.event_role_of(event_id) = 'owner');
```

Sin policy de `DELETE`: la fila se va con el evento por el `ON DELETE CASCADE`.

## El owner no puede marcarse como pagado a sí mismo

Decisión de producto de Victor en la misma sesión: **el estado lo marca solo Sonópolis**,
porque el dinero sale de la cuenta de Sonópolis y el organizador no tiene cómo saber si la
transferencia salió. Pero la policy de `UPDATE` de arriba le da al owner la fila entera.

Trigger que protege las cuatro columnas de estado, mismo molde que
`events_guard_protected_columns` (spec 033):

```sql
CREATE OR REPLACE FUNCTION public.event_payouts_guard_estado()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  -- `current_user` = 'service_role' cuando escribe el back office (W-083);
  -- cualquier sesión de usuario entra como 'authenticated'. Se usa
  -- `current_user` y no `auth.role()` por la lección del spec W-048: ahí
  -- `auth.role()` + SECURITY DEFINER anularon la guarda entera.
  IF current_user <> 'service_role' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.pagado_at IS DISTINCT FROM OLD.pagado_at
       OR NEW.pagado_por IS DISTINCT FROM OLD.pagado_por
       OR NEW.monto_pagado IS DISTINCT FROM OLD.monto_pagado THEN
      RAISE EXCEPTION 'El estado de pago lo marca Sonópolis, no el organizador';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER event_payouts_guard_estado
  BEFORE UPDATE ON public.event_payouts
  FOR EACH ROW EXECUTE FUNCTION public.event_payouts_guard_estado();
```

El `INSERT` no necesita guarda: los defaults (`'pendiente'`, nulos) son justo lo que
corresponde al crear, y un organizador que insertara `status='pagado'` de entrada se
estaría regalando un estado que nadie lee para pagarle — el back office lista por
`status='pendiente'`, así que mentir ahí solo lo saca de la cola de cobro.

## Criterios de cierre

1. `supabase db push` aplica la migración contra producción sin error.
2. Un usuario que no es owner del evento hace `select * from event_payouts` → 0 filas.
3. El owner inserta su fila y la lee.
4. El owner intenta `update event_payouts set status='pagado'` → excepción del trigger.
5. Con la service role key, ese mismo `update` pasa.

## Lo que este spec NO hace

- **No cambia lo que cobra Mercado Pago.** El 10% ya se cobra desde 2026-08-29.
- **No resta anulaciones ni devoluciones del monto.** El monto sale de `tickets` con
  `status='completed'` (W-081); una entrada anulada a nivel de `ticket_items` no descuenta.
  Queda declarado como límite, no como olvido — cuando haya una devolución real se verá qué
  hace MP con ella y saldrá un spec nuevo.
- **No soporta dividir el pago entre local y artista.** Una cuenta por evento. Si mañana
  hay que repartir, es una tabla hija de ésta y otro spec.
