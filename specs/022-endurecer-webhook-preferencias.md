# Spec 022 — Endurecer webhook y creación de preferencias

> **Bug encontrado al aplicar (2-sep-2026):** primera compra real de punta a punta
> (Problema 5/6/7 en `02-PROJECTS/Sonópolis Web/Investigación/como-testear-una-compra.md`)
> reveló que `webhook-mp` nunca pudo encontrar el ticket a actualizar. Este spec guardaba
> `mpData.id` (el `preference_id` real de MP) en `tickets.preference_id` y esperaba
> recuperarlo en el webhook vía `pago.preference_id ?? pago.order?.id`. Verificado contra
> un pago real aprobado: **`pago.preference_id` ya no existe** en la respuesta actual de
> `GET /v1/payments/{id}` (MP la movió/quitó al migrar por dentro a la Orders API), y
> `pago.order.id` es un id de otro concepto que nunca coincide. El `UPDATE` de tickets
> siempre matcheaba 0 filas, sin error — el webhook devolvía `200 OK` igual, así que MP
> nunca reintentaba. Esto explica por qué nunca se había completado un ticket real desde
> que este spec se cerró.
>
> **Fix (2-sep-2026):** `create-preference` genera su propia referencia
> (`crypto.randomUUID()`) *antes* de llamar a MP, la manda en `metadata.ticket_ref` de la
> preferencia (MP la devuelve tal cual en el pago) y es lo que ahora se guarda en
> `tickets.preference_id` — deja de depender de un campo que MP puede dejar de mandar sin
> avisar. `webhook-mp` lee `pago.metadata?.ticket_ref` primero, con los campos viejos como
> fallback por si un pago previo a este fix los trae. Ningún cambio de esquema — mismo
> tipo de dato en la misma columna, solo cambió qué valor se le pone.
>
> Estado: **aplicado y verificado (2026-08-13).** Migración
> `20260813054051_spec_022_endurecer_compra.sql` en producción, `create-preference` (v6) y
> `webhook-mp` (v7) desplegados con el código de este spec. Los 12 criterios de cierre
> verificados:
>
> - **1-2 (cantidad en `create-preference`):** verificados por revisión de código + `tsc`, no
>   por HTTP real — requeriría un `access_token` de sesión real, mismo bloqueo que el 021
>   (Resend, correos limitados). Pendiente de ejercitar cuando haya una compra real de punta
>   a punta.
> - **3-8 (RLS, aforo, cantidad, monto):** verificados por RPC directa contra producción
>   (transacciones con `ROLLBACK` o datos de prueba borrados después), mismo método que 036/040.
>   Incluye una prueba de concurrencia real (dos reservas simultáneas contra un cupo de 1: exactamente
>   una tuvo éxito).
> - **9 (`tsc --noEmit`):** limpio.
> - **10-12 (firma `x-signature`):** verificados con tráfico HTTP real contra el `webhook-mp`
>   desplegado — firma válida aceptada (pasó a 500 por `Payment not found`, un pago de prueba
>   que no existe, no por la firma), firma alterada y sin header ambas rechazadas con 401.
>   Confirmado en logs.
>
> **Sigue abierta la duda que el spec ya anotaba:** si el tópico `merchant_order` manda
> `x-signature` con el mismo formato — solo se puede confirmar con tráfico real de MP.
>
> No es urgente por dinero real —el token de Mercado Pago sigue siendo de prueba
> (`TESTUSER5133118553056665163`)— pero ya no bloquea pasar a producción por este lado.

## Contexto

El spec 021 cerró el camino feliz de la compra. Este spec cierra los agujeros que importan
cuando el dinero es real y alguien intenta abusar del sistema en vez de solo comprar una
entrada. `PENDIENTES.md` lo tenía anotado desde el 8-ago con cuatro puntos; el punto 2
(idempotencia) ya se resolvió al pasar por el spec 037, así que quedan tres:

1. El webhook no valida que la notificación venga de verdad de Mercado Pago.
2. `cantidad` llega del body de `create-preference` sin validar.
3. No hay límite de aforo — ni en el modelo, ni en el código.

Los tres se investigan y resuelven acá porque los tres son "¿en qué confía el servidor que
no debería?", el mismo defecto de fondo que los specs 020 y 036 ya encontraron en otras
tablas.

