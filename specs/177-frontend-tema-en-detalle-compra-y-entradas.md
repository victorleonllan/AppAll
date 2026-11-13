# Spec 177 — Tema oscuro en el detalle del evento, la compra y las entradas

> Estado: aplicado (13-nov-2026) — receta de 173 §6 en los 13 archivos; hex a `dangerBg`/`dangerText`/`warningBg`/`warningText`; `estadosCompra(c)` y el mapa del talón pasan a función; cabecera del talón y «próxima» en `block`; QR en `paletaClara`; `onAccent` sobre todo fondo de acento. Criterios 1-4 verificados (`tsc` sin salida, `expo export --platform web` OK, sin `colors` ni hex en los 13 archivos); 5-8 y V-candidata 177-a a probar en dispositivo
> Capa: FRONTEND. `src/screens/DetalleEventoScreen.tsx`, `src/components/AccionesEvento.tsx`,
> `src/components/AvisoCancelacion.tsx`, `src/components/PreventasEvento.tsx`,
> `src/screens/ConfirmacionCompraScreen.tsx`, `src/screens/MisEntradasScreen.tsx`,
> `src/components/TalonEntrada.tsx`, `src/components/BotonReenviarEntrada.tsx`,
> `src/components/OptInWhatsApp.tsx`, `src/components/AvisarWhatsApp.tsx`,
> `src/components/ModalSolicitud.tsx`, `src/screens/PanelFanScreen.tsx`,
> `src/components/BotonCerrarEvento.tsx`.
> Depende de: spec 173, spec 166 (mismos `DetalleEventoScreen.tsx` y `ConfirmacionCompraScreen.tsx`: este va después); las líneas citadas en Contexto pueden haberse movido con ese spec, ubicarlas por contenido.. **Serializar** con cualquier otro spec de la tanda que edite
> `DetalleEventoScreen.tsx` o los componentes de esta lista.
> Hermano en la web: W-272 (paso 5: `app/(private)/mis-entradas/page.js`,
> `compra/confirmacion/Confirmacion.js`, `AvisoColaboraciones`; paso 6: hex de
> `Confirmacion.js`).

> **En una frase:** el detalle del evento, sus acciones, la confirmación de compra, las
> entradas del fan y su talón leen la paleta activa, con los hex sueltos de error y
> advertencia pasados a tokens.

## Contexto

173 dejó la paleta doble, `useTema`, `useEstilos` y la receta (§6). Referencias por
archivo:

| Archivo | `colors.` | Texto blanco | Fondo `accent` (línea) | Props JSX |
|---|---|---|---|---|
| `screens/DetalleEventoScreen.tsx` | 37 | 2 | 611, 739 | 1 |
| `components/AccionesEvento.tsx` | 18 | 1 | — | 4 |
| `components/AvisoCancelacion.tsx` | 5 | 0 | — | 0 |
| `components/PreventasEvento.tsx` | 23 | 2 | 333, 342 | 7 |
| `screens/ConfirmacionCompraScreen.tsx` | 10 | 1 | 313 | 0 |
| `screens/MisEntradasScreen.tsx` | 15 | 1 | 154 | 2 |
| `components/TalonEntrada.tsx` | 22 | 5 | — | 1 |
| `components/BotonReenviarEntrada.tsx` | 6 | 0 | — | 0 |
| `components/OptInWhatsApp.tsx` | 10 | 0 | — | 2 |
| `components/AvisarWhatsApp.tsx` | 17 | 1 | 189, 204 | 0 |
| `components/ModalSolicitud.tsx` | 12 | 1 | 200 | 1 |
| `screens/PanelFanScreen.tsx` | 20 | 4 | — | 0 |
| `components/BotonCerrarEvento.tsx` | 4 | 1 | 77 | 1 |

Casos especiales:

- **Hex:** `DetalleEventoScreen.tsx:696` (`#FDECEA`, fondo del botón de peligro), `:697` y
  `:734` (`#B71C1C`, texto de error); `ConfirmacionCompraScreen.tsx:68` (`#B71C1C`, estado
  `failure`), `:74`, `:80`, `:309` (`#F57F17`, estados `pending` y `timeout` y texto del
  indicador de sondeo) y `:304` (`#FFF3E0`, fondo del indicador).
- **Constante de módulo con colores:** el mapa de estados de `ConfirmacionCompraScreen.tsx`
  (`:60-82`, `icon`/`color`/`titulo`/`mensaje` por estado) guarda colores fuera de
  `StyleSheet`; con un objeto fijo no seguiría el tema.
