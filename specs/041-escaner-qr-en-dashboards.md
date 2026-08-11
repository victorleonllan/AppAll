# Spec 041 — Escáner de QR: una pantalla montada en los dos dashboards

> Estado: **implementado el 2026-08-11.** Último de la serie 036-041 y el único que agrega
> una capacidad nativa (cámara). Capa de frontend: consume los RPC del spec 040 y no escribe
> nada por su cuenta. `tsc --noEmit` limpio en `src/` y `expo export --platform web` compila
> (1.7MB → 1.8MB por `expo-camera`). **Falta verificar en runtime**: la puerta necesita
> entradas emitidas y producción tiene 0 tickets — ver *Verificación* al final, donde también
> quedan anotadas las cuatro decisiones que se apartaron de lo escrito acá y por qué.

## El pedido, literal

> *"Ambos dashboards, de banda y de locales, deben tener una pestaña de lectura de código QR,
> y que idealmente esté montada para que no se pisen entre sí."*

"Que no se pisen" tiene dos lecturas y las dos son ciertas, así que este spec responde a las
dos por separado:

| Lectura | Dónde se resuelve |
|---|---|
| Que el código no se duplique entre los dos dashboards | **Acá**: un archivo, dos registros de ruta |
| Que dos personas escaneando en la puerta no dejen entrar dos veces la misma entrada | **Spec 040**: el `UPDATE ... WHERE status='valid'` atómico |

Lo segundo no se puede resolver en el frontend, y por eso es un spec aparte que se verifica
sin cámara.

## Un archivo, dos registros

El repo ya tiene el patrón y funciona: `VentasMusicoScreen` está montada en `MusicoStack` y en
`MiLocalStack` sin ninguna diferencia de código (spec 031). El componente muestra "lo que RLS
me deja ver", y RLS ya sabe si quien mira es un músico o un local.

El escáner es el mismo caso, y por el mismo motivo: `redeem_ticket_item` autoriza con
`can_edit_event(evento_id)` (spec 040), que no pregunta el rol de la persona sino si es del
equipo **de ese evento**. Un componente distinto por rol sería dos veces el mismo código con
la misma lógica de permisos delegada al mismo sitio.

```typescript
// MusicoStack.tsx y MiLocalStack.tsx — misma línea en los dos, mismo nombre de ruta
<Stack.Screen name="Escaner" component={EscanerQRScreen} options={{ title: 'Escanear entradas' }} />
```

Nombre de ruta idéntico a propósito: `DetalleEventoScreen` vive en `CarteleraStack` y navega
con `navigation.navigate('Escaner', { eventoId })` sin saber en qué stack está montado — el
mismo truco con el que el 033 registró `EquipoEvento` en varios stacks.

## Elegir el evento antes de escanear

Un escáner sin evento no puede validar nada útil: leería el token, iría a la base, y la base le
diría de qué evento es. Eso funciona, pero deja pasar el error más común de la puerta —tener
abierto el escáner del show de anoche— sin avisar.

Por eso la pantalla arranca eligiendo evento:

- Si llega con `{ eventoId }` (desde el dashboard de entradas del 039, o desde el detalle del
  evento), va directo a la cámara con el evento fijado en el encabezado.
- Si llega sin parámetro (desde la pestaña del dashboard), muestra **mis eventos de hoy y los
  próximos** —de `misColaboraciones`, que `EventosContext` ya carga desde el spec 033— y pide
  elegir uno.

Con el evento fijado, un token de otro evento se rechaza en pantalla con un mensaje que dice
cuál es el problema, en vez de canjear una entrada del show equivocado. El RPC igual
autorizaría —es del equipo de los dos eventos— así que este chequeo es de la pantalla, y es de
usabilidad, no de seguridad.

## La cámara, y el plan B que no es opcional

**Nativo:** `expo-camera` (`CameraView` con `barcodeScannerSettings: { barcodeTypes: ['qr'] }`).
Es la librería de Expo, ya está en el SDK 56 que usa el proyecto, y no arrastra configuración
nativa extra en un proyecto managed.

