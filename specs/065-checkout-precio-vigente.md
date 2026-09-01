# Spec 065 — El checkout cobra el precio vigente, sin decidirlo él

**Capa: LÓGICA · `supabase/migrations/` + `supabase/functions/create-preference/` ·
Depende de: spec 064 (`tipo_precio`, `event_preventas`), spec 046 (`_reservar_ticket_shared`)
· Pedido desde el vault, sesión 2026-09-01**

## Motivo

Pedido explícito de Victor: *"El checkout debería simplemente mandar el valor del ticket
que corresponde solamente. No debería haber una complejidad en Mercado Pago."* — la lógica
de qué precio aplica (general vs. puerta vs. cuál preventa sigue activa) no puede vivir en
`create-preference` (TypeScript, Edge Function) ni en el llamado a la API de Mercado Pago.
Tiene que resolverse en un solo lugar, en Postgres, y todo lo demás solo lee el número ya
resuelto.

Hoy no es así: `create-preference/index.ts` línea 74 arma la preferencia de MP con
`unit_price: evento.monto` — **el precio base crudo, siempre**, ignorando `tipo_precio` y
cualquier preventa. La reserva del ticket (`reservar_ticket_pending`, línea 113-119) corre
**después**, y por dentro también usa `v_evento.monto` sin mirar preventas (spec 046). Con
el spec 064 aplicado esto ya es incorrecto para cualquier evento con preventa: MP cobraría
siempre el precio de puerta.

## RPC nuevo: `precio_vigente_de(evento_id)`

Única fuente de verdad de "cuánto se cobra ahora mismo". La regla es la que Victor definió
en el pendiente #24 (sonopolisWeb): si el precio base es `general`, ese es el precio. Si es
`puerta`, cobra la preventa de menor `orden` que siga `activa` y con cupo disponible; si no
queda ninguna, recién ahí cobra el precio de puerta.

```sql
CREATE OR REPLACE FUNCTION public.precio_vigente_de(p_evento_id uuid)
RETURNS TABLE (precio text, monto integer, preventa_id uuid, preventa_nombre text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_evento    public.events%ROWTYPE;
  v_preventa  public.event_preventas%ROWTYPE;
BEGIN
  SELECT * INTO v_evento FROM public.events WHERE id = p_evento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_existe: %', p_evento_id;
  END IF;

  IF v_evento.tipo_precio = 'puerta' THEN
    SELECT * INTO v_preventa
      FROM public.event_preventas
     WHERE event_id = p_evento_id
       AND activa = true
       AND (cupo IS NULL OR vendidos < cupo)
     ORDER BY orden
     LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_preventa.precio, v_preventa.monto, v_preventa.id, v_preventa.nombre;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT v_evento.precio, v_evento.monto, NULL::uuid, NULL::text;
END; $$;

REVOKE ALL ON FUNCTION public.precio_vigente_de(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.precio_vigente_de(uuid) TO anon, authenticated;
```

`STABLE`, no `VOLATILE`: solo lee, no reserva nada — por eso no toma lock. Es una
*cotización*, no una garantía; la garantía real sigue siendo `_reservar_ticket_shared` (ver
abajo), que sí bloquea la fila antes de comprometerse. `GRANT` a `anon` porque el guest
checkout (spec 046) también necesita cotizar sin sesión — mismo criterio que `events_select`
(público).

## `_reservar_ticket_shared` deja de mirar `v_evento.monto` directo

La única puerta de escritura de tickets (spec 022/046) pasa a resolver el precio con el
mismo criterio que `precio_vigente_de`, pero con lock — evita la carrera de dos compras
simultáneas agotando la misma preventa:

