# Spec 075 — El organizador reclama su pago

> Estado: escrito (4-sep-2026), sin aplicar
> Capa: DATOS. Supera el ciclo de estados que fijó el spec 073, ya aplicado.
>
> **En una frase:** que la plata de un show no entre a la cola de pagos de Victor sola,
> sino cuando el local o el músico apreta "Reclamar pago" — así Victor solo transfiere lo
> que alguien pidió, y sabe siempre a qué evento corresponde cada monto.

## Contexto

Decisión de Victor (4-sep-2026), al ver la pantalla de admin funcionando: *"que solamente
me aparezca cuánto debo si es que apretan el botón de pagar. Si no lo apretan, yo no
pondría ese dinero por pagar"*.

El spec 073 modeló dos estados: `pendiente` → `pagado`. El evento entraba a la cola solo
por haber terminado. Eso mete en la lista de "hay que transferir" plata que nadie pidió, y
Victor termina persiguiendo a organizadores que quizás ni saben que les toca cobrar.

Con el reclamo de por medio:

- Victor transfiere **solo lo que alguien pidió**, y contra una cuenta que el organizador
  confirmó recién, no una cargada hace meses.
- El reclamo es la constancia de que el organizador sabe que ese dinero es suyo.
- Un evento que terminó y nadie reclamó no desaparece: aparece en la pantalla de admin
  como aviso, no como deuda a transferir.

## El ciclo pasa a tener tres estados

```
pendiente  ──(el organizador reclama)──▶  reclamado  ──(Victor transfiere)──▶  pagado
```

```sql
ALTER TABLE public.event_payouts DROP CONSTRAINT IF EXISTS event_payouts_status_check;
ALTER TABLE public.event_payouts ADD CONSTRAINT event_payouts_status_check
  CHECK (status IN ('pendiente','reclamado','pagado'));

ALTER TABLE public.event_payouts ADD COLUMN IF NOT EXISTS reclamado_at timestamptz;
```

**`reclamado_at` aparte del `status`** por lo mismo que `pagado_at`: el estado dice dónde
está, la fecha dice cuándo pasó. Sirve para saber cuánto lleva esperando un reclamo sin
responder — que es el reproche que un local va a hacer.

`monto_pagado` no cambia: se sigue congelando al **pagar**, no al reclamar. Entre el
reclamo y la transferencia el monto no debería moverse (el show ya pasó), pero si algo lo
mueve, lo que vale como registro es lo que efectivamente se transfirió.

## `reclamar_pago_evento(p_event)`

```sql
CREATE OR REPLACE FUNCTION public.reclamar_pago_evento(p_event uuid)
RETURNS public.event_payouts LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public AS $$
DECLARE fila public.event_payouts; ev public.events;
BEGIN
  -- Solo el owner del evento reclama. Ni los colaboradores admin/editor: es
  -- plata, y el mismo criterio con que el spec 073 dejó la cuenta bancaria
  -- fuera del alcance de quien puede editar el póster.
  IF public.event_role_of(p_event) <> 'owner' THEN
    RAISE EXCEPTION 'Solo el dueño del evento puede reclamar el pago';
  END IF;

  SELECT * INTO ev FROM public.events WHERE id = p_event;

  -- No se reclama un show que no ocurrió: hasta que termine se pueden vender
  -- más entradas, así que el monto todavía no es final.
  IF ev.comienza_at IS NULL OR ev.comienza_at > now() THEN
    RAISE EXCEPTION 'El show todavía no termina';
  END IF;

  SELECT * INTO fila FROM public.event_payouts WHERE event_id = p_event;
  IF fila.event_id IS NULL THEN
    RAISE EXCEPTION 'Faltan los datos bancarios del evento';
  END IF;

  -- Idempotente, y no pisa un pago ya hecho: reclamar dos veces no reabre nada.
  IF fila.status <> 'pendiente' THEN
    RETURN fila;
  END IF;

  UPDATE public.event_payouts
     SET status = 'reclamado', reclamado_at = now()
   WHERE event_id = p_event
  RETURNING * INTO fila;
  RETURN fila;
END $$;
```

## El trigger de guarda vuelve a ajustarse

`event_payouts_guard_estado` protege `status` de todo el que no sea admin o service role
(specs 073 y 074). El reclamo lo hace el **owner**, así que sin tocar el trigger la función
de arriba fallaría.

No se abre `status` entero al owner — eso lo dejaría marcarse `pagado` a sí mismo, que es
justo lo que el spec 073 fue a impedir. Se abre **solo la transición
`pendiente → reclamado`**:

```sql
CREATE OR REPLACE FUNCTION public.event_payouts_guard_estado()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user <> 'service_role' AND NOT public.es_admin() THEN

    -- La única transición que puede hacer un usuario común: reclamar lo suyo.
    -- Cualquier otro cambio de estado, y cualquier toque a las columnas de
    -- pago, sigue bloqueado.
    IF NOT (OLD.status = 'pendiente' AND NEW.status = 'reclamado'
            AND public.event_role_of(NEW.event_id) = 'owner') THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'El estado de pago lo marca Sonópolis, no el organizador';
      END IF;
    END IF;

    IF NEW.pagado_at    IS DISTINCT FROM OLD.pagado_at
       OR NEW.pagado_por   IS DISTINCT FROM OLD.pagado_por
       OR NEW.monto_pagado IS DISTINCT FROM OLD.monto_pagado THEN
      RAISE EXCEPTION 'El estado de pago lo marca Sonópolis, no el organizador';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;
```

`marcar_pago_evento` (spec 074) pasa a exigir que el evento esté `reclamado`: pagar algo
que nadie pidió es justo lo que este spec vino a evitar.

## Criterios de cierre

1. `supabase db push` aplica sin error y las filas existentes siguen en `pendiente`.
2. El owner de un evento **ya terminado** llama a `reclamar_pago_evento` → pasa a
   `reclamado` con su fecha.
3. El mismo owner sobre un evento **futuro** → excepción "El show todavía no termina".
4. Un colaborador `editor` del evento → excepción "Solo el dueño".
5. El owner intenta `update … set status='pagado'` a mano → excepción del trigger.
6. `marcar_pago_evento` sobre un evento en `pendiente` → excepción; sobre uno `reclamado` →
   lo paga.

## Lo que este spec NO hace

- **No pone plazo ni vencimiento al reclamo.** Un evento que nadie reclama queda
  `pendiente` para siempre y aparece como aviso en la pantalla de admin. Si algún día hace
  falta "a los 60 días se paga igual" o "caduca", es otro spec y otra decisión de negocio.
- No avisa al organizador que tiene plata para reclamar. Ese correo no existe todavía.