**Web:** el soporte de escaneo de `expo-camera` en navegador depende de `BarcodeDetector`, que
no está en todos los navegadores. La app se prueba y se demuestra en web (`app-all-lemon.vercel.app`),
así que hay que asumir que puede no funcionar y no descubrirlo en el Demo Day.

**Entrada manual por folio — obligatoria, no un extra.** Un campo donde el portero escribe el
número de folio y confirma. Existe porque en la puerta fallan cosas que no dependen de nosotros:

- El usuario niega el permiso de cámara, o el navegador no lo pide por no estar en HTTPS
- La pantalla del comprador está rota, sucia o con el brillo al mínimo
- El QR está impreso mal, o es una foto de una foto
- El navegador no trae `BarcodeDetector`

Una puerta que solo funciona con cámara es una puerta que se cierra sola. La entrada manual
usa el mismo camino que el escaneo: busca el folio dentro del evento elegido, resuelve su
token y llama al mismo RPC. **Una sola vía de canje**, dos formas de llegar a ella.

⚠️ **La cámara en web exige HTTPS.** Producción en Vercel lo es, y `localhost` está exento por
la especificación. Pero abrir el dev server por IP de red (`http://192.168.x.x:8081`, que es
como se prueba desde el teléfono contra el Mac) **no** da acceso a la cámara. Anotarlo evita
un diagnóstico perdido: no es un bug de la app.

## El flujo de un escaneo

```
  lee QR ──▶ ¿es de este evento? ──no──▶ 🟠 "Entrada de otro evento"
                    │sí
                    ▼
             rpc redeem_ticket_item
                    │
     ┌──────────────┼───────────────┬──────────────────┐
     ▼              ▼               ▼                  ▼
 🟢 ok         🔴 ya_usada      🔴 no_existe     🟠 evento_cancelado
 #007          #007 entró        QR no             el show no va
 Ana Ruiz      a las 21:04       reconocido        (sin_permiso → 🟠)
     │              │               │                  │
     └──────────────┴───────────────┴──────────────────┘
                    ▼
          vuelve a la cámara en 2 s
```

Reglas de la pantalla, todas por el mismo motivo —es de noche, hay ruido y hay una fila:

- **El resultado ocupa la pantalla entera.** Verde o rojo antes que texto: el color se lee de
  reojo, la palabra no.
- **El folio, grande.** Es lo que se coteja contra la lista del 039 si hay que discutir.
- **`ya_usada` muestra la hora del ingreso anterior**, que es el dato con el que se resuelve la
  discusión ("entró a las 21:04").
- **Vuelve sola a la cámara.** Un botón "siguiente" son dos toques por persona en una fila.
- **Bloqueo anti-rebote:** el mismo token no se re-procesa por unos segundos. La cámara lee
  varias veces por segundo el mismo código y sin esto la pantalla parpadearía entre `ok` y
  `ya_usada` sobre la misma entrada — pareciendo un fallo del sistema cuando fue un acierto.
- **Contador de la sesión**: cuántas entradas canjeó esta persona desde que abrió la pantalla.
  Es la información que le falta al que está en la puerta y no puede mirar el dashboard.

## Archivos

| Archivo | Cambio |
|---|---|
| `package.json` / `app.json` | `expo-camera` + el permiso de cámara y su texto de justificación (iOS exige `NSCameraUsageDescription`; sin él la app se rechaza en revisión) |
| `src/screens/EscanerQRScreen.tsx` (nuevo) | La pantalla, completa: selector de evento, cámara, entrada manual, resultado |
| `src/hooks/useCanjeEntrada.ts` (nuevo) | Llama a `redeem_ticket_item`, traduce los 6 resultados a `{color, titulo, detalle}`, y lleva el anti-rebote y el contador de sesión |
| `src/navigation/MusicoStack.tsx`, `MiLocalStack.tsx`, `CarteleraStack.tsx` | Ruta `Escaner: { eventoId?: string }` |
| `src/screens/EntradasEventoScreen.tsx` (del 039) | Botón "📷 Escanear" que entra con el evento ya fijado |
| `src/screens/PerfilMusicoScreen.tsx`, `DashboardLocalScreen.tsx` | Botón "📷 Escanear entradas" en el bloque de acciones — entra **sin** evento, y la pantalla lo pide. Es lo que hace de "pestaña" en los dos dashboards |
| `src/theme/index.ts` | `colors.danger` y `colors.warning`: la paleta solo tenía `success` |

