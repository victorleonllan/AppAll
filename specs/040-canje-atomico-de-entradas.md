# Spec 040 — Canje atómico: `redeem_ticket_item(token)`

> Estado: **planificado el 2026-08-10, sin implementar.** Capa de comportamiento del canje:
> una función en la base y nada más. La cámara y la pantalla son el spec 041. Solo toca
> `supabase/migrations/`.

## Por qué el canje es una función y no un `UPDATE`

La operación de la puerta es "si esta entrada está válida, márcala usada y déjala pasar". Son
dos pasos —leer el estado, escribirlo— y entre uno y otro cabe otro escáner.

Ese "otro escáner" no es un caso teórico: es lo que Victor pidió explícitamente cuando dijo
que **los dos dashboards, el de la banda y el del local, tienen que tener lectura de QR**. En
la puerta de un show hay dos personas del equipo con la app abierta, y la misma foto de un QR
reenviada por WhatsApp llega a las dos filas. Si el canje se hace desde el cliente:

```typescript
// ❌ lo que NO se hace
const { data } = await supabase.from('ticket_items').select('status').eq('qr_token', t).single();
if (data.status === 'valid') {
  await supabase.from('ticket_items').update({ status: 'used' }).eq('qr_token', t);
}
```

dos lecturas simultáneas ven `valid`, las dos escriben `used`, y entran dos personas con una
entrada. El segundo `UPDATE` ni siquiera falla: escribir `used` sobre `used` es válido.

La solución no es un lock ni una transacción del cliente: es que **la condición viaje dentro
del `UPDATE`**. `WHERE ... AND status = 'valid'` hace que Postgres evalúe el estado con la
fila ya bloqueada, y el segundo escáner recibe cero filas afectadas. Cero filas es la
respuesta correcta —"esta entrada ya entró"— y no un error.

Además, `ticket_items` **no tiene policy de UPDATE** (spec 036): con RLS activa, la ausencia de
policy niega. El cliente no puede escribir esa tabla ni queriendo. La única vía es una función
`SECURITY DEFINER`, y este spec es esa función.

## La función

```sql
CREATE OR REPLACE FUNCTION public.redeem_ticket_item(p_token text)
RETURNS TABLE (
  resultado   text,
  folio       integer,
  evento_id   uuid,
  comprador   text,
  redeemed_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item   public.ticket_items%ROWTYPE;
  v_estado text;
BEGIN
  SELECT * INTO v_item FROM public.ticket_items WHERE qr_token = p_token;

  IF NOT FOUND THEN
    -- Sin fila no hay evento, y sin evento no hay contra qué autorizar. Se responde
    -- lo mismo a cualquiera: quien prueba tokens al azar no aprende si acertó el formato.
    RETURN QUERY SELECT 'no_existe'::text, NULL::integer, NULL::uuid, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- Autorización explícita: SECURITY DEFINER apaga RLS, así que el permiso se chequea acá
  -- o no se chequea en ninguna parte.
  IF NOT public.can_edit_event(v_item.evento_id) THEN
    RETURN QUERY SELECT 'sin_permiso'::text, NULL::integer, NULL::uuid, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT status INTO v_estado FROM public.events WHERE id = v_item.evento_id;
  IF v_estado = 'cancelled' THEN
    RETURN QUERY SELECT 'evento_cancelado'::text, v_item.folio, v_item.evento_id,
                        NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  -- El canje: condición y escritura en una sola sentencia.
  UPDATE public.ticket_items ti
     SET status = 'used', redeemed_at = now(), redeemed_by = auth.uid()
   WHERE ti.id = v_item.id AND ti.status = 'valid'
   RETURNING * INTO v_item;

  IF NOT FOUND THEN
    -- Perdió la carrera, o ya estaba usada/anulada. Se relee para decir cuándo entró.
    SELECT * INTO v_item FROM public.ticket_items WHERE id = v_item.id;
    RETURN QUERY SELECT
      CASE v_item.status WHEN 'used' THEN 'ya_usada' ELSE 'anulada' END,
      v_item.folio, v_item.evento_id, public.comprador_de(v_item.ticket_id), v_item.redeemed_at;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'ok'::text, v_item.folio, v_item.evento_id,
                      public.comprador_de(v_item.ticket_id), v_item.redeemed_at;
END; $$;

GRANT EXECUTE ON FUNCTION public.redeem_ticket_item(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_ticket_item(text) FROM anon, public;
```

`comprador_de(ticket_id)` es un helper `STABLE SECURITY DEFINER` que devuelve solo el
`profiles.nombre` del comprador. Existe por la misma razón que el spec 033 necesitó
`search_collaborator_candidates`: tras el spec 020, `profiles` solo expone `role='musician'`,
así que un `SELECT` normal contra el perfil de un comprador devuelve nada. Devuelve **solo el
nombre** — nunca teléfono ni email, que son las columnas que el 030 agregó y el 020 protege.

## Las cinco respuestas, y por qué ninguna es una excepción

```
ok               → entra. Verde, folio grande.
ya_usada         → NO entra. Rojo, con la hora del ingreso anterior.
anulada          → NO entra. La entrada está en 'void' (reembolso).
evento_cancelado → NO entra, y la explicación es otra: el show no va.
no_existe        → QR que no es de Sonópolis, o token inventado.
sin_permiso      → el que escanea no es del equipo de ESE evento.
```