- **Superficies de marca:** `TalonEntrada.tsx:99` (cabecera del talón) y
  `PanelFanScreen.tsx:251` (`proxima`, la próxima entrada) tienen fondo `colors.primary` y
  texto blanco. W-272 deja la cabecera del ticket como bloque oscuro.
- **El QR del talón** (`TalonEntrada.tsx:67-72`) se dibuja con `backgroundColor={colors.white}`
  y `color={anulada ? colors.muted : colors.primary}`. Con la receta a ciegas, en oscuro
  `primary` vale `#F6F5F4` y el QR quedaría casi blanco sobre blanco: ilegible para el
  escáner del spec 041.
- **Velos:** `DetalleEventoScreen.tsx:703`, `AvisarWhatsApp.tsx:161`,
  `ModalSolicitud.tsx:165`: se quedan.
- `DetalleEventoScreen.tsx` lo editan también otros specs de esta tanda (paridad de
  funciones con la web); de ahí la serialización declarada arriba.

## Decisiones

1. **Receta de 173 §6.** En claro, nada cambia de valor.
2. **Hex → tokens de 173 §2:** `#FDECEA` → `c.dangerBg`; `#B71C1C` → `c.dangerText`;
   `#FFF3E0` → `c.warningBg`; `#F57F17` → `c.warningText`. Son los valores claros exactos,
   así que el claro no cambia.
3. **El mapa de estados de `ConfirmacionCompraScreen` pasa a función** `estadosCompra(c:
   Paleta)` y el componente la llama con `colores` de `useTema` (receta §6.4). El estado
   `success` mantiene `c.success`.
4. **Cabecera del talón y tarjeta «próxima» → `c.block`**, texto sigue `c.white`. Mismo
   criterio que el evento destacado.
5. **El QR no sigue el tema:** fondo `c.white` y módulos `paletaClara.primary` (o
   `paletaClara.muted` si está anulada), importando `paletaClara` explícitamente con un
   comentario. Un QR necesita módulos oscuros sobre fondo claro para leerse; es el mismo
   criterio de 173 §6.5 para el fondo blanco bajo un QR.

## Cambios por archivo

Los 13 archivos: receta de 173 §6, más:

- `DetalleEventoScreen.tsx`: `botonPeligro` → `c.dangerBg`, `textoBotonPeligro` y
  `errorText` → `c.dangerText`; texto blanco sobre los fondos `accent` de `:611` y `:739`
  → `c.onAccent`.
- `ConfirmacionCompraScreen.tsx`: Decisión 3; `pollingIndicator` → `c.warningBg`,
  `pollingText` → `c.warningText`; texto sobre el botón `accent` de `:313` → `c.onAccent`.
- `TalonEntrada.tsx`: `cabecera.backgroundColor` → `c.block`; el `QRCode` según la
  Decisión 5.
- `PanelFanScreen.tsx`: `proxima.backgroundColor` → `c.block`.
- `PreventasEvento.tsx`, `MisEntradasScreen.tsx`, `AvisarWhatsApp.tsx`,
  `ModalSolicitud.tsx`, `BotonCerrarEvento.tsx`: texto blanco sobre el fondo `accent` de
  la línea de la tabla → `c.onAccent`.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. `rg -n "colors\b" <los 13 archivos>` no muestra nada.
4. `rg -n "#[0-9A-Fa-f]{6}" <los 13 archivos>` no muestra nada.
5. En claro, el detalle de un evento (con y sin sesión, con preventas), la confirmación en
   sus cuatro estados (`success`, `failure`, `pending`, `timeout`), Mis entradas, un talón
   y el panel del fan se ven igual que antes del spec.
6. En oscuro, esas pantallas tienen fondo `#121315`, tarjetas `#1C1E20` y texto claro; el
   botón de peligro del detalle es rojo tenue oscuro (`#3A1D18`) con texto `#F28B7D`.
7. En oscuro, la cabecera del talón y la tarjeta «próxima» del panel del fan son
   `#1C1E20` con texto blanco, y el QR del talón sigue sobre blanco.
8. En oscuro, todo botón de acento (comprar, enviar solicitud, avisar por WhatsApp,
   cerrar evento) muestra texto oscuro sobre `#D4935C`.

## V-candidatas

- **177-a** — Con tema oscuro y brillo de pantalla bajo, el QR del talón se escanea con el
  escáner del spec 041 igual que en claro.

## Fuera de alcance

- La imagen compartible del talón y los correos de entrada: W-272 deja fuera las imágenes
  generadas y los correos.
- Cambios de función en `DetalleEventoScreen`: los traen otros specs de la tanda.
