# Spec 072 — Reconciliación de pagos pendientes (red de seguridad antes de producción)

> Estado: aplicado (4-sep-2026)
> Capa: LÓGICA. Depende del spec 070 (`confirm-payment`).

## Contexto

Auditoría pre-producción de Mercado Pago pedida por Victor el 4-sep-2026 (detalle en el
vault, `02-PROJECTS/Sonópolis Web/Investigación/credenciales-y-entorno.md` → "Auditoría
pre-producción"). El bloqueante mayor para mover el token de test a producción:

**La confirmación de un pago depende de que el comprador deje una pestaña abierta.**
`webhook-mp` rechaza el 100% de las notificaciones de MP (firma `x-signature`, causa raíz
sin diagnosticar desde el spec 070), así que lo único que marca un ticket `completed` es
`confirm-payment` — y a `confirm-payment` sólo lo llama el polling de
`/compra/confirmacion` durante su ventana de ~30 s. Si el fan cierra esa pestaña, se le
corta internet, o el pago se aprueba más tarde, **nadie vuelve a preguntar nunca**. Se
verificó que no existe ningún job de reconciliación: ni `pg_cron` en las migraciones, ni
cron de Vercel más allá del scraping.

En sandbox eso deja un ticket colgado. Con dinero real es una entrada cobrada y no
entregada, que sólo se descubre cuando el comprador reclama.

## Decisión

Tres caminos independientes hacia el mismo `UPDATE` idempotente, en vez de uno solo que
depende del navegador. Ninguno reemplaza a los otros:

1. **Pestaña de confirmación** (ya existía, spec 070) — el camino rápido, cubre el 95% de
   los casos: el comprador vuelve y ve su entrada en segundos.
2. **Vuelta desde Mercado Pago** — `back_urls.success` ahora lleva la referencia del ticket
   en la URL, así que la pestaña que MP devuelve puede pedir la confirmación por su cuenta
   en vez de sólo refrescar y esperar a la otra (`sonopolisWeb`, spec W080).
3. **Cron de reconciliación** (nuevo acá) — la red de seguridad: barre los tickets
   `pending` recientes una vez al día y los confirma contra la API de MP sin que nadie
   tenga que abrir nada.

**Por qué el cron es diario y no cada 5 minutos:** el plan de Vercel es Hobby, que permite
2 cron jobs y una sola ejecución diaria por job. Uno ya lo ocupa el scraping (spec W-023);
éste es el segundo y último. Cuando el plan pase a Pro, subir la frecuencia es cambiar una
línea de `vercel.json` — nada del código de acá depende del intervalo.

**Consecuencia que obliga a un segundo cambio:** con reconciliación sólo diaria, un pago en
efectivo o por transferencia (que MP aprueba horas o días después) dejaría al comprador sin
entrada hasta la corrida siguiente. Mientras el cron no sea frecuente, la preferencia
excluye los medios de pago offline (`ticket` = efectivo en caja, `atm` = transferencia por
cajero) y deja sólo los que se aprueban en el acto: tarjeta y saldo de Mercado Pago.
**Esto se revierte cuando el cron pase a correr cada pocos minutos** — está marcado en el
código con este número de spec.

## Qué se construyó

### `supabase/functions/reconciliar-pagos/index.ts` (nueva)

Barre `tickets` en `pending` creados en los últimos N días (7 por defecto, parámetro
`dias`) y llama a `confirm-payment` una vez por ticket. **No duplica la lógica de
confirmación**: la delega en la function que ya existe y ya está verificada contra un pago
real, así que sólo hay un lugar donde puede estar mal.

Protegida con el `SUPABASE_SERVICE_ROLE_KEY` en el header `x-admin-key` — no se inventa un
secreto nuevo, y quien llama ya tiene que ser el cron de Vercel (que lo tiene en su
entorno). Sin eso, la ruta queda pública y cualquiera puede disparar N llamadas a la API de
MP.

Devuelve un resumen (`revisados`, `confirmados`, `sin_cambio`, `errores`) para que la
corrida quede legible en los logs de Vercel sin tener que abrir Supabase.

### `supabase/functions/confirm-payment/index.ts` (modificada)

Acepta `{ ticket_ref }` además de `{ ticket_id }`. `ticket_ref` es el `metadata.ticket_ref`
que `create-preference` genera antes de hablar con MP y guarda en `tickets.preference_id`
— o sea, la única referencia del ticket que existe **antes** de que el ticket exista, y por
eso la única que puede viajar en la `back_url`. El resto de la función no cambia.

### `supabase/functions/create-preference/index.ts` (modificada)

1. `back_urls.success` pasa a `/mis-entradas?compra=success&ref=<ticketRef>`. Cierra el
   hueco que `PollTrasCompra.js` documentaba como irresoluble ("no hay `ticketId` acá"): el
   `ticket_ref` sí está disponible antes de crear la preferencia, y es lo que
   `confirm-payment` necesita.
2. `payment_methods.excluded_payment_types`: fuera `ticket` y `atm` (ver la decisión
   arriba).

## Criterios de cierre

1. `POST /confirm-payment` con `{ ticket_ref }` de un ticket `pending` devuelve el mismo
   resultado que con `{ ticket_id }`. ✅ verificado contra un ticket real.
2. `POST /reconciliar-pagos` sin `x-admin-key` → 401. ✅
3. `POST /reconciliar-pagos` con la clave correcta devuelve el resumen y no cambia ningún
   ticket que ya no esté `pending`. ✅ (12 tickets `pending` de sandbox revisados, 0
   confirmados — ninguno tiene pago real detrás, que es lo esperado).
4. Una preferencia nueva trae `ref=` en su `back_urls.success` y no ofrece efectivo ni
   transferencia. ⏳ se verifica en la primera compra de producción.

## Qué NO cubre este spec

- Los tickets `pending` no caducan: una compra abandonada sigue ocupando aforo para
  siempre. Es el punto 9 de la auditoría, queda abierto a propósito — cancelar automático
  es una decisión de producto (¿a las 2 h? ¿24 h?), no un parche técnico.
- Guest checkout: `confirm-payment` sigue cortando con `guest_no_soportado_aun` cuando el
  ticket no tiene `user_id`. Se verificó que hoy ninguna ruta de compra sin sesión está
  viva en `sonopolisWeb` (la compra exige magic link), así que no está expuesto.
- Reembolsos: siguen siendo manuales desde el panel de MP.
