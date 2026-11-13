# Spec 176 — Tema oscuro en la cartelera, los locales y los músicos

> Estado: propuesto, sin aplicar (13-nov-2026)
> Capa: FRONTEND. `src/screens/CarteleraScreen.tsx`, `src/components/EventoDestacado.tsx`,
> `src/components/TarjetaEvento.tsx`, `src/components/TarjetaEventoExterno.tsx`,
> `src/components/PrecioEvento.tsx`, `src/components/GeneroPicker.tsx`,
> `src/components/PaisPicker.tsx`, `src/screens/LocalesScreen.tsx`,
> `src/screens/DetalleLocalScreen.tsx`, `src/screens/MapaLocalesScreen.tsx`,
> `src/components/MapaLocales.tsx`, `src/lib/mapa.ts`,
> `src/screens/DirectorioMusicosScreen.tsx`, `src/screens/VerMusicoScreen.tsx`,
> `src/components/BotonSeguir.tsx`.
> Depende de: spec 173, spec 167 (mismos `CarteleraScreen.tsx` y `EventoDestacado.tsx`: este va después); las líneas citadas en Contexto pueden haberse movido con ese spec, ubicarlas por contenido., spec 175 (mismo archivo `CarteleraScreen.tsx`: este va después).
> Hermano en la web: W-272 (paso 5: `TarjetaEvento`, `TarjetaEventoExterno`,
> `FichaLocalMapa`, `MapaLocales`, `BotonVerEnMapa`; addenda del 12-nov: `EventoDestacado`
> con `--son-bloque`).

> **En una frase:** las pantallas públicas —cartelera, tarjetas de evento, locales, mapa y
> músicos— leen la paleta activa, así que se ven en oscuro cuando el tema es oscuro y
> exactamente igual que hoy cuando es claro.

## Contexto

173 dejó `paletaClara`/`paletaOscura`, `useTema`, `useEstilos` y la receta de migración
(§6). Estos 15 archivos son lo que ve cualquiera sin sesión. Referencias a `colors`
(`rg -c "colors\." <archivo>`):

| Archivo | `colors.` | Texto blanco | Fondo `accent` (línea) | Props JSX |
|---|---|---|---|---|
| `screens/CarteleraScreen.tsx` | 27 (+2 de 175) | 2 | 352, 386 | 3 |
| `components/EventoDestacado.tsx` | 9 | 5 | — | 0 |
| `components/TarjetaEvento.tsx` | 7 | 1 | 58 | 0 |
| `components/TarjetaEventoExterno.tsx` | 6 | 0 | — | 0 |
| `components/PrecioEvento.tsx` | 5 | 0 | — | 0 |
| `components/GeneroPicker.tsx` | 11 | 0 | — | 1 |
| `components/PaisPicker.tsx` | 11 | 0 | — | 1 |
| `screens/LocalesScreen.tsx` | 12 | 0 | — | 0 |
| `screens/DetalleLocalScreen.tsx` | 23 | 1 | 181 | 2 |
| `screens/MapaLocalesScreen.tsx` | 13 | 1 | 131 | 0 |
| `components/MapaLocales.tsx` | 2 | 0 | — | 0 |
| `lib/mapa.ts` | 4 | 0 | — | 0 |
| `screens/DirectorioMusicosScreen.tsx` | 22 | 1 | 189 | 2 |
| `screens/VerMusicoScreen.tsx` | 16 | 1 | 274 | 1 |
| `components/BotonSeguir.tsx` | 5 | 1 | 80 | 0 |

Casos especiales:

- `EventoDestacado.tsx:63`: la tarjeta tiene fondo `colors.primary` con todo el texto en
  `colors.white` (`:81-88`). Es superficie de marca → `c.block`; el texto sigue blanco. El
  chip «Destacado» (`:74-80`) es `accentLight` con texto `accent`: queda en tokens.
- Velos `rgba(0,0,0,0.4)` en `CarteleraScreen.tsx:394`, `PaisPicker.tsx:99` y
  `GeneroPicker.tsx:110`: se quedan (receta §6.5).
- El mapa: `MapaLocales.tsx:53-58` dibuja un `Callout` de `react-native-maps`, cuya burbuja
  es nativa y blanca en los dos temas, y `lib/mapa.ts:24-27` asigna el color de cada
  marcador sobre las teselas del mapa, que también son claras. W-272 deja el mapa claro
  dentro de la página oscura («Fuera de alcance»).