```sql
-- dentro de _reservar_ticket_shared, después de cargar v_evento y antes del INSERT:

DECLARE
  v_preventa     public.event_preventas%ROWTYPE;
  v_hay_preventa boolean := false;  -- no confiar en FOUND: la última sentencia antes
                                     -- de este bloque puede ser un SELECT sin relación
                                     -- (el aforo del venue) que lo dejara en true igual
  v_monto        integer;
  v_preventa_id  uuid;
BEGIN
  ...
  IF v_evento.tipo_precio = 'puerta' THEN
    SELECT * INTO v_preventa
      FROM public.event_preventas
     WHERE event_id = p_evento_id AND activa = true
       AND (cupo IS NULL OR vendidos < cupo)
     ORDER BY orden
     LIMIT 1
     FOR UPDATE;
    v_hay_preventa := FOUND;
  END IF;

  IF v_hay_preventa THEN
    IF v_preventa.cupo IS NOT NULL AND v_preventa.vendidos + p_cantidad > v_preventa.cupo THEN
      RAISE EXCEPTION 'sin_cupo_preventa: quedan % entradas en %',
        v_preventa.cupo - v_preventa.vendidos, v_preventa.nombre;
    END IF;
    v_monto := v_preventa.monto * p_cantidad;
    v_preventa_id := v_preventa.id;
  ELSE
    v_monto := v_evento.monto * p_cantidad;
    v_preventa_id := NULL;
  END IF;

  INSERT INTO public.tickets (evento_id, user_id, guest_email, status, preference_id,
                               monto, cantidad, preventa_id)
  VALUES (p_evento_id, p_user_id, p_guest_email, 'pending', p_preference_id,
          v_monto, p_cantidad, v_preventa_id)
  RETURNING * INTO v_ticket;
```

Compra de más cantidad que cupo restante en esa preventa: rechaza (`sin_cupo_preventa`),
igual que el aforo del venue rechaza en vez de partir la compra entre dos precios — no hay
"3 a precio preventa + 2 a precio puerta" en un mismo ticket.

`tickets.preventa_id` (spec 064) queda escrito acá, y el trigger
`tickets_track_preventa_vendidos_trg` (también spec 064) se dispara solo cuando el ticket
pase a `completed` — nada de esto lo toca esta migración.

## `create-preference`: pasa a ser un relay, no una decisión

Cambia una sola línea de intención: en vez de leer `evento.monto`, la Edge Function pide la
cotización al RPC y usa ese número. Cero ramas de `tipo_precio` ni de preventas en
TypeScript:

```ts
// después de cargar `evento`, antes de armar `preference`:
const { data: cotizacion, error: cotizError } = await supabase
  .rpc('precio_vigente_de', { p_evento_id: evento_id })
  .single();

if (cotizError || !cotizacion) {
  return json({ error: 'precio_no_disponible', detail: cotizError?.message }, 500);
}

// preference.items[0].unit_price: cotizacion.monto   (antes: evento.monto)
```

El resto de `create-preference` no cambia: sigue creando la preferencia en MP con ese
`unit_price`, y sigue llamando a `reservar_ticket_pending` después para comprometer la
venta de verdad — ahí es donde el precio se recalcula con lock y puede diferir en el peor
caso (la preventa se agotó en el medio), mismo patrón de "cotizar liviano, comprometer con
lock" que ya usa el aforo del venue.

## Fuera de alcance

- **Mostrar en pantalla qué preventa está vigente antes de comprar.** Este spec resuelve el
  cobro; que la ficha del evento muestre "Preventa 2 — $4.000" en vez del precio de puerta
  es FRONTEND (sonopolisWeb), consume `precio_vigente_de` igual que el checkout.
- **Formulario para agregar/editar preventas.** Sigue pendiente, spec de FRONTEND aparte
  (ver `sonopolisWeb/specs/W-PENDIENTES.md` #24).
- **Webhook de MP (`webhook-mp`) no se toca.** Ya marca el ticket `completed` por
  `preference_id`/`external_reference`, sin mirar precio — no tiene nada que saber de
  preventas, el monto ya quedó fijo en `tickets.monto` al reservar.

> Estado: aplicado en producción (2026-09-01) —
> `20260901131733_spec_065_checkout_precio_vigente.sql` corrida contra `xluinfihjjtxkglihxqz`,
> `create-preference` redesplegada (`supabase functions deploy`). Verificado con
> `pg_get_functiondef` que lo aplicado en remoto coincide byte a byte con el archivo.
>
> **Bug encontrado al escribir la migración**: la primera versión de `_reservar_ticket_shared`
> usaba `IF FOUND THEN` después del bloque de preventa, pero `FOUND` refleja la última
> sentencia ejecutada — con `tipo_precio = 'general'` esa sentencia era el `SELECT` de aforo
> del venue (que casi siempre encuentra fila), así que `FOUND` podía quedar en `true` sin que
> `v_preventa` tuviera datos reales, rompiendo el monto de cualquier evento sin preventa.
> Corregido antes de aplicar con una variable propia `v_hay_preventa` asignada explícitamente
> justo después del `SELECT` de la preventa — nunca llegó a producción con el bug.
