# Spec 037 — Emisión: las entradas nacen cuando Mercado Pago confirma el pago

> Estado: **desplegado a producción el 2026-08-11** (migración
> `20260811051330_spec_037_backfill_entradas.sql` + `webhook-mp` versión 5). El cambio a
> `webhook-mp/index.ts` sigue el diseño de este documento con un ajuste: el `UPDATE` de
> `tickets` en el código real devuelve un arreglo (`.select('id')`, sin `.single()`), no una
> fila — la emisión itera ese arreglo en vez de asumir una sola fila, porque `.single()`
> habría introducido un modo de fallo nuevo (error si el `UPDATE` afecta 0 filas) que el
> código original no tenía.
>
> **Verificado:**
>
> - Criterio 6 (backfill sobre la base actual): corrió sin error, 0 filas creadas — coincide
>   con las 0 compras `completed` en producción, confirmado por consulta directa.
> - Criterio 7 (desplegado = repo): el body de la función vía Management API contiene la
>   llamada a `issue_ticket_items` y el manejo de `emitErr` tal como quedó en el repo.
> - La función `issue_ticket_items` que este spec invoca ya tiene sus propios criterios 1-4
>   verificados por RPC directa (spec 036); este spec no repite esa prueba, solo confirma
>   que el webhook la llama con los argumentos correctos.
>
> **Sin verificar — criterios 1, 2, 3 y 5 de punta a punta**: piden que una notificación real
> de Mercado Pago llegue al webhook desplegado, lo que depende del spec 021 (flujo de compra
> cerrado) y el 028 (correo, para no agotar el tope de magic links). Mismo bloqueo que
> arrastran 036 y 038 — no es un hueco de este spec, es el estado general del proyecto (ver
> `specs/README.md`).

## Contexto

El spec 036 deja `ticket_items` y la función `issue_ticket_items(p_ticket)` en la base, pero
**nadie la llama**. Este spec conecta el único evento del sistema que significa "esta persona
pagó" con la creación de sus entradas.

Ese evento ocurre en un solo lugar. `webhook-mp/index.ts` recibe la notificación de Mercado
Pago, vuelve a consultar la orden contra la API de MP (no confía en el payload) y traduce el
estado con el mapa `ESTADO_MP`:

```typescript
const ESTADO_MP: Record<string, 'completed' | 'cancelled' | 'refunded'> = {
  approved: 'completed',  paid: 'completed',
  rejected: 'cancelled',  cancelled: 'cancelled',
  refunded: 'refunded',   charged_back: 'refunded',
};
// pending, in_process y authorized no aparecen: el ticket se queda en 'pending'.
```

La transición a `completed` es el único punto del sistema donde el dinero pasa a ser cierto.
Todo lo demás —la preferencia, el redirect, el polling de la pantalla de confirmación— es
optimismo del cliente.

## La decisión: emitir al confirmar, no al crear la preferencia

`create-preference` ya inserta la fila de `tickets` en `pending` antes de mandar al comprador
a Mercado Pago. Se podrían emitir los `ticket_items` ahí mismo, en estado `valid`, y ahorrarse
este spec. No se hace, por tres razones:

1. **Un `pending` que nunca se paga quemaría folios.** El contador de folios del 036 no
   devuelve números. Cada carrito abandonado dejaría un hueco en la numeración visible del
   evento, y los huecos en una lista de entradas se leen como entradas perdidas.
2. **Una entrada emitida es un QR que existe.** Si se emite en `pending`, hay un instante en
   que un comprador tiene un código válido sin haber pagado. Cerrarlo requeriría que el
   escáner además verifique el estado del pago en cada lectura: complejidad en el camino
   caliente de la puerta para resolver algo que el orden de emisión resuelve gratis.
3. **El estado de puerta y el estado de pago se mantienen ortogonales**, que es la premisa
   del 036. Si la entrada solo existe cuando el pago está confirmado, `ticket_items.status`
   nunca tiene que consultar a `tickets.status` para decidir si dejar entrar.

