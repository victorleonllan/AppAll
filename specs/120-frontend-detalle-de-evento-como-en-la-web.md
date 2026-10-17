# Spec 120 — El detalle del evento muestra moneda, preventa, descripción, compartir, flyer y la cancelación en vivo

> Estado: aplicado (17-oct-2026) — `npx tsc --noEmit` sin errores y `npx expo export --platform web` OK (criterios 1 y 11). Criterios 2-10 y V-a/V-b quedan para prueba manual en teléfono.
> Capa: FRONTEND. `src/screens/DetalleEventoScreen.tsx`, `src/hooks/useEstadoEventoEnVivo.ts` (nuevo), `src/components/AvisoCancelacion.tsx` (nuevo), `src/constants/web.ts` (nuevo).
> Depende de: spec 116, spec 118, spec 119
> Alimenta: spec 126 (puede reusar `AvisoCancelacion` en Mis entradas).
> Hermano en la web: W-119 (compartir), W-120/W-121 (descripción), W-167/W-168 (moneda), W-008/W-009 (cancelación en vivo), W-244 (flyer). Archivos: `sonopolisWeb/app/(marketing)/cartelera/[id]/page.js`, `[id]/EstadoEvento.js`, `[id]/BotonCompartir.js`, `[id]/flyer/route.js`, `components/AvisoCancelacion.js`.

> **En una frase:** el detalle del evento en la app muestra el precio como texto libre y
> se entera de una cancelación solo si alguien recarga; la ficha de la web muestra el precio
> vigente en su moneda, la descripción, comparte el link, ofrece el flyer y cambia sola a
> «cancelado» mientras está abierta.

## Contexto

`DetalleEventoScreen.tsx` hoy:

- `:322` muestra `evento.precio` (texto libre) y `:335` arma el botón con ese mismo texto.
  No sabe de preventas (`event_preventas`, spec 064) ni de moneda (spec 100). La web consulta
  `precio_vigente_de` (`[id]/page.js:141`) y lo dibuja con `formatearMonto`.
- `:48` decide `cancelado` con el `status` que había cuando cargó el contexto. Si el músico
  cancela mientras alguien tiene la pantalla abierta, el botón de compra sigue activo. La web
  lo resuelve con `EstadoEvento.js`: una suscripción de Supabase Realtime a los `UPDATE` de
  esa fila (`:48`) más un chequeo al volver a la pestaña (`:67`). `events` ya está en la
  publicación `supabase_realtime` desde el spec 044
  (`20260813215305_spec_044_guarda_cancelacion_realtime.sql:110`).
- No muestra `descripcion` (columna del spec 087; la web la muestra desde W-121,
  `[id]/page.js:380`).
- No tiene forma de compartir el evento (web: `BotonCompartir`, `[id]/page.js:321`) ni de
  llegar al flyer con el marco de Sonópolis (web: `/cartelera/[id]/flyer`,
  `[id]/page.js:477`, que solo existe si el evento tiene imagen y no está cancelado).

**Qué ya traen los specs anteriores:** `Evento.moneda` (116); `Evento.descripcion`,
`Evento.tipoPrecio`, `usePrecioVigente`, `PrecioEvento` y `formatearMonto` en
`src/lib/precio.ts` (119). Este spec solo los usa.

**Qué trae el spec 118:** el pago nativo dentro de esta misma pantalla. Este spec no toca
`handleComprarLogueado` ni el flujo de correo: solo el texto y la condición de deshabilitado
del botón.

## Diseño

### 1. `src/constants/web.ts` (nuevo)

```ts
/** Dominio público de la web. Los links que salen de la app apuntan acá. */
export const URL_WEB = 'https://sonopolis.org';
/** Copia de VERSION_PREVIEW_LINK de sonopolisWeb/libs/constants.js:239. WhatsApp
 * cachea la vista previa por URL completa; cambiar este número en la web obliga a
 * cambiarlo acá, o los links compartidos desde la app muestran la preview vieja. */
export const VERSION_PREVIEW_LINK = '2';
```

### 2. `src/hooks/useEstadoEventoEnVivo.ts` (nuevo)

```ts
useEstadoEventoEnVivo(
  eventoId: string | null,
  inicial: { cancelado: boolean; motivo: string | null }
): { cancelado: boolean; motivo: string | null }
```