⚠️ **Reparto de archivos con el spec 037 (ya aplicado):** `webhook-mp/index.ts` es de los
dos. El 037 agregó la llamada a `issue_ticket_items` cuando el pago se confirma; este spec
agrega la validación de firma **antes** de esa lógica, sin tocarla. Ver el diff completo más
abajo — es un `if` nuevo al principio del handler, no una reescritura.

---

## Problema 1 — el webhook no valida el origen de la notificación

Hoy `webhook-mp` procesa cualquier `POST` que le llegue, sin comprobar que salió de
Mercado Pago. El mitigante que ya existe —nunca confiar en el payload, volver a consultar
la API de MP con el `id` recibido— reduce el riesgo real (nadie puede *inventar* un pago),
pero no lo elimina: alguien que sepa la URL del webhook puede mandar notificaciones falsas
de pagos **reales pero ajenos** (comprados por otra persona, en otro momento) y hacer que
`issue_ticket_items` se dispare para un ticket que no le pertenece a quien la mandó — no
roba nada, pero es ruido y una superficie de ataque que no hace falta dejar abierta.

### La firma

Mercado Pago manda, en el header `x-signature`, una firma HMAC-SHA256 de la notificación:

```
X-Signature: ts=1742505638683,v1=ced36ab6d33566bb1e16c125819b8d840d6b8ef136b0b9127c76064466f5229b
X-Request-Id: 2066ca19-c6f1-498a-be75-1923005edd06
```

Se valida reconstruyendo un *manifest* con datos de la propia notificación y comparando su
HMAC contra `v1`:

```
id:{data.id, en minúsculas};request-id:{x-request-id};ts:{ts};
```

`{data.id}` sale del **query string** de la URL (`?data.id=...`), no del body — Mercado
Pago lo manda ahí incluso en notificaciones `POST`. Si `data.id` o `x-request-id` no vienen
en la notificación, esa línea se omite del manifest (no se deja vacía).

### Implementación

```typescript
// webhook-mp/index.ts — nuevo, antes de cualquier otra cosa dentro de serve()
const MERCADOPAGO_WEBHOOK_SECRET = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET')!;

async function hmacSha256Hex(secret: string, mensaje: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(mensaje));
  return Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Comparación en tiempo constante: con === , un atacante puede medir cuántos
// caracteres acertó por cuánto tardó la respuesta. No es teórico para un XOR
// de 64 caracteres hexadecimales corriendo miles de veces.
function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function firmaValida(req: Request, url: URL): Promise<boolean> {
  const xSignature = req.headers.get('x-signature') ?? '';
  const xRequestId = req.headers.get('x-request-id') ?? '';
  const dataId = (url.searchParams.get('data.id') ?? '').toLowerCase();

  let ts = '', v1 = '';
  for (const parte of xSignature.split(',')) {
    const [k, v] = parte.split('=');
    if (k?.trim() === 'ts') ts = (v ?? '').trim();
    if (k?.trim() === 'v1') v1 = (v ?? '').trim();
  }
  if (!ts || !v1) return false;

  const partes: string[] = [];
  if (dataId) partes.push(`id:${dataId}`);
  if (xRequestId) partes.push(`request-id:${xRequestId}`);
  partes.push(`ts:${ts}`);

  const esperado = await hmacSha256Hex(MERCADOPAGO_WEBHOOK_SECRET, partes.join(';') + ';');
  return igualesEnTiempoConstante(esperado, v1);
}

serve(async (req) => {
  const url = new URL(req.url);

  if (!(await firmaValida(req, url))) {
    console.error('Firma x-signature inválida, notificación rechazada', { url: req.url });
    return new Response('Invalid signature', { status: 401 });
  }

  // ...el resto del handler sigue exactamente igual (spec 037 sin tocar).
});
```

`401` y no `500`: una firma inválida no es un error transitorio que valga la pena
reintentar, es una notificación que no confiamos en procesar. MP no reintenta sobre `401`,
que es lo correcto acá — reintentar una falsificación no la vuelve legítima.

⚠️ **Requiere generar y setear el secret antes de desplegar:**

```bash
# Tus integraciones → seleccionar la app → Webhooks → Configurar notificación → Revelar clave
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET=<la clave que muestra el dashboard>
```

