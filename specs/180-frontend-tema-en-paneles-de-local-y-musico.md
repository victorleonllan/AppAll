# Spec 180 — Tema oscuro en los paneles del local y del músico

> Estado: aplicado (13-nov-2026) — `tsc` sin errores en los 9 archivos y `expo export` web limpio; criterios 3 y 4 (`colors` y hex) sin resultados; criterios 5-7 a probar en dispositivo
> Capa: FRONTEND. `src/screens/DashboardLocalScreen.tsx`, `src/screens/PerfilMusicoScreen.tsx`,
> `src/screens/VentasMusicoScreen.tsx`, `src/screens/EditarLocalScreen.tsx`,
> `src/screens/EditarPerfilBandaScreen.tsx`, `src/screens/SolicitudesScreen.tsx`,
> `src/components/GestionDirecciones.tsx`, `src/components/TarjetaPro.tsx`,
> `src/components/BotonesPro.tsx`.
> Depende de: spec 173, spec 169 (mismos `TarjetaPro.tsx`, `DashboardLocalScreen.tsx` y `PerfilMusicoScreen.tsx`: este va después); las líneas citadas en Contexto pueden haberse movido con ese spec, ubicarlas por contenido.. **Serializar** con cualquier otro spec de la tanda que edite la
> tarjeta Pro, `BotonesPro.tsx` o los paneles de esta lista.
> Hermano en la web: W-272 (paso 5: `CardSonopolisPro`, `AvatarBadge`, `TarjetaConexion`,
> `PanelConexiones`; paso 6: `GestionDirecciones.js`).

> **En una frase:** el panel del local, el del músico, sus ventas, la edición del local y
> de la banda, las solicitudes, las direcciones y la tarjeta y botones de Pro leen la
> paleta activa.

## Contexto

173 dejó la paleta doble, `useTema`, `useEstilos` y la receta (§6). Referencias por
archivo:

| Archivo | `colors.` | Texto blanco | Fondo `accent` (línea) | Props JSX |
|---|---|---|---|---|
| `screens/DashboardLocalScreen.tsx` | 27 | 1 | 373 | 1 |
| `screens/PerfilMusicoScreen.tsx` | 29 | 1 | 396, 406, 428 | 3 |
| `screens/VentasMusicoScreen.tsx` | 18 | 0 | — | 1 |
| `screens/EditarLocalScreen.tsx` | 28 | 2 | 371, 375 | 11 |
| `screens/EditarPerfilBandaScreen.tsx` | 20 | 2 | 410, 414 | 3 |
| `screens/SolicitudesScreen.tsx` | 27 | 1 | 454 | 2 |
| `components/GestionDirecciones.tsx` | 22 | 1 | 228 | 5 |
| `components/TarjetaPro.tsx` | 8 | 1 | — | 0 |
| `components/BotonesPro.tsx` | 10 | 1 | 162 | 0 |

Casos especiales:

- `BotonesPro.tsx:147`: `insigniaVerde` con fondo hex `#E8F5E9` (insignia de Pro activo).
- `TarjetaPro.tsx` (spec 154): la etiqueta «VENCE PRONTO» tiene fondo `colors.warning` y
  texto blanco; `warning` no cambia en oscuro y el blanco sobre él da 3,1:1 (173 §1).
- Otros specs de esta tanda editan la tarjeta Pro y los paneles; de ahí la serialización
  declarada arriba.

## Decisiones

1. **Receta de 173 §6.** En claro, nada cambia de valor.
2. **`#E8F5E9` → `c.successBg`**, su valor claro exacto.

## Cambios por archivo

Los 9 archivos: receta de 173 §6, más:

- `BotonesPro.tsx`: `insigniaVerde` → `c.successBg`; texto blanco sobre el fondo `accent`
  de `:162` → `c.onAccent`.
- `TarjetaPro.tsx`: el texto de «VENCE PRONTO» sigue `c.white` (fondo `warning`).
- `DashboardLocalScreen.tsx`, `PerfilMusicoScreen.tsx`, `EditarLocalScreen.tsx`,
  `EditarPerfilBandaScreen.tsx`, `SolicitudesScreen.tsx`, `GestionDirecciones.tsx`: texto
  blanco sobre el fondo `accent` de la línea de la tabla → `c.onAccent`.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. `rg -n "colors\b" <los 9 archivos>` no muestra nada.
4. `rg -n "#[0-9A-Fa-f]{6}" <los 9 archivos>` no muestra nada.
5. En claro, Mi Local, Mi Perfil del músico, Ventas, editar local, editar banda,
   solicitudes y la tarjeta Pro (con y sin Pro, y por vencer) se ven igual que antes del
   spec.
6. En oscuro, esas pantallas tienen fondo `#121315`, tarjetas `#1C1E20` y texto claro; la
   insignia verde de Pro es `#16291B` con su texto legible.
7. En oscuro, los botones de acento (crear evento, guardar, aceptar solicitud) muestran
   texto oscuro sobre `#D4935C`.

## V-candidatas

- **180-a** — En oscuro, en un teléfono, la etiqueta «VENCE PRONTO» se lee al sol.

## Fuera de alcance

- Contenido y reglas de la tarjeta Pro: spec 154 y los specs de Pro de la tanda.