El costo aceptado: entre el pago y la llegada del webhook hay una ventana —segundos, a veces
minutos si MP reintenta— en la que el comprador pagó y todavía no tiene QR. La pantalla de
confirmación ya hace polling cada 3 s (spec 021), así que la UI ya sabe esperar. Lo que sí
hace falta es que el dashboard del evento (spec 039) distinga "compra pagada sin entradas
emitidas" de "compra sin pagar": son dos filas muy distintas y hoy se verían igual.

## El cambio

```typescript
// webhook-mp/index.ts — después del UPDATE que deja el ticket en su estado final
const nuevoEstado = ESTADO_MP[estadoMp];

const { data: ticket, error: updErr } = await supabase
  .from('tickets')
  .update({ status: nuevoEstado, payment_id: paymentId })
  .eq('preference_id', preferenceId)
  .select('id, status')
  .single();

if (updErr) { /* ...manejo actual... */ }

// Emitir las entradas es parte de confirmar el pago, no un paso posterior opcional.
if (nuevoEstado === 'completed' && ticket) {
  const { data: emitidas, error: emitErr } =
    await supabase.rpc('issue_ticket_items', { p_ticket: ticket.id });

  if (emitErr) {
    // El pago SÍ está confirmado y el ticket ya quedó 'completed'. No revertimos:
    // devolvemos 500 para que MP reintente la notificación, y la reentrada completa
    // lo que falte (issue_ticket_items emite cantidad - ya_emitidas).
    console.error('issue_ticket_items falló', ticket.id, emitErr);
    return new Response('emision_fallida', { status: 500 });
  }
  console.log(`Ticket ${ticket.id}: ${emitidas} entradas emitidas`);
}
```

Tres detalles que no son estilo:

- **El `500` es intencional.** El webhook devuelve `200` a casi todo justamente para que MP
  no reintente ruido. Acá es al revés: el pago quedó registrado y las entradas no, que es el
  peor estado posible del sistema —el comprador pagó y no puede entrar—. El reintento de MP
  es el mecanismo de reparación que ya existe y es gratis usarlo.
- **No se revierte el `UPDATE` a `completed`.** El pago ocurrió; borrar el hecho para que la
  reentrada sea "limpia" sería falsear la contabilidad para simplificar el código. La
  reentrada converge igual porque `issue_ticket_items` emite la diferencia, no el total.
- **`supabase` acá es el cliente con `SERVICE_ROLE_KEY`.** Es lo que le permite invocar una
  función a la que el spec 036 le revocó el `EXECUTE` a `anon` y `authenticated`. Si esta
  llamada se intentara desde el cliente de la app, fallaría — y así tiene que ser.

## La guarda de idempotencia, y por qué se la sacamos al spec 022

`PENDIENTES.md`, spec 022, punto 2:

> Sin guarda de idempotencia. MP reenvía notificaciones; hoy el `update` es idempotente por
> casualidad, no por diseño.

Mientras el webhook solo hacía un `UPDATE` de estado, "por casualidad" alcanzaba: escribir
`completed` dos veces da el mismo resultado. Con la emisión adentro deja de alcanzar —una
segunda entrega crearía un segundo juego de entradas para la misma compra— así que la guarda
pasa a ser requisito de **este** spec, no del 022.

Y la guarda no es un flag nuevo: es el `SELECT ... FOR UPDATE` sobre la fila de `tickets` que
ya está dentro de `issue_ticket_items` (spec 036). Dos entregas simultáneas se serializan en
ese lock y la segunda ve el conteo que dejó la primera, así que devuelve `0`. La idempotencia
vive en la base, que es el único lugar donde dos invocaciones concurrentes se pueden ver.

⚠️ **El spec 022 queda reducido a dos puntos**, y hay que anotarlo ahí para que quien lo
implemente no vuelva a tocar `webhook-mp/index.ts` creyendo que la idempotencia sigue abierta:

| Punto original del 022 | Dónde queda |
|---|---|
| 1. Validar la firma `x-signature` de MP | Sigue en el 022 |
| 2. Guarda de idempotencia | **Resuelto acá** (036 + 037) |
| 3. `cantidad` sin validar | Sigue en el 022 |
| 4. Sin límite de aforo | Sigue en el 022 |

