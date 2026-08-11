# Spec 039 — Dashboard de entradas del evento

> Estado: **implementado el 2026-08-11.** Capa de frontend, solo lectura: muestra lo que
> los specs 036-038 dejan en la base y no escribe nada. `tsc --noEmit` limpio en `src/` y
> `expo export --platform web` compila sin error. **Falta verificar en runtime**: producción
> tiene 0 tickets (037 recién desplegado) y un solo `event_collaborators`, así que los
> puntos del criterio de cierre que piden datos reales o un segundo colaborador quedan
> pendientes — ver *Verificación* al final.

## Qué pidió Victor y qué falta de verdad

> *"Un dashboard que se inicie después de crear el evento, que quede ligado al evento y que
> enumere los tickets y cree un código QR en cada ticket. Que sea accesible por los
> organizadores: quien crea el evento tiene full acceso, y luego el segundo administrador
> que se agregue también pueda editar."*

La parte de permisos **ya está construida** y conviene decirlo antes de escribir código, para
no rehacerla:

| Requisito | Dónde ya vive |
|---|---|
| Quien crea el evento tiene acceso total | Spec 033: `events_claim_owner_trg` le da `role='owner'`, `can_delete=true`, `source='claim'` en el mismo `INSERT` |
| Un segundo admin agregado después también edita | Spec 033: `EquipoEventoScreen` + policy `ec_insert`; `can_edit_event()` cubre `owner`/`admin`/`editor` |
| El dueño del local entra solo | Spec 033: rama `venue_owner` del mismo trigger |
| Ese segundo admin ve las ventas | Spec 038 — **este es el que faltaba** |

Lo que no existe es la pantalla. Hoy el equipo de un evento tiene `EquipoEventoScreen` (quién
manda) y `VentasMusicoScreen` (cuánta plata entró), y ninguna de las dos responde la pregunta
de la puerta: **qué entradas hay, cuáles ya entraron y cuál es el QR de cada una.**

## La pantalla

`EntradasEventoScreen`, ruta `EntradasEvento: { eventoId: string }`.

```
┌─────────────────────────────────────────┐
│  Los Charros · Bar La Palma · 14 sep    │
│                                          │
│   12 emitidas   ·   5 dentro   ·  1 por  │
│                                     pagar│
├─────────────────────────────────────────┤
│  #001   Ana Ruiz          ✓ entró 21:04 │
│  #002   Ana Ruiz            válida  [QR] │
│  #003   Pedro Soto          válida  [QR] │
│  ...                                     │
│  ⏳ Compra de 2 pagada, entradas en camino│
│  ○  Compra de 1 sin pagar                │
└─────────────────────────────────────────┘
```

Tres bloques, y cada uno responde una pregunta distinta:

**1. Contadores.** `emitidas` = filas en `ticket_items`; `dentro` = las que tienen
`status='used'`; `por pagar` = suma de `cantidad` de los `tickets` en `pending`. No hay
"disponibles" porque **no hay aforo en el modelo** — sigue siendo el punto 4 del spec 022, y
`venues.aforo` que aportó el 031 todavía no lo consume nadie. Inventar un tope acá sería
decidir producto desde una pantalla.

**2. La lista enumerada.** Una fila por `ticket_item`, ordenada por `folio`. El folio va
primero y en monoespaciada: es el número que el portero busca a mano cuando la cámara no lee.
El nombre sale de `profiles` por `tickets.user_id`; si la compra es de 3, las tres filas
muestran el mismo nombre y folios distintos — es correcto, las entradas no son nominativas
(spec 036, *Fuera de alcance*).

**3. Las compras sin entradas emitidas.** El spec 037 emite al confirmar el pago, así que hay
dos casos legítimos de compra sin `ticket_items` y en la pantalla **no se pueden ver iguales**:

- `tickets.status = 'completed'` sin items → pagada, el webhook todavía no emitió (o falló).
  Se muestra como "entradas en camino". Si persiste, es la señal de que hay que mirar los logs
  de `webhook-mp`.
- `tickets.status = 'pending'` → nunca pagó. Ni siquiera es una venta.

Mezclarlos escondería exactamente el fallo que el 037 diseñó el `500` para reparar.

## El QR

Se dibuja en el cliente a partir de `ticket_items.qr_token`. No se genera imagen en el
servidor ni se guarda: el token ya está en la base y el QR es una representación de ese texto,
no un dato nuevo.

**Dependencia nueva en `package.json`:**

```
react-native-qrcode-svg   — el componente
react-native-svg          — su peer dependency, y funciona en web vía react-native-web
```

Es la única forma de tener un QR que renderice igual en Expo web (donde se prueba todo hoy) y
en nativo, sin dos implementaciones. La alternativa —un `<img>` contra una API pública de
generación de QR— manda el token de cada entrada a un tercero, que es exactamente lo que un
token de acceso no debe hacer.