- Estado inicial = `inicial`. Con `eventoId === null` o ya cancelado, no se suscribe.
- Vía principal — Realtime:
  `supabase.channel(\`evento:${eventoId}\`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: \`id=eq.${eventoId}\` }, (payload) => { if (payload.new.status === 'cancelled') { … } }).subscribe()`.
- Red de seguridad — al volver la app a primer plano: `AppState.addEventListener('change', …)`
  con estado `'active'` → `revisar()`, que hace
  `select('status, cancel_reason').eq('id', eventoId).maybeSingle()`. Es el equivalente
  móvil del `visibilitychange` de la web: un socket se cae sin avisar cuando el teléfono
  suspende la app o cambia de red, y este chequeo recupera el estado sin depender de que
  alguien vuelva a entrar.
- Limpieza: `supabase.removeChannel(canal)` y `subscription.remove()` al desmontar o al
  pasar a cancelado (ya no hay nada que vigilar).
- Errores de `revisar()`: `console.error` y se deja el estado como estaba. No es el chequeo
  que evita el daño: ese es la guarda de la base al reservar (spec 044), que rechaza
  comprar un evento cancelado.

### 3. `src/components/AvisoCancelacion.tsx` (nuevo)

Props: `{ motivo: string | null; onVerOtros?: () => void }`. Copia del texto de
`sonopolisWeb/components/AvisoCancelacion.js`: tarjeta `colors.cardBackground` con borde
superior de 3 px en `colors.danger`, `⚠️ Este evento fue cancelado` en `colors.primary`
(el rojo ya está en el borde; repetirlo en el título hace que el aviso grite), el `motivo`
si existe, y «Si compraste una entrada, tu compra no da acceso.». Si viene `onVerOtros`,
un enlace «Ver otros eventos →». Un solo componente para que el mensaje no se contradiga
entre pantallas (Mis entradas del 126 puede reusarlo).

### 4. `src/screens/DetalleEventoScreen.tsx`

**Orden de los hooks.** Los hooks nuevos van **antes** del `if (!evento) return …`
(hoy `:40`; el 118 puede moverlo), recibiendo `evento?.id ?? null`. Llamar un hook después de un `return` temprano
cambia el número de hooks entre renders y React lo rompe.

**Estado en vivo.**

```ts
const enVivo = useEstadoEventoEnVivo(evento?.id ?? null, {
  cancelado: evento?.status === 'cancelled',
  motivo: evento?.cancelReason ?? null,
});
const cancelado = enVivo.cancelado;
```

reemplaza a `const cancelado = evento.status === 'cancelled'` (hoy `:48`). La banda roja
(hoy `:294-298`) se reemplaza por `<AvisoCancelacion motivo={enVivo.motivo} onVerOtros={() => navigation.navigate('CarteleraList')} />`
arriba de la tarjeta.

**Precio.**

```ts
const { vigente } = usePrecioVigente(evento && !cancelado ? evento.id : null);
```

Acá se consulta para todo evento no cancelado, no solo los de `tipoPrecio === 'puerta'`:
además del precio, el RPC dice si el país del evento vende hoy (`se_vende`). México está
en `paises_cobro` con `activo = false` (spec 100): el evento se publica, pero no se cobra.

- El bloque «Precio» (hoy `:321-322`) muestra `<PrecioEvento evento={evento} vigente={vigente} alinear="inicio" />`.
- `const ventaCerrada = vigente?.seVende === false;` Si el RPC falló (`vigente === null`) no
  se bloquea: la base vuelve a revisarlo al reservar, y un error de red no debe esconder
  la compra.
- Botón de compra: deshabilitado también si `ventaCerrada`. Texto, en este orden:
  `Evento cancelado` · `Procesando...` · `Venta no habilitada todavía en este país`
  (si `ventaCerrada`) · `Comprar entrada — ${formatearMonto(vigente?.monto ?? monto, evento.moneda)}`
  (si `monto > 0`) · `Evento gratuito`. El monto del botón es solo lo que se muestra: lo que
  se cobra lo decide el servidor (`create-preference` y `_reservar_ticket_shared` toman el
  precio de la preventa vigente).
