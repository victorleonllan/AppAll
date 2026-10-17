# Spec 140 — Cobrar lo recaudado de un evento desde la app

> Estado: propuesto (16-oct-2026)
> Capa: FRONTEND. `src/screens/CobrarEventoScreen.tsx`, `src/screens/EntradasEventoScreen.tsx`.
> Depende de: spec 114, spec 135, spec 139
> Hermano en la web: `app/(marketing)/cartelera/[id]/CobroEvento.js`, `page.js:209-219`, `libs/data/pagos.js:61-174` (W-081, W-085, W-086).

> **En una frase:** el dueño del evento ve cuánto recaudó, a qué cuenta se le transfiere y
> el botón «Cobrar», que mete el evento en la cola de pagos de Sonópolis.

## Contexto

Sonópolis no transfiere lo que nadie pidió (spec 075): hasta que el owner aprieta
«Cobrar», el evento no entra a la cola. En la web eso vive en la ficha del evento, solo
para el owner, con el show terminado y sin cancelar (`page.js:209-219`). La app no tiene
nada parecido.

El spec 114 deja registrada la ruta `CobrarEvento` (`{ eventoId }`) en los mismos stacks
que `EquipoEvento`, con un placeholder en `src/screens/CobrarEventoScreen.tsx`. El spec 135
deja `useCobroEvento`.

**Por qué la entrada va en Entradas y no en el detalle del evento:** `DetalleEventoScreen`
lo cambian los specs 118 y 120. Entradas es la pantalla de las ventas del evento, la que
el organizador abre después del show; por eso este spec depende del 139, que también la
toca.

## Diseño

### 1. Entrada desde `EntradasEventoScreen.tsx`

Si `permisos.esOwner`, un botón «💰 Cobrar lo recaudado» debajo de «📷 Escanear entradas»,
con el mismo estilo, que hace
`(navigation as any).navigate('CobrarEvento', { eventoId })`. Para admin y editor no
aparece: la plata es del owner (spec 073, RLS de `event_payouts`; spec 075, guarda de
`reclamar_pago_evento`).

### 2. `CobrarEventoScreen.tsx` (reemplaza el placeholder del 114)

```ts
const { eventoId } = route.params as { eventoId: string };
const permisos = useEventoPermisos(eventoId);
const cobro = useCobroEvento(eventoId, permisos.esOwner);
```

Un solo bloque, el primero que aplique en este orden:

1. `!permisos.esOwner` → «Solo el dueño del evento cobra lo recaudado.».
2. `cobro.cargando` → `ActivityIndicator`. `cobro.error` → el mensaje y «Reintentar»
   (`cobro.recargar`).
3. `cobro.cancelado` → «Este evento se canceló: lo recaudado vuelve a quien compró, no se
   transfiere al organizador.» (spec 103).
4. `!cobro.showTermino` → «Podrás cobrar cuando termine el show: hasta entonces se siguen
   vendiendo entradas y el monto no es final.» y, debajo, «Recaudado hasta ahora:
   <monto>».
5. `!cobro.payout` → tarjeta con fondo `colors.accentLight` y borde `colors.warning`:
   «Faltan tus datos bancarios. Sin ellos no podemos transferirte lo recaudado.», más el
   botón «Cargar datos bancarios» → `navigate('EditarEvento', { eventoId })` (el bloque de
   banco lo pone el spec 136).
6. `payout.status === 'pagado'` → ícono de check en `colors.success`, «Te transferimos
   <montoPagado>» y la fecha de `pagadoAt`.
7. `payout.status === 'reclamado'` → «Cobro pedido · <monto>», «Sonópolis te va a
   transferir a tu <banco>, cuenta terminada en <últimos 4 de numeroCuenta>.» y, si hay
   `reclamadoAt`, «Lo pediste el <fecha>.».
8. `payout.status === 'pendiente'` → «Recaudado en este show», el monto grande, «Va a tu
   <banco>, cuenta terminada en <últimos 4>.» y el botón **«Cobrar»** con fondo
   `colors.danger` (pedido de Victor en la web: si pasa desapercibido, no cobra). Con
   `monto <= 0` el botón queda deshabilitado y debajo dice «Este show no vendió entradas
   por Sonópolis, así que no hay nada que transferir.».

Al tocar «Cobrar»: `cobro.reclamar()`; el botón dice «Enviando…» mientras tanto. Si
funciona, la pantalla pasa sola al estado 7 (el hook reemplaza `payout`) y muestra «Pago
reclamado — Sonópolis va a transferirte». Si falla, el mensaje del RPC en `colors.danger`
(por ejemplo «El show todavía no termina» o «Faltan los datos bancarios del evento»). Sin
`Alert.alert`, por el build web.

**Montos:** con el formateador de moneda que deje el spec 116 si existe; si no,
`new Intl.NumberFormat('es-CL', { style: 'currency', currency: cobro.moneda ?? 'CLP', maximumFractionDigits: 0 })`
dentro de esta pantalla. La moneda es la del evento (`events.moneda`, spec 100): cada
evento cobra en una sola.

**Fechas:** `toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })`.

El monto lo calcula Postgres (`monto_a_transferir`: lo cobrado menos el 10% de recargo,
compra por compra) y no se recalcula en la app: dos implementaciones de la misma fórmula
terminan dando números distintos (`libs/data/pagos.js:57-60`).

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. Un `admin` o `editor` del evento no ve «Cobrar lo recaudado» en Entradas; si llega a la
   ruta igual, ve «Solo el dueño del evento cobra lo recaudado.» y no se llama a
   `monto_a_transferir`.
3. Con un evento que todavía no ocurre, se ve el estado 4 y no hay botón «Cobrar».
4. Con un evento terminado, con ventas y datos bancarios, «Cobrar» deja
   `event_payouts.status = 'reclamado'` y `reclamado_at` no nulo, y la pantalla muestra el
   estado 7.
5. Con un evento terminado sin fila en `event_payouts`, se ve el estado 5 y el botón lleva a
   Editar evento.
6. Con un evento cancelado, se ve el estado 3.
7. `npx expo export --platform web` termina sin error.

## Fuera de alcance

- Marcar pagado o cerrar el evento: es del admin de Sonópolis en la web (`cerrar_evento`,
  spec 102).
- Avisar al organizador cuando le transfieren.
- Quitar la guarda faltante de `monto_a_transferir` (es `SECURITY DEFINER` y no comprueba
  que quien llama sea del equipo, así que cualquier sesión puede consultar lo recaudado
  de cualquier evento): es capa DATOS y necesita su propio spec.

## Verificación manual

- **V-candidata 140-a:** con un evento de prueba terminado, con una venta real y datos
  bancarios, reclamar desde la app y verlo en `/admin/sonopolis` como «reclamado».