⚠️ **Riesgo no resuelto, para probar contra tráfico real:** la documentación de Mercado
Pago describe la firma para notificaciones `order` (webhooks v2). No queda claro si el
tópico `merchant_order` —que este webhook también atiende, para compatibilidad con
integraciones más viejas— manda `x-signature` con el mismo formato o directamente no lo
manda. Si una notificación legítima de `merchant_order` llegara sin firma, este código la
rechazaría por error. **No se puede confirmar sin tráfico real de Mercado Pago**, que
todavía no existe (0 tickets en producción — spec 021). Primer punto a revisar en cuanto el
028 destrabe una compra de prueba de punta a punta.

---

## Problema 2 — `cantidad` sin validar

```typescript
// create-preference/index.ts, hoy
const { evento_id, user_id, cantidad } = await req.json();
// ...
quantity: cantidad,           // directo al ítem de la preferencia de MP
// ...
monto: evento.monto * cantidad,   // directo al ticket
```

Nada impide `cantidad: 0`, `cantidad: -5` o `cantidad: 999999`. Un valor de `0` o negativo
puede hacer que MP rechace la preferencia de forma rara (comportamiento no documentado); un
valor absurdamente alto crea una preferencia real por esa cantidad —cobrable— aunque el
local tenga 40 lugares.

### Solución

Validar antes de tocar Mercado Pago:

```typescript
const MAX_CANTIDAD_POR_COMPRA = 10;   // decisión de producto, no técnica — ver nota abajo

if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CANTIDAD_POR_COMPRA) {
  return json({
    error: 'cantidad_invalida',
    detail: `cantidad debe ser un entero entre 1 y ${MAX_CANTIDAD_POR_COMPRA}`,
  }, 400);
}
```

`MAX_CANTIDAD_POR_COMPRA = 10` es un número de partida, no un límite de negocio decidido —
sirve para que "comprar para el grupo de amigos" funcione y "vaciar el aforo de un show con
una sola llamada" no. Cambiarlo es una línea; si Victor quiere otro número, es ese el punto
a tocar.

**Esto no alcanza solo.** `create-preference` es la puerta recomendada, no la única: la
policy `tickets_insert` de hoy (`WITH CHECK (auth.uid() = user_id)`, spec 020) deja que
cualquier usuario autenticado inserte una fila en `tickets` **directo por PostgREST**, sin
pasar por esta function ni por ninguna de sus validaciones — ni ésta, ni la de aforo del
problema 3. Se cierra junto con ese problema, más abajo.

---

## Problema 3 — sin límite de aforo, y el `INSERT` directo lo esquiva igual

`venues.aforo` existe desde el spec 031 (nullable, 1-100000) y hoy no lo usa nada del flujo
de compra: se puede vender cualquier cantidad de entradas para un evento sin tope. Peor
todavía — ni siquiera alcanza con validarlo en `create-preference`, por la misma razón que
cierra el problema 2: la policy actual de `tickets` permite el `INSERT` directo, así que
cualquier control puesto solo en la Edge Function es una cortesía, no una garantía.

### La decisión de fondo: una función, no una policy con `CHECK`

Un `CHECK` declarativo no puede sumar `cantidad` de otras filas, y un `INSERT ... SELECT`
con una subconsulta de conteo tiene la misma carrera que el spec 040 ya evitó para el
canje: dos compras que llegan casi juntas pueden leer el mismo conteo y las dos pasar el
chequeo, superando el aforo entre las dos. La solución es la misma que la del spec 036 para
los folios: **la condición viaja dentro de una función que bloquea antes de contar.**