`RAISE EXCEPTION` sería más corto de escribir y es la decisión equivocada acá: en el cliente,
una excepción de Postgres y una caída de red llegan por el mismo camino —el `error` del
`rpc()`— y son indistinguibles. En la puerta eso significa que "esta entrada ya se usó" y "no
hay señal" se ven igual, y el portero no puede saber si dejar pasar. **Un rechazo de negocio es
un resultado, no un fallo.** La única excepción que puede salir de esta función es un fallo real
de la base, y entonces sí corresponde que el cliente muestre "error de conexión".

`sin_permiso` es un resultado y no un `403` por la misma razón: el escáner que quedó abierto en
el evento de anoche tiene que poder decir "esta entrada no es de este evento / ya no tienes
acceso" en vez de un error genérico.

## Autorización: por evento, no por rol global

`can_edit_event(v_item.evento_id)` es lo que hace que cada escáner solo funcione contra **sus**
eventos. Un músico con un evento propio no puede canjear entradas del show de otro, aunque
consiga el token. Es la misma función del spec 033 que autoriza editar el evento y ver sus
ventas (spec 038): un solo criterio de "ser del equipo", en un solo lugar.

Que un `editor` pueda canjear es deliberado: el rol existe justamente para la persona que
ayuda en la puerta sin poder cancelar ni borrar el show.

⚠️ **Quedan dos huecos conocidos, y son aceptables hoy:**

1. **El equipo puede leer los `qr_token` de todas las entradas** (`ti_select` del 036) y por
   lo tanto puede canjear sin cámara, o dejar entrar a alguien sin entrada. No se cierra
   porque el equipo ya tiene el poder de decidir quién entra: es su puerta. Lo que sí queda
   es rastro — `redeemed_by` dice quién canjeó cada una.
2. **Un canje no se puede deshacer.** Si el portero escanea de más, no hay "des-canjear".
   Es intencional en este spec: revertir un ingreso es una operación con más consecuencias que
   ejecutarlo y merece su propia decisión (¿quién puede? ¿queda registro?). Ver *Fuera de
   alcance*.

## Consulta de solo lectura, para el escáner

El spec 041 necesita poder mostrar el estado de una entrada **sin canjearla** —confirmar antes
de marcar, o revisar una entrada dudosa—. Misma forma, sin escritura:

```sql
CREATE OR REPLACE FUNCTION public.peek_ticket_item(p_token text)
RETURNS TABLE (resultado text, folio integer, evento_id uuid, comprador text,
               redeemed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Idéntica a redeem_ticket_item salvo que no ejecuta el UPDATE:
  -- devuelve 'ok' si la entrada está válida y sería canjeable ahora mismo.
$$;
```

Existe por una razón concreta de la puerta: si el flujo del 041 fuera "escanear = canjear", un
escaneo accidental —el teléfono apuntando a la pantalla de alguien que pasaba— quema una
entrada sin forma de recuperarla. `peek` permite que el 041 decida su flujo (confirmar o
canjear directo) sin volver a tocar la base.

## Migración

Archivo `<timestamp>_spec_040_canje_entradas.sql`:

1. `comprador_de(uuid)` + su `REVOKE` de `anon`
2. `redeem_ticket_item(text)` + `GRANT`/`REVOKE`
3. `peek_ticket_item(text)` + `GRANT`/`REVOKE`

Sin DDL de tablas, sin datos tocados. Se puede aplicar y probar entera **por RPC directa**, sin
cámara y sin frontend — que es exactamente el motivo de separarla del 041: el canje se verifica
con `curl` antes de que exista una pantalla que pueda estar rota por su cuenta.

## Dependencias

- **Spec 036** — hard. `ticket_items`, sus estados y el `qr_token`.
- **Spec 037** — para probar con entradas reales; con una emisión manual por RPC alcanza para
  verificar la función.
- **Spec 033** — `can_edit_event()`.
- **Independiente del 038, 039 y 041** en archivos: no comparte ninguno.

## Criterio de cierre

Todo verificable por RPC, sin app:

1. Canjear una entrada `valid` devuelve `ok` con el folio y el nombre del comprador, y la fila
   queda `used` con `redeemed_at` y `redeemed_by` poblados
2. Canjearla otra vez devuelve `ya_usada` **con la hora del primer canje**, no la de ahora
3. **Dos canjes simultáneos del mismo token dan exactamente un `ok` y un `ya_usada`** — se
   prueba con dos `psql` disparando a la vez, o con dos `rpc` en paralelo desde un script
4. Un usuario que no es del equipo del evento recibe `sin_permiso` y la fila no cambia
5. Un token inexistente devuelve `no_existe` sin filtrar si el formato era correcto
6. Una entrada de un evento `cancelled` devuelve `evento_cancelado`
7. Ninguno de los seis casos anteriores llega al cliente como excepción
8. `peek_ticket_item` sobre una entrada `valid` devuelve `ok` y **la deja `valid`**

## Fuera de alcance

- **La pantalla de escaneo** — spec 041.
- **Deshacer un canje** — necesita decidir quién puede y qué rastro queda. Spec propio si en
  la operación real aparece la necesidad; hoy es especulación.
- **Anular entradas (`void`)** — el estado existe desde el 036 y sigue sin escritor. Llega con
  el reembolso.
- **Canje sin conexión.** Toda esta función vive en la base: sin internet en la puerta, no hay
  canje. Resolverlo exige tokens firmados que se validen en el dispositivo y una
  reconciliación posterior, y renuncia a la atomicidad que es el punto de este spec. Es un
  spec propio y grande; antes de escribirlo hay que saber si el wifi de los locales reales es
  un problema de verdad.
- **Estadísticas de ingreso** (ritmo de entrada, hora pico) — el dato queda en `redeemed_at`;
  leerlo es otra pantalla.
