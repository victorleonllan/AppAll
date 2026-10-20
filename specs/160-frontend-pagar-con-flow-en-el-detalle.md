# Spec 160 — Pagar con Flow desde el detalle del evento

> Estado: propuesto (19-oct-2026)
> Capa: FRONTEND. `src/screens/DetalleEventoScreen.tsx`.
> Depende de: spec 151, spec 157 (también edita esta pantalla: se aplica después), y W-251 de `sonopolisWeb` desplegado antes de encender Flow.
> Hermano en la web: `app/(marketing)/cartelera/[id]/BotonComprar.js` (W-190).

> **En una frase:** el detalle muestra un botón de compra por cada pasarela activa en el
> país del evento, como la web; con una sola pasarela (hoy, con Flow apagado) se ve el
> mismo botón de siempre, y comprar pasa por `crearPagoCompra` del spec 151, que sabe
> cobrar con Mercado Pago o con Flow.

## Contexto

`DetalleEventoScreen` compra solo con Mercado Pago:

- `pedirPreferencia` (`src/screens/DetalleEventoScreen.tsx:176-210`) llama a
  `create-preference` a mano, con `origen: 'app'` en nativo (spec 118).
- `handleComprarLogueado` (`:214-273`) abre `init_point` con `window.open` en web o con
  `WebBrowser.openAuthSessionAsync(..., 'appall://compra')` en nativo, y navega a
  `ConfirmacionCompra` con `ticketId`, `ref` y `status`. Cualquier error termina en
  `Alert.alert('Error', 'No se pudo procesar la compra')` (`:266`), que en el build web no
  hace nada.
- Hay un único botón «Comprar entrada — $X» (`:407-422`), deshabilitado si el evento está
  cancelado, no tiene monto o el país no vende (`ventaCerrada`, `:70`).
- La auto-compra al volver del enlace mágico (`:116-142`) llama a
  `handleComprarLogueado()` sin elegir nada.

El spec 151 dejó listas las piezas: `getPasarelas(pais)` y `NOMBRE_PASARELA` en
`src/lib/pasarelas.ts`, y `crearPagoCompra`, `ErrorPago` y `mensajeErrorPago` en
`src/lib/pagoCompra.ts`. La web ya muestra un botón por pasarela (W-190): con una, el
botón de siempre; con varias, «Pagar con Mercado Pago» / «Pagar con Flow» en el orden de
`pasarelas_cobro`, el primero con el estilo principal; con varias, la compra tras el enlace
mágico no arranca sola.

**Por qué depende de W-251 aunque no la llame:** un pago con Flow desde la app vuelve por
`/api/flow/retorno?origen=app` (spec 147). Sin W-251 desplegada, esa ruta manda al
comprador a `/mis-entradas` en el navegador y la app no se reabre. Con Flow apagado no
pasa nada; tiene que estar desplegada antes del spec DATOS que encienda Flow.

**Por qué después del spec 157:** el 157 también edita este archivo. Dos specs sobre el
mismo archivo se serializan; este se escribe sobre la versión que deje el 157 y las
referencias `:NNN` de arriba se recalculan al aplicarlo.

## Diseño

### Estado nuevo (antes del `return` de «Evento no encontrado»)

Junto a `usePrecioVigente` (`:56`), porque un hook después de un `return` cambia el
número de hooks entre renders (comentario de `:48-49`):

```ts
const [pasarelas, setPasarelas] = useState<Pasarela[] | null>(null); // null = cargando
const [recargaPasarelas, setRecargaPasarelas] = useState(0);
const [pasarelaEnCurso, setPasarelaEnCurso] = useState<Pasarela | null>(null);
const [errorCompra, setErrorCompra] = useState<string | null>(null);

useEffect(() => {
  if (!evento?.pais || enVivo.cancelado) return;
  let activo = true;
  getPasarelas(evento.pais)
    .then((p) => { if (activo) setPasarelas(p); })
    .catch((err) => {
      console.error('[DetalleEvento] getPasarelas falló:', err);
      if (activo) setPasarelas(['mercadopago']);
    });
  return () => { activo = false; };
}, [evento?.pais, enVivo.cancelado, recargaPasarelas]);
```

**Si la lectura falla, `['mercadopago']` y no `[]` como la web:** es exactamente lo que
la app hace hoy, y es el criterio de `usePrecioVigente` en esta misma pantalla (`:68-70`):
un error de red no debe esconder la compra. La base vuelve a validar la pasarela al
reservar; si no corresponde, el comprador ve «Ese medio de pago no está disponible…».

Para dibujar: `const opciones = pasarelas ?? ['mercadopago']`. Mientras carga se ve el
botón de hoy, así que con Flow apagado no hay ningún parpadeo.

`ventaCerrada` suma el caso sin pasarelas, como la web (W-190):
`vigente?.seVende === false || pasarelas?.length === 0`. Hoy no cambia nada visible: el
único país sin pasarelas activas, México, ya tiene `paises_cobro.activo = false`.

### Comprar con una pasarela

`handleComprarLogueado(pasarela: Pasarela)`:

1. Si `monto <= 0`, el `Alert` «Sin precio» de hoy.
2. `setErrorCompra(null)`, `setPasarelaEnCurso(pasarela)`, `setStep('comprando')`,
   `setLoading(true)`.