- La guarda `monto <= 0` y todo `handleComprarLogueado` quedan como los dejó el 118.

**Descripción.** Si `evento.descripcion` tiene texto, una sección «Sobre el evento» después
de las filas Lugar/Fecha/Hora, con el texto completo (respeta saltos de línea).

**Compartir.** Botón «Compartir» junto al nombre del artista (visible siempre, también para
un evento cancelado: quien lo recibe se entera de la cancelación). Al tocarlo:

```ts
const url = `${URL_WEB}/cartelera/${evento.id}?v=${VERSION_PREVIEW_LINK}`;
await Share.share({ message: `${evento.artista} — ${evento.venueName}\n${url}` });
```

- Se manda solo `message` (con el link adentro) y no `url` aparte: en iOS los dos campos
  llegan juntos a WhatsApp y el link se ve repetido; en Android `url` se ignora.
- La URL es la de la web y no `appall://`: quien la recibe puede no tener la app, y la web
  tiene la vista previa con el flyer (W-119). Lleva `?v=` y ningún otro parámetro, igual que
  `BotonCompartir.js` (un `?comprar=1` reabriría la compra en el teléfono de quien recibe).
- Cancelar la hoja nativa no es error. En web (`react-native-web`) sin `navigator.share`,
  `Share.share` lanza: en ese caso `Alert.alert('Copia este link', url)`.

**Flyer.** Si `evento.imagen && !cancelado`, sección «Material de difusión» al final:
`<Image source={{ uri: \`${URL_WEB}/cartelera/${evento.id}/flyer\` }} />` de 240 de ancho y
proporción 4:5 (la ruta genera 1080×1350), y un botón «Descargar flyer» que hace
`Linking.openURL` a esa misma URL. Mismas condiciones que la web (`[id]/page.js:477`): sin
imagen la ruta da 404, y un evento cancelado no se difunde. Guardarlo en la galería pide
`expo-media-library` (dependencia nativa nueva), fuera de alcance.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin errores.
2. Un evento `CLP` de tipo `general` muestra `$5.000 CLP` en el bloque de precio y en el
   botón.
3. Un evento con preventa abierta muestra el badge de la preventa, su monto, «quedan N»
   y «puerta …»; el botón dice el monto de la preventa.
4. Un evento de un país con `paises_cobro.activo = false` muestra el precio en `MXN` y el
   botón deshabilitado con «Venta no habilitada todavía en este país».
5. Con el detalle abierto en un teléfono, cancelar el evento desde la web cambia la pantalla
   a `AvisoCancelacion` con el motivo y deshabilita la compra **sin recargar**.
6. Con la app en segundo plano mientras se cancela el evento, al volver a primer plano la
   pantalla muestra el aviso (camino de `AppState`).
7. «Compartir» abre la hoja nativa con `https://sonopolis.org/cartelera/<id>?v=2` en el
   mensaje.
8. Un evento con `imagen` y no cancelado muestra el flyer enmarcado; uno sin `imagen` o
   cancelado no muestra la sección.
9. Un evento con `descripcion` la muestra completa; uno sin ella no deja espacio vacío.
10. Abrir y cerrar el detalle varias veces no acumula canales: tras salir,
    `supabase.getChannels()` no contiene `evento:<id>`.
11. `npx expo export --platform web` termina sin errores.

## Fuera de alcance

- Elegir pasarela de pago (Flow, W-190): Flow está apagado en producción (plan, «Fuera del
  plan»).
- Opt-in de WhatsApp, publicar en redes y avisar por WhatsApp desde la ficha: son del CRM,
  que queda fuera del plan.
- Cobrar, reclamar pago y borrar/ocultar desde la ficha: specs 137 y 140.
- Mapa del local en la ficha: spec 127.
- Guardar el flyer en la galería del teléfono (`expo-media-library`).

## Verificación manual (candidatas a `V#`)

- V-a: cancelación en vivo en un teléfono real (criterios 5 y 6), con el evento abierto
  como visitante sin sesión — la RLS de `events` tiene que dejar pasar el `UPDATE` por
  Realtime también a `anon`.
- V-b: compartir a WhatsApp desde iOS y desde Android: un solo link en el mensaje y la
  vista previa con el flyer.
