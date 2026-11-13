# Spec 179 — Tema oscuro en crear, editar y operar un evento

> Estado: aplicado (13-nov-2026) — `tsc` sin errores en los 10 archivos y `expo export` web limpio; `rg colors` vacío en los 10; criterios 4-7 a probar en dispositivo
> Capa: FRONTEND. `src/screens/CrearEventoScreen.tsx`, `src/screens/EditarEventoScreen.tsx`,
> `src/screens/EquipoEventoScreen.tsx`, `src/screens/EntradasEventoScreen.tsx`,
> `src/screens/EscanerQRScreen.tsx`, `src/screens/CobrarEventoScreen.tsx`,
> `src/components/ArtistaSelector.tsx`, `src/components/CampoFecha.tsx`,
> `src/components/CampoImagen.tsx`, `src/components/DatosPagoEvento.tsx`.
> Depende de: spec 173, spec 165 (mismos `CrearEventoScreen.tsx` y `EditarEventoScreen.tsx`: este va después); las líneas citadas en Contexto pueden haberse movido con ese spec, ubicarlas por contenido.. **Serializar** con cualquier otro spec de la tanda que edite las
> pantallas de crear o editar evento, o los componentes de esta lista.
> Hermano en la web: W-272 (paso 5: `app/(private)/eventos/[id]/equipo/PanelEquipo.js`,
> `app/(private)/eventos/[id]/entradas/page.js`; paso 6: `Escaner.js`).

> **En una frase:** crear y editar evento, el equipo, las entradas vendidas, el escáner,
> el cobro y los campos que usan esos formularios leen la paleta activa.

## Contexto

173 dejó la paleta doble, `useTema`, `useEstilos` y la receta (§6). Referencias por
archivo:

| Archivo | `colors.` | Texto blanco | Fondo `accent` (línea) | Props JSX |
|---|---|---|---|---|
| `screens/CrearEventoScreen.tsx` | 37 | 2 | 541, 576 | 9 |
| `screens/EditarEventoScreen.tsx` | 24 | 2 | 358, 362 | 4 |
| `screens/EquipoEventoScreen.tsx` | 24 | 0 | — | 3 |
| `screens/EntradasEventoScreen.tsx` | 26 | 3 | 195, 244, 267 | 1 |
| `screens/EscanerQRScreen.tsx` | 36 | 5 | 342, 349 | 2 |
| `screens/CobrarEventoScreen.tsx` | 18 | 2 | 216, 234 | 1 |
| `components/ArtistaSelector.tsx` | 16 | 0 | — | 4 |
| `components/CampoFecha.tsx` | 5 | 0 | — | 1 |
| `components/CampoImagen.tsx` | 9 | 0 | — | 2 |
| `components/DatosPagoEvento.tsx` | 14 | 1 | 131 | 5 |

Casos especiales:

- `EscanerQRScreen.tsx:306`: `camaraWrap` con fondo `colors.primary` detrás de la cámara.
  Es superficie de marca → `block`. El resultado del escaneo usa `success`, `danger` y
  `warning` como fondo con texto blanco (spec 041: el color llega antes que la palabra);
  esos tres tokens conservan blanco legible en oscuro (contraste ≥ 3,1, ver 173 §1).
- `EntradasEventoScreen.tsx:265`: `qrWrap` con fondo `colors.white` bajo el QR que se
  muestra en el modal (`:171`). Se queda blanco a propósito (receta §6.5). El QR usa los
  colores por defecto de `react-native-qrcode-svg` (negro sobre blanco), que no dependen
  del tema. El velo de `:253` se queda.
- Los formularios de crear y editar evento usan `GeneroPicker`, que migra 176, y
  `CampoFecha`, cuyo selector nativo sigue claro (ver 173, «Fuera de alcance»).
- Otros specs de esta tanda editan `CrearEventoScreen.tsx` y `EditarEventoScreen.tsx`; de
  ahí la serialización declarada arriba.

## Decisiones

1. **Receta de 173 §6.** En claro, nada cambia de valor.
2. **La superficie de la cámara del escáner → `c.block`**; los fondos de resultado siguen
   en `c.success`/`c.danger`/`c.warning` con texto `c.white`.

## Cambios por archivo

Los 10 archivos: receta de 173 §6, más:

- `EscanerQRScreen.tsx`: `camaraWrap.backgroundColor` → `c.block`; texto blanco sobre los
  fondos `accent` de `:342` y `:349` → `c.onAccent`; el texto blanco sobre la cámara y
  sobre los fondos de resultado sigue `c.white`.
- `EntradasEventoScreen.tsx`: `qrWrap` conserva `c.white`; texto blanco sobre los fondos
  `accent` de la tabla → `c.onAccent`.
- `CrearEventoScreen.tsx`, `EditarEventoScreen.tsx`, `CobrarEventoScreen.tsx`,
  `DatosPagoEvento.tsx`: texto blanco sobre el fondo `accent` de la línea de la tabla →
  `c.onAccent`.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. `rg -n "colors\b" <los 10 archivos>` no muestra nada.
4. En claro, crear evento, editar evento, equipo, entradas vendidas, escáner y cobrar se
   ven igual que antes del spec.
5. En oscuro, esas pantallas tienen fondo `#121315`, campos `#1C1E20` con texto claro y
   placeholder `#8A868D`; el selector de artista y el campo de imagen se leen.
6. En oscuro, el modal de una entrada en `EntradasEvento` muestra el QR negro sobre un
   recuadro blanco.
7. En oscuro, el resultado del escáner (válida, ya usada, inválida) mantiene su color de
   fondo con texto blanco.

## V-candidatas

- **179-a** — Con tema oscuro, en un teléfono, el escáner lee un QR mostrado en otro
  teléfono también en oscuro.

## Fuera de alcance

- Selector nativo de fecha y hora en oscuro: 173, «Fuera de alcance».
- Cambios de función en crear y editar evento: los traen otros specs de la tanda.
