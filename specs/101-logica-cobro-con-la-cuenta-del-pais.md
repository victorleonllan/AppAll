# Spec 101 — Mercado Pago cobra con la cuenta y la moneda del país del evento

> Estado: **propuesto** (22-sep-2026).
> Capa: LÓGICA. `supabase/functions/_shared/cuentasMP.ts` (nuevo),
> `supabase/functions/create-preference/index.ts`, `supabase/functions/webhook-mp/index.ts`,
> `supabase/functions/confirm-payment/index.ts`.
> Depende de: spec 100 (`paises_cobro`, `tickets.pais_cobro`, `precio_vigente_de` con
> `moneda` y `se_vende`). **No se despliega antes de que el 100 esté en producción.**
> Hermano de: `sonopolisWeb/specs/w167-logica-monto-con-moneda.md` (traduce el error nuevo).

> **En una frase:** las cuatro Edge Functions de pago asumen una sola cuenta de Mercado Pago
> y una sola moneda; este spec hace que `create-preference` cobre en la moneda del evento con
> la cuenta de su país, y que el webhook y la confirmación le pregunten el estado del pago a
> esa misma cuenta.

## El problema

Una sola constante gobierna todo el cobro: `MERCADOPAGO_ACCESS_TOKEN`, leída en
`create-preference`, `webhook-mp` y `confirm-payment`. Con una segunda cuenta aparecen tres
fallas, no una:

1. **Crear el cobro.** `create-preference/index.ts:111` manda `currency_id: 'CLP'` fijo, y
   con el token chileno. Un evento mexicano se cobra en CLP en la cuenta chilena.
2. **Recibir el aviso.** `webhook-mp` hace `GET /v1/payments/{id}` con el token chileno. Un
   pago de la cuenta mexicana **no existe** para ese token: MP responde 404, el webhook
   devuelve 500, MP reintenta, y el ticket nunca pasa a `completed`. Además la firma
   `x-signature` se valida con `MERCADOPAGO_WEBHOOK_SECRET`, que es **por aplicación de MP**:
   la notificación de la cuenta mexicana viene firmada con otro secreto y se rechaza con 401.
3. **Confirmar a mano.** `confirm-payment` busca el pago con
   `/v1/payments/search?external_reference=…` usando el token chileno: tampoco lo encuentra.
   `reconciliar-pagos` depende de `confirm-payment`, así que cancelaría a los 30 minutos un
   ticket mexicano **que sí se pagó**.

La 3 es la peligrosa: el comprador paga, la entrada se cancela y el cupo se revende.

## Decisión 1 — las credenciales por país viven en un solo archivo

`supabase/functions/_shared/cuentasMP.ts`:

```ts
// Una cuenta de Mercado Pago por país (spec 101). El catálogo de qué país cobra y en
// qué moneda vive en la base (`paises_cobro`, spec 100); acá solo están los secretos,
// que no pueden vivir en la base.
//
// Chile conserva los nombres sin sufijo: son los que ya están cargados en producción, y
// renombrarlos obligaría a un despliegue coordinado sin ganar nada.
const SECRETOS: Record<string, { token?: string; webhookSecret?: string }> = {
  CL: {
    token: Deno.env.get('MERCADOPAGO_ACCESS_TOKEN'),
    webhookSecret: Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET'),
  },
  MX: {
    token: Deno.env.get('MERCADOPAGO_ACCESS_TOKEN_MX'),
    webhookSecret: Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET_MX'),
  },
};

export function cuentaMP(pais: string) {
  const c = SECRETOS[pais];
  if (!c?.token || !c?.webhookSecret) {
    throw new Error(`cuenta_mp_no_configurada: ${pais}`);
  }
  return { pais, token: c.token, webhookSecret: c.webhookSecret };
}
```

`throw` y no un fallback a Chile: cobrar con la cuenta equivocada es exactamente el bug que
este spec cierra. Un país activo en `paises_cobro` sin secrets cargados tiene que fallar
ruidoso.

Por qué un `_shared/` y no copiar el mapa en cada function (como hoy se copia `mpGet`): este
mapa es lo que decide a qué cuenta va el dinero, y tres copias son tres lugares donde un día
queda uno distinto. La CLI de Supabase empaqueta las importaciones relativas al desplegar.

## Decisión 2 — `create-preference` relaya moneda y elige cuenta

Después de `precio_vigente_de` (que desde el spec 100 devuelve `moneda` y `se_vende`):

```ts
if (!cotizacion.se_vende) {
  return json({ error: 'pais_sin_cobro', pais: evento.pais }, 409);
}
const cuenta = cuentaMP(evento.pais);
```

Y en la preferencia:

- `currency_id: cotizacion.moneda` en vez de `'CLP'`.
- `Authorization: Bearer ${cuenta.token}` en el `POST /checkout/preferences`.
- `notification_url: \`${SUPABASE_URL}/functions/v1/webhook-mp?cuenta=${cuenta.pais}\``.

El chequeo va **antes** de crear la preferencia en MP: si se dejara solo a la reserva (que
también lo valida, spec 100 D6), quedaría creada en MP una preferencia cobrable sin ticket.

