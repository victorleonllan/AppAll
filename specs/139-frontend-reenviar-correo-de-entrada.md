# Spec 139 — Entradas del evento: enviar o reenviar el correo de una compra

> Estado: aplicado (17-oct-2026) — `npx tsc --noEmit` limpio (criterio 1) y `npx expo export --platform web` sin error (criterio 6). **Pendiente:** criterios 2-5 en la app contra la base y V-candidata 139-a; el envío real necesita W-246 en producción
> Capa: FRONTEND. `src/screens/EntradasEventoScreen.tsx`, `src/components/BotonReenviarEntrada.tsx` (nuevo).
> Depende de: spec 135
> Alimenta: spec 140
> Hermano en la web: `app/(private)/eventos/[id]/entradas/BotonReenviar.js` y `page.js:306-316` (W-122–124). Necesita **W-246 desplegado en producción** antes de publicar el build (sin él, la ruta responde `401`).

> **En una frase:** cada entrada pagada de la lista lleva el botón que resuelve «pagué y no
> me llegó nada»: dice si el correo salió alguna vez y lo manda de nuevo con un toque.

## Contexto

El reclamo de una entrada que no llegó le llega al organizador del show, no a Sonópolis,
y esa persona ya tiene abierta la lista de quién compró (`BotonReenviar.js:10-13`). La web
le pone el botón en cada fila desde W-124; la app solo muestra la lista
(`EntradasEventoScreen.tsx:100-119`).

El correo lo arma y lo manda la ruta `POST /api/entradas/reenviar` de la web, porque
necesita la llave de Resend. El spec 135 deja `reenviarCorreo(ticketId)` en
`useEntradasEvento` y los campos `compraPagada`, `cantidadEnCompra` y `entradaEnviadaAt`
en cada `TicketItem`; W-246 deja que la ruta acepte la sesión de la app.

## Diseño

### `src/components/BotonReenviarEntrada.tsx` (nuevo)

Props: `{ ticketId: string; cantidadEnCompra: number; enviadoAt: string | null; onReenviar: (ticketId: string) => Promise<string> }`.

Estado interno: `'idle' | 'enviando' | 'error'`, `reciénEnviado: boolean`, `error: string | null`.

Etiqueta del botón (`BotonReenviar.js:73-80`):

- `enviando` → «Enviando…»
- nunca enviado (`enviadoAt` nulo) → «Enviar correo»
- `cantidadEnCompra > 1` → «Reenviar las <N>»
- si no → «Reenviar correo»

Línea bajo el botón, en este orden de prioridad:

1. error → texto `colors.danger`: «Esa compra no tiene correo» si el código es `sin_email`;
   «Tu sesión venció: vuelve a entrar.» si es `no_autenticado`; si no, «No se pudo
   enviar».
2. `reciénEnviado` → «Enviado ahora» en `colors.success`.
3. nunca enviado → «Nunca se envió» en `colors.warning`. Ámbar y no gris: alguien pagó y no
   tiene su entrada en el buzón, es una alerta (`page.js` lo trata igual).
4. si no → «Enviado <dd-mm hh:mm>» en `colors.muted`, con
   `toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })`.

Al tocar: `onReenviar(ticketId)`; si funciona, `reciénEnviado = true` y a los 2,5 s vuelve
a `false`. **El botón nunca queda en un estado «Enviado» fijo:** que el correo salió no
quiere decir que llegó (spam, buzón lleno), y reenviar tiene que seguir disponible
(`BotonReenviar.js:28-36`). El error se muestra en la fila y no con `Alert.alert`: la
pantalla se usa con la persona esperando enfrente, y en web `Alert.alert` no hace nada.

Sin campo para mandar a otra dirección: esta pantalla la ve todo el equipo (owner, admin y
editor), y ese campo dejaría a un editor mandarse el QR de otra persona y entrar con él
(`BotonReenviar.js:23-26`). La ruta además lo rechaza (`otra_direccion_solo_admin`).

### `EntradasEventoScreen.tsx`

- Toma `reenviarCorreo` de `useEntradasEvento(eventoId)`.
- En cada fila de `entradas`, si `item.compraPagada && item.status !== 'void'`, monta
  `<BotonReenviarEntrada ticketId={item.ticketId} cantidadEnCompra={item.cantidadEnCompra ?? 1} enviadoAt={item.entradaEnviadaAt ?? null} onReenviar={reenviarCorreo} />`
  a la derecha, debajo del botón «QR» existente si lo hay. Sin compra pagada no hay
  entradas emitidas que mandar; anulada tampoco, porque sería mandarle a alguien algo que
  ya no sirve (`page.js:306-310`).
- Las filas de `comprasSinEmitir` no llevan botón: no hay talones todavía.

Como `reenviarCorreo` actualiza `entradaEnviadaAt` en todas las entradas de la compra (spec
135, §9), en una compra de 4 las cuatro filas pasan a «Enviado …» con un solo envío.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. Una entrada de una compra `completed` con `entrada_enviada_at` nulo muestra «Enviar
   correo» y «Nunca se envió»; tocarlo manda el correo (con W-246 desplegado) y la fila
   pasa a «Enviado ahora» y después a «Enviado <fecha>».
3. En una compra de 3 entradas el botón dice «Reenviar las 3», y un envío actualiza las
   tres filas.
4. Una entrada `void` y una compra `pending` no muestran botón.
5. Con W-246 sin desplegar, el error aparece en la fila y la pantalla sigue usable.
6. `npx expo export --platform web` termina sin error.

## Fuera de alcance

- Mandar la entrada a otra dirección (solo admin de Sonópolis, W-125).
- Reenviar desde «Mis entradas» del comprador (spec 126).

## Verificación manual

- **V-candidata 139-a:** con W-246 en producción y una compra de prueba pagada, reenviar
  desde la app y confirmar que el correo llega con el QR correcto.