Los puntos 3 y 4 viven en `create-preference`, que este spec no toca. Es el corte que permite
que el 022 y el 037 avancen sin pisarse: **este spec es dueño de `webhook-mp/index.ts`, el 022
es dueño de `create-preference/index.ts`.**

## Backfill

Migración aparte, `<timestamp>_spec_037_backfill_entradas.sql`:

```sql
-- Toda compra ya confirmada que no tenga entradas emitidas. Hoy son 0 filas: el flujo
-- de compra nunca se cerró de punta a punta. Va igual porque el spec 021 puede cerrarlo
-- antes de que este se aplique, y entonces habría compras pagadas sin entrada.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.id FROM public.tickets t
     WHERE t.status = 'completed'
       AND NOT EXISTS (SELECT 1 FROM public.ticket_items ti WHERE ti.ticket_id = t.id)
  LOOP
    PERFORM public.issue_ticket_items(r.id);
  END LOOP;
END $$;
```

El bucle en vez de una sola sentencia es porque `issue_ticket_items` reserva folios fila por
fila; ese es justamente el mecanismo que garantiza que no se repitan.

Correrlo es idempotente: una segunda aplicación no encuentra compras sin entradas.

## Despliegue — las tres capas

El spec no está hecho hasta que las tres coinciden (`CLAUDE.md`, *Tres estados que se
desincronizan*). En orden, porque el orden importa:

1. `supabase db push` — la migración del 036 tiene que estar aplicada **antes** de desplegar
   la función, o el `rpc` falla con "función no existe" en cada notificación de MP
2. `supabase functions deploy webhook-mp`
3. `supabase functions list` / `get_edge_function` por MCP para confirmar que lo desplegado
   es lo del repo — el 8-ago `webhook-mp` corría código de nueve días antes

## Dependencias

- **Spec 036** — hard y estricta: sin `issue_ticket_items` en la base, este spec no tiene
  qué llamar. Desplegar la función antes que la migración rompe el webhook en producción.
- **Spec 021 (cerrar flujo de compra)** — no bloquea implementar, **sí bloquea verificar de
  punta a punta**. Sin una compra que llegue a `completed` no hay forma de ver una emisión
  real; el criterio de cierre incluye por eso una verificación por RPC directa.
- **Spec 028 (Resend)** — mismo caso que el 021: el magic link es el único camino de compra y
  el tope de 2 correos/hora ya rompió una sesión de pruebas.
- **Spec 029 (correo de confirmación)** — cuando llegue, el correo debería adjuntar o enlazar
  las entradas emitidas. Este spec deja el dato listo; el correo es del 029.

## Criterio de cierre

1. Una compra que pasa a `completed` por el webhook deja exactamente `cantidad` filas en
   `ticket_items`
2. Reenviar la misma notificación de MP (se puede forzar desde el panel de MP) no crea
   entradas nuevas ni cambia las existentes
3. Una compra que queda en `pending`, `cancelled` o `refunded` **no** tiene entradas
4. Si `issue_ticket_items` falla, el webhook responde `500` y el log deja el `ticket.id`
5. Los logs de la Edge Function muestran la línea `N entradas emitidas` con el `N` correcto
6. El backfill sobre la base actual corre sin error y no crea nada (0 compras `completed`)
7. `get_edge_function` por MCP devuelve el código con la llamada al `rpc` — desplegado, no
   solo commiteado

## Fuera de alcance

- **Validar la firma `x-signature`** — spec 022, punto 1.
- **Validar `cantidad` y controlar aforo** — spec 022, puntos 3 y 4, en `create-preference`.
- **Anular entradas al reembolsar** — hoy un `refunded` deja las entradas `valid`. Necesita
  escribir `void`, que el 036 dejó reservado sin escritor, y decidir qué pasa si la persona
  ya entró. Es del spec de reembolsos, con la API de refunds de MP.
- **Mandar las entradas por correo** — spec 029, bloqueado por el 028.
- **Reemitir una entrada perdida** (regenerar el token) — el trigger del 036 lo impide a
  propósito. Cuando haga falta, es una función de anular+emitir, no un `UPDATE`.
