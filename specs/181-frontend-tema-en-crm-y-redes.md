# Spec 181 — Tema oscuro en los contactos, el correo y las redes del CRM

> Estado: propuesto, sin aplicar (13-nov-2026)
> Capa: FRONTEND. `src/screens/ContactosScreen.tsx`, `src/components/RedactarCorreo.tsx`,
> `src/screens/RedesScreen.tsx`, `src/screens/PublicarRedesScreen.tsx`,
> `src/components/redes/ComunRedes.tsx`, `src/components/redes/MediosRedes.tsx`.
> Depende de: spec 173, spec 169 (mismo `ContactosScreen.tsx`: este va después); las líneas citadas en Contexto pueden haberse movido con ese spec, ubicarlas por contenido.. **Serializar** con cualquier otro spec de la tanda que edite
> estos archivos.
> Hermano en la web: W-272 (paso 5 y 6: `RedactarCorreo`; los componentes de
> `components/redes/` toman el tema por sus clases daisyUI).

> **En una frase:** la lista de contactos, el redactor de correo y las pantallas de redes
> del CRM de Sonópolis Pro leen la paleta activa.

## Contexto

173 dejó la paleta doble, `useTema`, `useEstilos` y la receta (§6). Referencias por
archivo:

| Archivo | `colors.` | Texto blanco | Fondo `accent` (línea) | Props JSX |
|---|---|---|---|---|
| `screens/ContactosScreen.tsx` | 32 | 2 | 300 | 3 |
| `components/RedactarCorreo.tsx` | 31 | 2 | 233, 272 | 0 |
| `screens/RedesScreen.tsx` | 31 | 1 | 391 | 2 |
| `screens/PublicarRedesScreen.tsx` | 36 | 2 | 554, 567 | 5 |
| `components/redes/ComunRedes.tsx` | 7 | 0 | — | 2 |
| `components/redes/MediosRedes.tsx` | 10 | 2 | — | 1 |

Casos especiales:

- **Blanco como superficie:** `RedactarCorreo.tsx:258` (`vista`, la vista previa del
  correo) y `PublicarRedesScreen.tsx:527`, `:536` (campos de texto) y `:552` (chip de red
  sin elegir). Son superficies de tarjeta o campo. La web, en W-272, pasó la superficie
  blanca de `RedactarCorreo` a `base-100` (la tarjeta del tema).
- **Miniaturas de medios** (`MediosRedes.tsx:90-120`): velo `rgba(0,0,0,0.45)` con texto
  blanco encima (`textoCapa`), barra de progreso con pista `rgba(255,255,255,0.35)` y
  relleno `colors.white` (`:108`), y botón «quitar» redondo con fondo `colors.primary`
  (`:116`) y ✕ blanco. Todo va sobre una foto o un velo.

## Decisiones

1. **Receta de 173 §6.** En claro, nada cambia de valor.
2. **Los cuatro fondos blancos de superficie → `c.cardBackground`**, igual que la web con
   `RedactarCorreo`. En claro valen lo mismo (`#FFFFFF`).
3. **Lo que va sobre una foto o un velo no cambia:** relleno de la barra y `textoCapa` de
   `MediosRedes` siguen `c.white`. El botón «quitar» es un botón con fondo `primary`:
   conserva `c.primary` y su ✕ pasa a `c.onPrimary` (173 §6.5). En oscuro queda un
   círculo claro con ✕ oscuro sobre la foto.

## Cambios por archivo

Los 6 archivos: receta de 173 §6, más:

- `RedactarCorreo.tsx`: `vista.backgroundColor` → `c.cardBackground`; texto blanco sobre
  los fondos `accent` de `:233` y `:272` → `c.onAccent`.
- `PublicarRedesScreen.tsx`: `:527`, `:536`, `:552` → `c.cardBackground`;
  `textoChipActivo` y el texto sobre el fondo `accent` de `:567` → `c.onAccent`.
- `MediosRedes.tsx`: `quitar` conserva `c.primary` y `textoQuitar` → `c.onPrimary`;
  `relleno` y `textoCapa` siguen `c.white`; los `rgba` se quedan.
- `ContactosScreen.tsx`, `RedesScreen.tsx`: texto blanco sobre el fondo `accent` de la
  línea de la tabla → `c.onAccent`.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. `rg -n "colors\b" <los 6 archivos>` no muestra nada.
4. En claro, Contactos, el redactor de correo con su vista previa, Redes y Publicar en
   redes (con medios subiendo) se ven igual que antes del spec.
5. En oscuro, esas pantallas tienen fondo `#121315`, campos y vista previa `#1C1E20` con
   texto claro; los chips de red elegidos muestran texto oscuro sobre `#D4935C`.
6. En oscuro, una miniatura subiendo muestra el velo, el porcentaje en blanco y la barra
   blanca, igual que en claro.

## V-candidatas

- **181-a** — En oscuro, en un teléfono, el botón «quitar» de una miniatura se distingue
  sobre un flyer oscuro.

## Fuera de alcance

- El correo que recibe el contacto: W-272 deja los correos fuera del tema.
- La vista previa del correo con el aspecto exacto del cliente de correo: hoy es una
  tarjeta de la app y sigue siéndolo.