```sql
CREATE OR REPLACE FUNCTION public.reservar_ticket_pending(
  p_evento_id uuid, p_cantidad integer, p_preference_id text
) RETURNS public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_evento   public.events%ROWTYPE;
  v_aforo    integer;
  v_ocupado  integer;
  v_ticket   public.tickets%ROWTYPE;
BEGIN
  -- cantidad se revalida acá: la Edge Function ya la revisó, pero esta función
  -- es la única puerta de escritura real (ver el DROP de tickets_insert más
  -- abajo) y tiene que sostenerse sola contra una llamada directa al RPC.
  IF p_cantidad IS NULL OR p_cantidad < 1 OR p_cantidad > 10 THEN
    RAISE EXCEPTION 'cantidad_invalida: % no es válida', p_cantidad;
  END IF;

  -- Bloquea la fila del evento: dos compras del mismo evento se serializan
  -- acá, exactamente como event_folio_counters serializa la emisión de
  -- folios en el spec 036. Compras de eventos distintos no se ven entre sí.
  SELECT * INTO v_evento FROM public.events WHERE id = p_evento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento_no_existe: %', p_evento_id;
  END IF;

  SELECT v.aforo INTO v_aforo FROM public.venues v WHERE v.id = v_evento.venue_id;

  -- aforo NULL = sin tope, el comportamiento de hoy. No es un descuido: no
  -- todos los locales cargaron su aforo (spec 031), y bloquear la venta de
  -- quien no lo hizo sería peor que no tener el control.
  IF v_aforo IS NOT NULL THEN
    SELECT COALESCE(SUM(cantidad), 0) INTO v_ocupado
      FROM public.tickets
     WHERE evento_id = p_evento_id AND status IN ('pending', 'completed');

    IF v_ocupado + p_cantidad > v_aforo THEN
      RAISE EXCEPTION 'sin_cupo: quedan % de % entradas', GREATEST(v_aforo - v_ocupado, 0), v_aforo;
    END IF;
  END IF;

  -- monto se deriva del evento acá adentro, no se recibe del caller: es la
  -- misma razón por la que 021 (problema 0c) conecta precio → monto en un
  -- solo lugar. Confiar en un monto que mandó el cliente sería reabrir esa
  -- puerta con otro nombre.
  INSERT INTO public.tickets (evento_id, user_id, status, preference_id, monto, cantidad)
  VALUES (p_evento_id, auth.uid(), 'pending', p_preference_id, v_evento.monto * p_cantidad, p_cantidad)
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END; $$;

REVOKE ALL ON FUNCTION public.reservar_ticket_pending(uuid, integer, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reservar_ticket_pending(uuid, integer, text) TO authenticated;
```

`user_id` no es un parámetro — sale de `auth.uid()` adentro de la función. Pasarlo desde
afuera es la misma superficie que ya cerró `create-preference` guardando
`user.id !== user_id` (spec 021, problema 0): acá directamente no existe la posibilidad de
mandar el `user_id` de otra persona.

### Por qué se llama *después* de crear la preferencia en MP, no antes

El orden que ya tiene `create-preference` —crear la preferencia primero, insertar el
ticket después, con el `preference_id` real desde el nacimiento de la fila— se mantiene tal
cual. La alternativa (reservar el cupo antes de llamar a MP, con un `preference_id` vacío
que se completa después) evita "gastar" una preferencia de MP cuando el aforo ya se llenó,
pero exige una acción compensatoria si el `INSERT` fallara después de todo — más superficie
para un beneficio cosmético. Una preferencia de MP nunca pagada no cuesta nada real: es el
mismo argumento con el que el spec 036 decidió no devolver folios reservados.

```typescript
// create-preference/index.ts — reemplaza el .from('tickets').insert(...) actual
const { data: ticket, error: ticketError } = await supabase
  .rpc('reservar_ticket_pending', {
    p_evento_id: evento_id,
    p_cantidad: cantidad,
    p_preference_id: mpData.id,
  })
  .single();

if (ticketError) {
  const sinCupo = ticketError.message?.includes('sin_cupo');
  console.error('reservar_ticket_pending falló:', ticketError);
  return json({
    error: sinCupo ? 'sin_cupo' : 'ticket_insert_failed',
    detail: ticketError.message,
  }, sinCupo ? 409 : 500);
}
```

