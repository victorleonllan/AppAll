# Spec 088 — La reserva pendiente caduca a los 30 minutos

> Estado: **propuesto** (16-sep-2026)
> Capa: LÓGICA. `supabase/migrations/<timestamp>_spec_088_reserva_pendiente_caduca.sql`,
> `supabase/functions/create-preference/index.ts`, `supabase/functions/reconciliar-pagos/index.ts`.
> Depende de: spec 083 (última versión de `_reservar_ticket_shared`), spec 072
> (`reconciliar-pagos` y la exclusión de medios de pago diferidos en `create-preference`).

> **En una frase:** hoy un `tickets.status = 'pending'` no caduca nunca — ocupa aforo para
> siempre aunque nadie haya pagado — y este spec le pone un reloj de 30 minutos en el único
> lugar donde el aforo se cuenta, apaga el checkout de Mercado Pago a la misma hora, y
> recién después de preguntarle a MP marca la fila `cancelled`.

## El problema

`create-preference` inserta el ticket en `pending` **antes** de que nadie pague: la fila
nace con el clic, no con el cobro. Nada la mueve después si el comprador cierra la pestaña
de Mercado Pago. `_reservar_ticket_shared` cuenta el aforo así (spec 083, sin cambios desde
el 022):

```sql
SELECT COALESCE(SUM(cantidad), 0) INTO v_ocupado
  FROM public.tickets
 WHERE evento_id = p_evento_id AND status IN ('pending', 'completed');
```

Un `pending` de hace una semana pesa lo mismo que una entrada pagada. En un venue con
`aforo` cargado, unas pruebas de una noche dejan el evento "agotado" sin una sola venta.

Estado de producción al escribir esto (16-sep-2026): **23 tickets `pending`**, el más viejo
del 4-sep. En el evento `1ecc078e` (Quintal Clandesta) son 14 entradas retenidas. Hoy no
bloquean nada sólo porque ese venue tiene `aforo: null`; es un bug latente, no uno inactivo.

**Lo que este spec NO arregla.** El mismo día se reportó que "ya no quedan entradas de
preventa" y no es esto: `event_preventas.vendidos` lo mueve el trigger
`tickets_track_preventa_vendidos` (spec 064) **sólo al pasar a `completed`**, así que un
`pending` no gasta cupo de preventa. Esa preventa estaba en 2 de 12 y se cerró por reloj
(`cierre_at = 2026-09-16 15:00Z`, spec 083). Son dos mecanismos distintos y conviene no
confundirlos al leer este spec dentro de seis meses.

## Decisión 1 — la reserva vence por `created_at`, sin columna nueva

El vencimiento es `created_at + 30 minutos`. No hay columna `reservada_hasta`: sería un
dato derivado de otro que ya está en la fila, y mantener dos fuentes para el mismo instante
es cómo se desincronizan. Que no haga falta columna es lo que mantiene este spec en LÓGICA
y no en DATOS — no hay migración de esquema, sólo `CREATE OR REPLACE` de una función.

**30 minutos** porque es lo que dura una sesión de checkout de MP con tarjeta o saldo: más
corto le caduca la compra a alguien que está tipeando el número; más largo es volver al
problema, sólo que más lento.

El criterio vive en una función, no en un literal repetido en tres consultas:

```sql
-- Cuánto dura una reserva sin pagar. Función y no constante suelta: la usan el
-- conteo de aforo y el barrido de cancelación, y cambiarla en un solo lugar es
-- lo que evita que un día queden en 30 y 120 minutos sin que nadie lo note.
CREATE OR REPLACE FUNCTION public.ticket_reserva_ttl()
RETURNS interval LANGUAGE sql IMMUTABLE AS $$ SELECT interval '30 minutes' $$;
```

## Decisión 2 — el aforo deja de contar las reservas vencidas

Único cambio en `_reservar_ticket_shared` (`CREATE OR REPLACE` sobre la versión del 083;
firma, grants, preventa, email e `INSERT` quedan idénticos):

```sql
  SELECT COALESCE(SUM(cantidad), 0) INTO v_ocupado
    FROM public.tickets
   WHERE evento_id = p_evento_id
     AND (status = 'completed'
          OR (status = 'pending' AND created_at > now() - public.ticket_reserva_ttl()));
```

La fila vencida sigue existiendo: deja de pesar en el cupo, no se borra. El cupo se libera
en la lectura, que es inmediato y no depende de que ningún barrido haya corrido — si la
liberación dependiera del cron, el cupo volvería una vez al día.