3. `const pago = await crearPagoCompra({ eventoId: evento.id, userId: user!.id, pasarela })`.
   `crearPagoCompra` decide el `origen` por plataforma, así que la pantalla no lo manda.
4. Web: `window.open(pago.checkoutUrl, '_blank')` y `navigation.replace('ConfirmacionCompra',
   { eventoId, ticketId: pago.ticketId ?? undefined, status: 'pending' })`, como hoy.
5. Nativo: `WebBrowser.openAuthSessionAsync(pago.checkoutUrl, 'appall://compra')` y el
   resto igual que hoy (`status` leído de la URL de vuelta, `navigate` con
   `ref: pago.ticketRef ?? undefined`). Para Flow, W-251 devuelve siempre
   `status=pending` y `ConfirmacionCompra` resuelve el estado real con `confirm-payment`.
6. `catch`: `console.error` con el error completo y `setErrorCompra(mensajeErrorPago(err))`.
   Si `err instanceof ErrorPago && err.codigo === 'pasarela_inactiva'`, además
   `setRecargaPasarelas((n) => n + 1)`: la pasarela se apagó mientras la pantalla estaba
   abierta, y releer la lista quita el botón que solo puede volver a fallar.
   `setStep('idle')`.
7. `finally`: `setLoading(false)`, `setPasarelaEnCurso(null)`.

`pedirPreferencia` se borra: queda sin llamadores, y su lógica vive en `crearPagoCompra`.

**El error va en un `Text` y no en `Alert.alert`:** `Alert.alert` no hace nada en el build
web (mismo motivo que el spec 137 y el `errorGestion` de esta pantalla, `:490`).
`errorCompra` se muestra debajo de los botones, en `colors.danger`. Es el único cambio
visible con Flow apagado, y solo cuando una compra falla.

`handleBotonComprar(pasarela: Pasarela)` pasa la pasarela a `handleComprarLogueado`; sin
sesión hace lo de hoy (formulario de correo en web, aviso de iniciar sesión en nativo).

### Auto-compra tras el enlace mágico

El efecto de `:116-142` espera a que las pasarelas carguen: suma `pasarelas === null` a la
condición de salida, antes del candado `autoCompraIniciada`, y `pasarelas` a las
dependencias. Con una pasarela compra con ella; con más de una no compra sola y deja los
botones a la vista (W-190: elegir una por defecto mandaría a Mercado Pago a quien quería
Flow); sin pasarelas no hace nada. En los tres casos borra `pending_ticket` como hoy.

### Los botones

- Si el evento está cancelado, sin monto o con `ventaCerrada`, o si `opciones.length === 1`:
  el botón de hoy, sin cambios de texto ni estilo (`:407-422`), con
  `onPress={() => handleBotonComprar(opciones[0])}`.
- Si `opciones.length > 1`: un botón por pasarela, en el orden de `opciones`, apilados a
  ancho completo con `spacing.sm` entre ellos. Texto `Pagar con ${NOMBRE_PASARELA[p]}`;
  el que está en curso dice «Procesando...». El primero usa `botonComprar` /
  `textoBotonComprar`; los demás un estilo nuevo con borde `colors.accent`, fondo
  transparente y texto `colors.accent` (el orden de `pasarelas_cobro` dice cuál se
  sugiere, como `btn-accent` / `btn-outline` en la web). Todos deshabilitados mientras
  `step === 'comprando'`. El monto ya está a la vista en `PrecioEvento`, justo encima: en
  el texto de cada botón partiría la línea en un teléfono.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. Con Flow apagado, un evento `CL` muestra un solo botón «Comprar entrada — $X CLP»,
   igual que antes, y comprar con él abre Mercado Pago (en nativo, con vuelta a la app por
   `/app/volver`).
4. Con `EXPO_PUBLIC_PASARELAS_LOCAL=mercadopago,flow` en desarrollo (spec 151), el mismo
   evento muestra «Pagar con Mercado Pago» (estilo principal) y «Pagar con Flow» (borde),
   en ese orden. Tocar «Pagar con Flow» muestra «Ese medio de pago no está disponible
   para este evento» debajo de los botones, no navega y no deja ticket nuevo.
5. Un evento cancelado, sin monto o de un país que no vende muestra el único botón
   deshabilitado de hoy, con sus textos de hoy.
6. `rg "pedirPreferencia|functions/v1/create-preference" src/screens` sin resultados.
7. Solo cambia `src/screens/DetalleEventoScreen.tsx`.

## Fuera de alcance

- Encender Flow: spec DATOS aparte sobre `pasarelas_cobro`, después de W-251 desplegada.
- Elegir cantidad de entradas en la app: se sigue comprando de a una.
- Mover el efecto de auto-compra antes del `return` temprano (hoy está después,
  `:116-142`): se toca su condición, no su lugar.
- Comprar desde otras pantallas (la cartelera no tiene botón de compra).

## Verificación manual (candidatas a `V#` en `specs/PENDIENTES.md`)

- **V-candidata 160-a:** con Flow encendido en sandbox, una compra con «Pagar con Flow»
  en Android y otra en iOS: se abre Flow, al pagar la app se reabre en la confirmación en
  «Verificando pago...» y termina en el estado real; la entrada aparece en «Mis entradas».
- **V-candidata 160-b:** con Flow apagado, una compra con Mercado Pago desde un build
  nativo sigue igual que con el spec 118.