Contenido del QR: **el token pelado**, sin URL ni prefijo. Un token de 32 caracteres hex entra
en el modo alfanumérico del estándar y produce un código con pocos módulos (spec 036); meterlo
dentro de una URL lo empuja al modo byte, agranda la matriz y lo vuelve más difícil de leer con
mala luz. El escáner del 041 lee texto plano y consulta la base.

## Dónde se entra — "que se inicie después de crear el evento"

Dos puertas, ninguna nueva en la estructura de navegación:

**1. Al publicar.** `CrearEventoScreen` hoy termina en `navigation.goBack()`:

```typescript
// hoy — CrearEventoScreen.tsx:142
Alert.alert('Evento publicado', `"${artista}" en ${venue.name} el ${fecha}`,
  [{ text: "OK", onPress: () => navigation.goBack() }]);
```

Pasa a llevar al dashboard del evento recién creado. `createEvento` ya devuelve
`Promise<Evento>` (`EventosContext.tsx:153`), así que el `id` está disponible sin ninguna
consulta extra:

```typescript
const nuevo = await createEvento({ ... });
Alert.alert('Evento publicado', `"${artista}" en ${venue.name} el ${fecha}`,
  [{ text: "Ver entradas", onPress: () =>
      (navigation as any).navigate('EntradasEvento', { eventoId: nuevo.id }) }]);
```

Un evento recién creado tiene cero entradas, y eso es lo que hay que mostrar: la pantalla
vacía con el contador en 0 es lo que le dice al organizador que el dashboard existe y dónde
encontrarlo después.

**2. Desde el panel de gestión.** Un botón "🎟️ Entradas" en el bloque que el spec 033 ya dejó
en `DetalleEventoScreen.tsx:342`, junto a Equipo / Cancelar / Borrar, bajo la misma condición
`permisos.puedeEditar`.

## Archivos

| Archivo | Cambio |
|---|---|
| `package.json` | `react-native-qrcode-svg`, `react-native-svg` |
| `src/types/index.ts` | `TicketItemStatus`, `interface TicketItem` |
| `src/hooks/useEntradasEvento.ts` (nuevo) | Carga `ticket_items` + `tickets` del evento, arma contadores, expone `refrescar` |
| `src/screens/EntradasEventoScreen.tsx` (nuevo) | La pantalla |
| `src/screens/DetalleEventoScreen.tsx` | Botón "Entradas" en el panel de gestión del 033 |
| `src/screens/CrearEventoScreen.tsx` | El `Alert` de éxito navega al dashboard |
| `src/navigation/MusicoStack.tsx`, `MiLocalStack.tsx`, `CarteleraStack.tsx` | Ruta `EntradasEvento`, mismo patrón que `EquipoEvento` — en las tres, porque `DetalleEventoScreen` vive en `CarteleraStack` |

`useEntradasEvento` es un hook y no una función de `EventosContext` a propósito: los datos son
de **un** evento y se cargan al abrir la pantalla. Meterlos en el context los volvería estado
global que hay que invalidar desde el escáner, desde el webhook y desde cada refresh. Mismo
criterio con el que el spec 033 dejó `useEventoPermisos` como hook aparte.

La consulta es una sola, y el join sale gratis por las FKs:

```typescript
const { data, error } = await supabase
  .from('ticket_items')
  .select('id, folio, qr_token, status, redeemed_at, ticket:tickets(user_id, cantidad, status)')
  .eq('evento_id', eventoId)
  .order('folio');
if (error) throw error;   // sin catch{} silencioso — ver abajo
```

⚠️ **Nada de `catch {}` vacío.** Es la causa raíz recurrente que `CLAUDE.md` marca y que ya
apareció en `PerfilMusicoScreen` (spec 030), en `deleteEvento` (spec 033) y en `createVenue`
(spec 031): el error se traga, la UI muestra el estado optimista y el bug aparece al recargar.
Acá el modo de fallo sería el peor posible — una lista de entradas que se ve vacía porque la
consulta falló, en la puerta, con gente esperando. El error se propaga y la pantalla lo dice.

## Permisos en la pantalla

`useEventoPermisos(eventoId).puedeEditar` decide si se renderiza. Es **defensa en
profundidad**, no la defensa: quien autoriza de verdad es RLS —`ti_select` del 036 y
`tickets_select_event_team` del 038—, que devuelve 0 filas a quien no es del equipo aunque
alguien llegue a la ruta a mano. El chequeo en cliente solo evita mostrar una pantalla que va
a salir vacía.

## Limpieza que arrastra este spec