## Decisión 3 — el checkout de MP caduca a la misma hora que la reserva

Liberar el cupo a los 30 minutos abre un hueco: el link de Mercado Pago sigue vivo, así que
alguien podría pagar a los 45 minutos una entrada que ya se le vendió a otro. Eso es
sobreventa — el error caro. Se cierra en `create-preference`, en la preferencia:

```ts
    // Spec 088. El link muere cuando muere la reserva: a los 30 min el aforo
    // deja de contar este ticket, y sin esto MP seguiría aceptando el pago de
    // una entrada ya revendida. Los dos relojes son el mismo número a propósito.
    const vence = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const preference = {
      ...
      expires: true,
      expiration_date_to: vence,
    };
```

**Por qué 30 minutos alcanzan hoy y cuándo dejan de alcanzar.** El spec 072 ya excluyó
`ticket` (efectivo) y `atm` (transferencia por cajero) de los medios de pago: son los que MP
aprueba horas o días después. Quedan tarjeta y saldo de MP, que aprueban en el acto, así que
no hay pago legítimo que llegue tarde. Esa exclusión lleva una nota de "REVERTIR cuando el
cron corra cada pocos minutos": **si se revierte, este TTL hay que revisarlo antes**, porque
un pago en efectivo aprobado al día siguiente caería sobre una reserva ya vencida.

## Decisión 4 — la fila se cancela recién después de preguntarle a MP

La decisión 2 saca la fila del cupo pero la deja `pending` para siempre, y el back office
acumula basura. El barrido va en `reconciliar-pagos`, que ya recorre los `pending` y les
pregunta a MP por `confirm-payment`. Se agrega al final de cada vuelta:

```ts
        // Spec 088. Sólo lo que MP dejó en `pending` Y ya pasó la holgura. El
        // orden importa: primero se pregunta, después se cancela. Cancelar sin
        // preguntar es cómo se borra una entrada que el comprador sí pagó.
        const HOLGURA_HORAS = 2;
```

**Holgura de 2 horas, no 30 minutos.** El TTL del cupo puede ser agresivo porque es
reversible — una reserva vencida que se paga igual se confirma y vuelve a ocupar su lugar.
Cancelar la fila no es reversible desde el cron, así que espera cuatro veces más.

El `status` pasa a `'cancelled'`, que ya existe en `tickets_status_check` (baseline). No se
agrega `'expired'`: sería un `ALTER TABLE ... CHECK`, es decir capa DATOS, para distinguir
dos casos que nadie consulta por separado.

Ojo con el trigger `tickets_track_preventa_vendidos`: resta `vendidos` sólo al salir de
`completed`, así que un `pending → cancelled` no le toca el contador a la preventa. Correcto
tal como está — el `pending` nunca lo había sumado.

## Lo que este spec no toca

- **Frontend.** El badge "quedan N" sale de `cupo - vendidos` (preventa, sólo `completed`):
  no cambia. Si más adelante hay que mostrarle al comprador "tu reserva vence en X", es un
  spec W- aparte.
- **Los 23 `pending` viejos de hoy.** Con la decisión 2 dejan de pesar en cuanto se aplica la
  migración, y la 4 los cancela en la corrida siguiente del cron. No hay limpieza a mano.

## Criterios de cierre

1. `ticket_reserva_ttl()` existe y devuelve `00:30:00`.
2. `pg_get_functiondef('_reservar_ticket_shared')` coincide con el archivo de la migración, y
   lo único que cambió contra la versión del 083 es el `WHERE` del conteo de ocupado.
3. Contra un evento clonado dentro de una transacción revertida, con `aforo = 2`: un
   `pending` de hace 31 minutos **no** impide reservar; uno de hace 5 minutos **sí** (`sin_cupo`).
4. Un ticket `completed` de hace un mes sigue ocupando cupo (el TTL no toca `completed`).
5. La preferencia creada por `create-preference` vuelve de MP con `expiration_date_to` a 30
   minutos y `expires: true`; abrir ese link pasado el plazo muestra la pantalla de
   preferencia expirada de MP.
6. `reconciliar-pagos` en una corrida contra producción: los `pending` de más de 2 horas que
   MP reporta impagos quedan `cancelled`; ninguno que MP reporte aprobado queda `cancelled`
   (se confirma, como hasta ahora).
7. El conteo de `pending` en producción baja de 23 a los creados en las últimas 2 horas.