El hook separado de la pantalla es lo que permite que la entrada manual y la cámara compartan
exactamente el mismo camino de canje: dos disparadores, una función.

## Dependencias

- **Spec 040** — hard. Sin `redeem_ticket_item` esta pantalla no tiene qué llamar.
- **Spec 039** — hard **en la práctica, no en el código**: comparte los tres archivos de
  navegación y `src/types/index.ts`. Hacerlos en paralelo es un conflicto de git garantizado
  en `MusicoStack.tsx` y `MiLocalStack.tsx`. **El 039 va primero y este después.**
- **Spec 036/037** — para escanear algo tiene que haber entradas emitidas.
- **Spec 034 (editar evento)** — mismo choque de archivos de navegación. Tres specs (034, 039,
  041) escriben `MusicoStack.tsx`, `MiLocalStack.tsx` y `CarteleraStack.tsx`.

## Criterio de cierre

1. La pestaña de escáner aparece en el dashboard de banda y en el de local, y es **el mismo
   archivo** montado dos veces — no dos componentes
2. Escanear una entrada válida muestra verde con folio y nombre, y en el dashboard del 039 esa
   entrada pasa a "entró"
3. Escanear la misma otra vez muestra rojo con la hora del primer ingreso
4. **Dos teléfonos escanean el mismo QR a la vez: uno muestra verde, el otro rojo.** Es el
   criterio que cierra "que no se pisen entre sí" y el que valida el spec 040 en condiciones
   reales
5. Escanear una entrada de otro evento se rechaza antes de llamar al RPC
6. La entrada manual por folio canjea igual que la cámara
7. Negar el permiso de cámara deja la pantalla usable por entrada manual, sin pantalla en
   blanco ni crash
8. Funciona en web sobre HTTPS y en nativo
9. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio

## Verificación (2026-08-11)

Hecho:

- `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio (criterio 9)
- `expo export --platform web` compila los dos bundles sin error; el de la app pasa de 1.7MB
  a 1.8MB por `expo-camera`
- El escáner es **un archivo** (`EscanerQRScreen.tsx`) registrado con el mismo nombre de ruta
  en `MusicoStack`, `MiLocalStack` y `CarteleraStack` (criterio 1, la mitad que se puede
  verificar leyendo código)

### Cuatro decisiones que se apartaron de lo escrito arriba

**1. `peek` antes de `redeem`, no solo cuando la entrada es de otro evento.** El flujo de este
documento pregunta "¿es de este evento?" antes de llamar al RPC, pero el token no dice de qué
evento es: eso lo sabe la base. Precargar los tokens del evento y comparar en el cliente sería
una sola llamada, y falla en el peor momento — una entrada comprada durante el show no está en
la lista precargada y se rechazaría como "de otro evento" en la puerta. Así que el orden real
es `peek_ticket_item` → comparar `evento_id` → `redeem_ticket_item` solo si coincide y la
entrada está `valid`. Cuesta dos RPC en el caso bueno y **una sola en todos los rechazos**
(usada, anulada, QR ajeno, sin permiso, evento cancelado: `peek` ya da la respuesta final).
De paso hace lo que el 040 anticipó: un escaneo accidental no quema una entrada, porque `peek`
no escribe.

Entre el `peek` y el `redeem` cabe otro escáner. No importa: manda lo que devuelve el `redeem`,
que es el único que escribe, y su atomicidad es la del spec 040.

**2. El resultado se queda 4 segundos cuando es un rechazo, no 2.** El motivo por el que este
spec pide que vuelva sola —"un botón siguiente son dos toques por persona en una fila"— se
respeta igual. Pero un `ya_usada` trae la hora del ingreso anterior, que es exactamente el dato
con el que se resuelve la discusión, y 2 segundos no alcanzan para leerla mientras hay alguien
reclamando. Verde sigue en 2 s. Tocando la pantalla se cierra antes.

**3. Hay un séptimo resultado: `folio_no_existe`.** Es de la entrada manual, no del RPC: si el
portero escribe un número que no existe en ese evento, la búsqueda en `ticket_items` vuelve
vacía y nunca se llega a llamar al canje. Decirlo como "folio no encontrado" en naranja es
distinto de decir "QR no reconocido", y en la puerta esa diferencia es la que hace que el
portero reintente en vez de mandar a la persona a la cola de reclamos.

**4. El botón de escanear está en los dos dashboards y en las entradas del evento, no en el
detalle del evento.** `DetalleEventoScreen` ya lleva a "🎟️ Entradas" y esa pantalla tiene el
botón de escanear con el evento fijado: un segundo botón al lado del primero sería dos caminos
al mismo lugar en la misma pantalla. La ruta igual queda registrada en `CarteleraStack`, que es
donde vive `EntradasEventoScreen`.

Además, `src/theme/index.ts` suma `danger` y `warning`: la paleta solo tenía `success`, y un
resultado que se lee de reojo necesita rojo y naranja propios. Y no hizo falta tocar
`src/types/index.ts` — los tipos del canje (`ResultadoCanje`, `Canje`) viven en el hook, que es
el único que los produce.

### Sin verificar en runtime

De los 9 puntos del criterio de cierre, el 9 está hecho y el 1 a medias (es el mismo archivo,
pero nadie abrió las dos pestañas). Los otros siete piden la puerta de verdad:

| # | Qué falta para cerrarlo |
|---|---|
| 2 | Una entrada emitida: producción tiene 0 tickets. Depende del 021/028 o de sembrar `ticket_items` a mano |
| 3 | Lo mismo, más una segunda lectura del mismo QR |
| 4 | **Dos teléfonos escaneando a la vez.** Es el criterio que cierra "que no se pisen" y el que valida el 040 en condiciones reales; también es el único que la prueba del 040 no pudo hacer de forma estrictamente simultánea |
| 5 | Una entrada de otro evento del mismo equipo |
| 6 | Entrada manual con un folio real |
| 7 | Negar el permiso en un dispositivo real. Escrito para que la pantalla quede usable (la entrada manual no depende de la cámara) y probado solo por lectura |
| 8 | Abrir la app en un navegador sobre HTTPS y en un teléfono. El bundle compila; el render del `CameraView` no se vio |

⚠️ El 4 y el 8 **no se pueden probar en `localhost` ni con el dev server por IP de red**: la
cámara en web exige HTTPS, y `http://192.168.x.x:8081` no lo es. Se prueban en
`app-all-lemon.vercel.app` o en nativo.

## Fuera de alcance

- **Escanear sin conexión** — spec propio; ver spec 040, *Fuera de alcance*. Hoy sin internet
  no hay canje, y conviene saberlo antes de la puerta, no durante.
- **Escáner para quien no es del equipo** (un portero contratado sin cuenta en el evento) —
  hoy hay que invitarlo como `editor` desde `EquipoEventoScreen`. Un rol "solo puerta", sin
  acceso al resto del evento, es una decisión de producto propia.
- **Leer códigos de barra que no sean QR** — no hay ninguno en el sistema.
- **Sonido o vibración al escanear** — se agrega en media hora cuando la puerta lo pida; hoy
  es decorar antes de saber si molesta en un bar con música.
- **Deshacer un canje desde la pantalla** — el RPC no lo permite (spec 040).