Al tocar `MiLocalStack.tsx` hay que **borrar el comentario de 12 líneas** que documenta el
hueco de `tickets_select_event_owner`. El spec 038 lo cierra en la base; dejar el comentario
después es peor que no haberlo escrito, porque describe un comportamiento que ya no existe.
El 038 no lo borra a propósito: son dos specs que si no, escriben el mismo archivo.

## Dependencias

- **Spec 036** — hard. Sin `ticket_items` no hay nada que listar.
- **Spec 037** — hard para ver datos reales. Sin emisión, la tabla existe vacía para siempre.
- **Spec 038** — hard para el requisito de Victor. Sin él, el bloque de "compras sin emitir"
  (que sale de `tickets`) le aparece vacío al segundo admin, mientras que la lista de entradas
  —que sale de `ticket_items`, con su policy correcta de fábrica— sí se ve. Media pantalla
  llena es peor que una vacía: parece un bug de datos y es un bug de permisos.
- **Spec 033** — `useEventoPermisos` y el panel de gestión donde va el botón.
- **Spec 034 (editar evento)** — no depende, pero **toca los mismos tres archivos de
  navegación**. No correr los dos a la vez.

## Criterio de cierre

1. Publicar un evento lleva al dashboard de ese evento, con los contadores en 0
2. Tras una compra confirmada de 3 entradas, la lista muestra 3 filas con folios consecutivos
   y tres QR distintos
3. Escanear uno de esos QR con el lector del teléfono devuelve el token en texto plano
4. Un `admin` invitado al evento abre el dashboard y ve exactamente lo mismo que el `owner`
5. Un usuario que no es del equipo no llega al botón, y si llega a la ruta a mano ve la
   pantalla vacía sin filtrar nada en cliente (lo filtró RLS)
6. Una compra `completed` sin `ticket_items` aparece como "entradas en camino" y una `pending`
   como "sin pagar" — distinguibles a simple vista
7. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` limpio
8. El QR se ve y se lee **en web y en nativo** (es el motivo de elegir `react-native-svg`)

## Verificación (2026-08-11)

Hecho:

- `tsc --noEmit` limpio en `src/`
- `expo export --platform web` compila (bundle sube de 1.6MB a 1.7MB por
  `react-native-qrcode-svg` + `react-native-svg`, sin error de bundling)
- `useEntradasEvento` separa `ticket_items` (la lista) de `tickets` sin items (el bloque de
  "en camino"/"sin pagar"), sin `catch {}` silencioso — el error llega a la pantalla
- Se borró el comentario de 12 líneas de `MiLocalStack.tsx` que documentaba el hueco del
  038 y se reemplazó por una nota corta y vigente

Sin verificar en runtime — de los 8 puntos del criterio de cierre:

1. **Publicar lleva al dashboard con contadores en 0** — cableado (`CrearEventoScreen` navega
   con el `id` que devuelve `createEvento`), no ejercitado contra la app corriendo
2. **3 entradas tras una compra confirmada** — depende de una compra real (021/028) o de
   sembrar `ticket_items` a mano; no se hizo en esta sesión
3. **El QR escaneado devuelve el token en texto plano** — necesita una cámara real, spec 041
4. **Un `admin` invitado ve lo mismo que el `owner`** — mismo bloqueo que 030/031/033/034/038:
   producción solo tiene el owner automático del evento sembrado
5. **Quien no es del equipo no ve la pantalla** — verificado por lectura de código
   (`useEventoPermisos(eventoId).puedeEditar` gatea el render); RLS es la defensa real y ya
   está probada por 036/038
6. **`completed` sin items vs. `pending` se distinguen** — lógica escrita y typada
   (`estado: 'pagada_sin_emitir' | 'sin_pagar'`), no ejercitada con datos reales
7. **`tsc --noEmit` limpio** — verificado arriba
8. **El QR se ve y se lee en web y en nativo** — el bundle de web compila con
   `react-native-svg`; no se abrió un navegador para confirmar el render visual ni se probó
   en nativo

## Fuera de alcance

- **Canjear desde esta pantalla.** Se ve el estado, no se cambia. El canje es del 040/041.
  Un botón de "marcar como usada" acá sería una segunda vía de escritura sin la atomicidad del
  RPC, y en la puerta las dos vías se pisarían.
- **Aforo y "entradas disponibles"** — spec 022, y necesita `venues.aforo`.
- **Descargar o compartir el QR** (PDF, imagen, wallet) — el comprador todavía no tiene
  pantalla propia de "mis entradas"; es un spec aparte y depende de decidir el formato.
- **Reenviar la entrada por correo** — spec 029, bloqueado por el 028.
- **Buscar o filtrar la lista** — con eventos de decenas de entradas no hace falta; cuando
  haga falta, es un cambio local a esta pantalla.