`409` para `sin_cupo`: no es un error del servidor, es un estado legítimo ("ya no hay
entradas") que el cliente puede mostrar como tal, no como "algo salió mal".

### RLS: cerrar la puerta directa

```sql
DROP POLICY IF EXISTS tickets_insert ON public.tickets;
-- Sin policy de INSERT: con RLS activa, ausencia de policy es negación total.
-- La única vía de escritura es reservar_ticket_pending(), SECURITY DEFINER,
-- que valida cantidad y aforo antes de insertar y toma el user_id de
-- auth.uid(), no de un parámetro. Mismo patrón que ticket_items (spec 036):
-- el default es "nadie", no "cualquiera dueño de la fila".
```

Antes de este cambio, un usuario autenticado podía llamar
`supabase.from('tickets').insert({ evento_id, user_id: auth.uid(), status: 'completed', ... })`
directo desde el cliente y saltarse el pago entero —la policy no restringía `status` ni
ningún otro campo, solo `user_id`—. Después de este cambio esa vía no existe: sin policy de
INSERT, PostgREST rechaza cualquier intento de escribir `tickets` que no pase por la
función. Es el mismo agujero de fondo que el spec 020 cerró en `tickets_update_own` — una
policy que solo miraba quién era el dueño, no qué estaba escribiendo.

---

## Migración

Archivo único `<timestamp>_spec_022_endurecer_compra.sql`:

1. `DROP POLICY tickets_insert`
2. `CREATE OR REPLACE FUNCTION reservar_ticket_pending` + `REVOKE`/`GRANT`

Sin cambios de esquema, sin backfill: no toca ninguna columna ni tabla nueva.

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `supabase/functions/webhook-mp/index.ts` | `firmaValida()` + rechazo `401` al principio del handler. El resto (spec 037) no se toca |
| `supabase/functions/create-preference/index.ts` | Valida `cantidad` (1-10) antes de llamar a MP; reemplaza el `INSERT` directo por `reservar_ticket_pending()`; traduce `sin_cupo` a `409` |
| `supabase/migrations/` | `DROP POLICY tickets_insert` + `reservar_ticket_pending()` |

## Criterio de cierre

Los problemas 2 y 3 se verifican por RPC directa, igual que 036/040 — no dependen de una
compra real:

1. Una preferencia con `cantidad: 0`, negativa o no entera es rechazada por
   `create-preference` con `400` antes de llamar a Mercado Pago
2. Una preferencia con `cantidad: 11` es rechazada con `400`
3. Un `INSERT` directo a `tickets` vía `supabase.from('tickets').insert(...)` con cualquier
   `status` es rechazado por RLS — ya no hay policy que lo permita
4. `reservar_ticket_pending` con `cantidad` fuera de 1-10 lanza excepción aunque se llame
   directo por RPC, sin pasar por `create-preference`
5. Un evento en un local con `aforo = 10`: reservar 10 entradas en total (una o varias
   llamadas) funciona; la siguiente reserva de 1 más devuelve `sin_cupo` y no inserta nada
6. Dos reservas simultáneas que juntas superan el aforo disponible dan como resultado que
   como máximo una de las dos tenga éxito — mismo mecanismo de bloqueo de fila que el
   criterio 3 del spec 040
7. Un evento en un local sin `aforo` (`NULL`) sigue vendiendo sin tope — comportamiento de
   hoy, sin cambios
8. `monto` de la fila insertada coincide con `events.monto × cantidad` aunque el caller
   mande otro valor (no aplica: la función no acepta `monto` como parámetro)
9. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio

**El problema 1 (firma) se verifica manualmente**, calculando una firma válida con el
secret configurado y mandándola por `curl` — no depende de tráfico real de MP:

10. Una notificación con `x-signature` correcta (calculada a mano con el secret) es aceptada
11. La misma notificación con el `v1` alterado en un solo carácter es rechazada con `401`
12. Una notificación sin header `x-signature` es rechazada con `401`

## Fuera de alcance

- **Aforo por sector o tipo de entrada** (general vs. VIP) — el modelo de hoy no distingue
  tipos de entrada dentro de un mismo evento; es un spec de producto propio.
- **Devolver el cupo de un ticket `pending` abandonado.** Alguien que reserva y nunca paga
  ocupa aforo hasta que el ticket pase a `cancelled`/`refunded` — hoy eso solo pasa si MP
  notifica un rechazo explícito. Un carrito que simplemente se abandona (la persona cierra
  la pestaña sin decidir) puede quedar en `pending` indefinidamente, sosteniendo el cupo sin
  usarlo. Necesita una expiración por tiempo (un `pending` de más de N minutos se considera
  vencido) que hoy no existe en ningún lado del sistema — spec propio, y afecta más que a
  este flujo.
- **Notificar al comprador que ya no hay cupo antes de llegar a pagar** (mostrar "agotado"
  en `DetalleEventoScreen` en vez de dejar que llegue al 409) — mejora de UX, no de
  seguridad; este spec garantiza que el 409 exista y sea correcto, no que nunca se vea.
- **Cambiar `MAX_CANTIDAD_POR_COMPRA`** — es una constante con un valor de partida, no una
  decisión tomada. Ajustarla es una línea de código el día que Victor decida el número real.