Después de `reservar_ticket_pending`, una verificación barata: si
`ticket.pais_cobro !== cuenta.pais` (el evento cambió de país entre las dos llamadas),
responder 500 `cuenta_inconsistente`. El ticket queda `pending` y caduca solo a los 30
minutos (spec 088); el checkout de MP caduca a la misma hora. No se cancela a mano para no
duplicar la lógica del 088.

## Decisión 3 — el webhook sabe de qué cuenta viene por la URL

`notification_url` lleva `?cuenta=MX` (o `CL`). MP agrega sus propios parámetros
(`data.id`, `type`) a esa URL, así que `webhook-mp` lee:

```ts
const pais = url.searchParams.get('cuenta') ?? 'CL';
const cuenta = cuentaMP(pais);
```

- **`?? 'CL'`** porque las preferencias creadas antes de este despliegue no llevan el
  parámetro, y MP notifica sobre ellas días después (reembolsos, contracargos). Todas son
  chilenas.
- La firma se valida con `cuenta.webhookSecret` y el `GET` a MP con `cuenta.token`.

¿Puede alguien mandar `?cuenta=MX` con una notificación falsa? Tendría que firmarla con el
secreto de la aplicación mexicana. Si firma con el chileno, la validación contra el mexicano
falla y responde 401. El parámetro elige **qué secreto se exige**, no si se exige.

Un valor de `cuenta` desconocido (`?cuenta=XX`) hace que `cuentaMP` lance: responder **401**,
no 500, para que MP no reintente algo que nunca va a validar.

## Decisión 4 — `confirm-payment` pregunta con la cuenta del ticket

Agregar `pais_cobro` al `select` del ticket y usar `cuentaMP(ticket.pais_cobro).token` en
`mpGet`. `mpGet` pasa a recibir el token como argumento en vez de leer la constante del
módulo.

Se usa `tickets.pais_cobro` y no `events.pais` porque el ticket guarda qué cuenta **creó** la
preferencia; el evento puede haberse editado después (spec 100, D4).

`reconciliar-pagos` no cambia: no llama a MP, solo a `confirm-payment`. Verificarlo al
implementar (`rg api.mercadopago supabase/functions/reconciliar-pagos` debe dar cero).

## Decisión 5 — medios de pago: igual en los dos países

La exclusión de `ticket` y `atm` (spec 072) se mantiene para México. En México eso deja fuera
**OXXO**, que es un medio de pago muy usado, pero la razón del 072 aplica igual: se aprueba
horas después y la reserva vence a los 30 minutos (spec 088), así que un pago en OXXO podría
caer sobre un cupo ya revendido. Si se quiere OXXO, es un spec propio que primero cambie la
caducidad de la reserva para ese medio.

## Configuración (Victor, cuando exista la cuenta mexicana)

```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN_MX=APP_USR-… MERCADOPAGO_WEBHOOK_SECRET_MX=…
```

Con el token, verificar antes de cargarlo que es de la cuenta correcta:
`GET https://api.mercadopago.com/users/me` → `site_id: "MLM"` (México) y
`country_id: "MX"`. Mismo procedimiento que el token chileno el 4-sep-2026.

**Sin estos secrets el spec se despliega igual y no rompe nada:** México está
`activo = false` en `paises_cobro`, así que `create-preference` responde 409 antes de llegar
a `cuentaMP('MX')`.

## Orden de despliegue

1. Spec 100 aplicado en producción.
2. Desplegar las tres functions: `supabase functions deploy create-preference webhook-mp
   confirm-payment`.
3. Una compra chilena real de punta a punta (criterio 1) **antes** de dar el spec por
   cerrado.

## Criterios de aceptación

1. Una compra chilena real: la preferencia sale con `currency_id: 'CLP'`, la
   `notification_url` termina en `?cuenta=CL`, el webhook la valida, el ticket pasa a
   `completed` y llega el correo. Nada cambió para Chile.
2. `create-preference` sobre un evento mexicano responde **409 `pais_sin_cobro`** y **no**
   crea preferencia en MP ni ticket (contar tickets del evento antes y después).
3. `webhook-mp` con `?cuenta=XX` responde 401. Sin `cuenta`, se comporta como antes.
4. `rg -n "'CLP'" supabase/functions` da cero.
5. `rg -n "MERCADOPAGO_ACCESS_TOKEN|MERCADOPAGO_WEBHOOK_SECRET" supabase/functions` solo
   aparece en `_shared/cuentasMP.ts`.
6. **Pendiente hasta que exista la cuenta mexicana** (va como `V#` en `PENDIENTES.md`): con
   México encendido, una compra mexicana real cobra en MXN en la cuenta mexicana, el webhook
   la confirma con `?cuenta=MX`, y `confirm-payment` la encuentra con el token mexicano.

## Fuera de alcance

- Encender México (`paises_cobro.activo`): spec DATOS aparte cuando exista la cuenta.
- Mostrar la moneda en la web y traducir `pais_sin_cobro`: W-167 y W-168.
- La app móvil: si compra por `create-preference`, recibe el mismo 409 para eventos
  mexicanos; mostrar la moneda en la app queda para la cadena del 095/096.