- `GeneroPicker` también lo abren los formularios de crear y editar evento, local y banda
  (spec 146). Migrarlo aquí los alcanza a todos.

## Decisiones

1. **Receta de 173 §6, sin excepciones** salvo el mapa. En claro cada reemplazo da el mismo
   valor, así que el tema claro no cambia.
2. **El mapa queda claro:** `MapaLocales.tsx` y `lib/mapa.ts` cambian `colors` por
   `paletaClara` importada explícitamente, con comentario que cite W-272. Así el texto del
   callout no se vuelve claro sobre la burbuja blanca. `MapaLocalesScreen.tsx` (la pantalla
   alrededor del mapa) sí sigue el tema.
3. **El botón «Limpiar filtros» de 175** pasa su texto a `c.onAccent`, como toda píldora
   activa.

## Cambios por archivo

En los 13 archivos de pantalla y componente (todos menos `MapaLocales.tsx` y `lib/mapa.ts`):
receta de 173 §6. En concreto:

- `CarteleraScreen.tsx`: `filtroTextoActivo` (`:353`) y `limpiarTexto` (175) →
  `c.onAccent`; `ActivityIndicator` (`:219`), `placeholderTextColor` (`:246`) y `trackColor` del
  `Switch` (`:279`) desde `useTema`; el texto de `botonReintentar` (`:385-386`) →
  `c.onAccent`.
- `EventoDestacado.tsx`: `tarjeta.backgroundColor` → `c.block`.
- `TarjetaEvento.tsx`, `DetalleLocalScreen.tsx`, `MapaLocalesScreen.tsx`,
  `DirectorioMusicosScreen.tsx`, `VerMusicoScreen.tsx`, `BotonSeguir.tsx`: el texto blanco
  que va sobre el fondo `accent` de la línea indicada en la tabla → `c.onAccent`.

`MapaLocales.tsx` y `lib/mapa.ts`: `import { paletaClara } from '../theme'` en lugar de
`colors`, y `colors.x` → `paletaClara.x`.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. `rg -n "colors\b" <los 15 archivos>` no muestra nada.
4. `rg -n "#[0-9A-Fa-f]{6}" <los 15 archivos>` no muestra nada.
5. En claro, la cartelera, una tarjeta destacada, una externa, el detalle de un local, el
   mapa, el directorio y el perfil de un músico se ven igual que antes del spec.
6. En oscuro, esas mismas pantallas tienen fondo `#121315`, tarjetas `#1C1E20` y texto
   claro; ningún texto queda oscuro sobre fondo oscuro.
7. En oscuro, el texto de la píldora activa de fechas, de «Limpiar filtros» y del botón de
   seguir es oscuro sobre el acento (`#08090A` sobre `#D4935C`).
8. En oscuro, la burbuja del mapa muestra el nombre del local en el marrón oscuro de
   siempre sobre fondo blanco.
9. El selector de género del formulario de crear evento sigue funcionando y sigue el tema.

## V-candidatas

- **176-a** — En Android e iOS, con tema oscuro, la burbuja del mapa y los marcadores se
  ven como en claro.

## Fuera de alcance

- **W-273** (evento destacado: en el tema claro el reposo toma el negro aclarado del hover
  y el hover el negro puro): es un cambio de estado *hover*, que solo existe con mouse. En
  táctil no hay hover; el destacado de la app ya da respuesta al tocar con
  `activeOpacity={0.8}` (`EventoDestacado.tsx:25`). Además, el color de reposo que pide
  W-273 sale de mezclar el negro de la web (`#08090A`) con su fondo, y el destacado de la
  app es el marrón `block`.
- **W-274** (mismo margen a los dos lados del flyer del destacado): en la web el flyer tenía
  8 px a la izquierda y 16 px hacia el texto. La app no tiene ese desbalance: la tarjeta
  usa `padding: 14` y `gap: 12` (`EventoDestacado.tsx:66-69`), 14 px a la izquierda del
  flyer y 12 px hacia el texto.
- Mapa con teselas oscuras: igual que la web.
- El botón «Limpiar filtros» en sí: 175.
