# Spec 174 — Botón de tema en el header y navegación en claro y oscuro

> Estado: aplicado (13-nov-2026) — criterios 1 y 2 verificados (`tsc` limpio, `expo export --platform web` sin error); 3 deja una sola línea, la clave `colors` del tema de React Navigation (ver addenda); 4-7 y V-candidatas sin verificar en dispositivo
> Capa: FRONTEND. `src/components/BotonTema.tsx` (nuevo), `src/navigation/index.tsx`,
> `src/navigation/CarteleraStack.tsx`, `src/navigation/LocalesStack.tsx`,
> `src/navigation/MiLocalStack.tsx`, `src/navigation/MusicoStack.tsx`,
> `src/navigation/PerfilStack.tsx`.
> Depende de: spec 173
> Hermano en la web: W-272 (`components/BotonTema.js`, montado en `components/Nav.js` y
> `components/AuthNav.js`).

> **En una frase:** cada pantalla con header muestra a la derecha un botón con luna o sol
> que cambia entre tema claro y oscuro, y el header, la barra de pestañas y el fondo de la
> navegación toman la paleta activa.

## Contexto

En la web el botón vive en la barra de navegación, visible en todas las páginas y sin
sesión: variante `icono` (36 px, sol o luna) en `Nav` desde `md` y siempre en `AuthNav`;
en celular va como fila dentro del menú hamburguesa, porque la barra móvil ya lleva logo,
CTA y hamburguesa y un cuarto elemento la haría más ancha que 360 px (W-272, «El botón»).
Sus textos son «Modo oscuro» y «Modo claro».

En la app el equivalente de la barra de navegación es el header de los stacks. Los cinco
stacks lo configuran igual en `screenOptions`, con superficie `colors.primary` y texto
`colors.white`: `CarteleraStack.tsx:45-46`, `LocalesStack.tsx:23-24`,
`MiLocalStack.tsx:47-48`, `MusicoStack.tsx:47-48`, `PerfilStack.tsx:31-32`. El header solo
lleva el título: ninguna pantalla define `headerRight` (`rg -n "headerRight|setOptions"
src` no encuentra nada), así que hay lugar.

`navigation/index.tsx` pinta la barra de pestañas (`:50-53`, `tabBarActiveTintColor:
colors.accent`, inactivo `colors.muted`) y la vista de carga (`:31-32`). El
`NavigationContainer` (`:39`) no recibe `theme`, así que React Navigation usa su
`DefaultTheme`: fondo de pantalla y barra de pestañas claros aunque la app esté en oscuro.

## Decisiones

1. **Una sola variante, icono, en el `headerRight` de los cinco stacks.** El header de la
   app tiene el título y nada más, así que el problema de ancho que llevó a la web a meter
   el botón en el menú no existe. Al ponerlo en `screenOptions` aparece en toda pantalla con
   header, con o sin sesión, como en la web. Descartado ponerlo en `PerfilScreen`: sin
   sesión la tercera pestaña es `AuthScreen` (`navigation/index.tsx:18`) y la persona sin
   cuenta no podría cambiar el tema, cosa que en la web sí puede.
2. **Luna en claro, sol en oscuro.** El icono muestra el tema al que se va, igual que la
   web. `Ionicons` `moon-outline` y `sunny-outline` (`@expo/vector-icons`, ya usado en
   `navigation/index.tsx:3`), tamaño 22, color `c.white`: el header es `block`, oscuro en
   los dos temas.
3. **Área táctil de 36 × 36**, la medida de la variante `icono` de la web, con `hitSlop` de
   8 para llegar a 44 efectivos, el mínimo táctil de las guías de iOS.
4. **Accesibilidad:** `accessibilityRole="button"` y `accessibilityLabel` «Modo oscuro» en
   claro y «Modo claro» en oscuro: los textos de la variante `fila` de la web.
5. **Tema de React Navigation derivado de la paleta.** `NavigationContainer` recibe
   `theme`: `DarkTheme` o `DefaultTheme` de `@react-navigation/native` según `tema`, con
   `colors` reemplazados por `{ primary: accent, background, card: cardBackground, text:
   primary, border, notification: danger }`. Sin esto, el fondo detrás de cada pantalla y
   la barra de pestañas quedan claros en oscuro. Se parte de `DarkTheme`/`DefaultTheme`
   porque en v7 el tema exige también `fonts`.

## Cambios por archivo

### `src/components/BotonTema.tsx` (nuevo)

Componente sin props. Lee `tema` y `alternar` de `useTema` (173). `TouchableOpacity`
36 × 36, centrado, `hitSlop={8}`, con el `Ionicons` de la Decisión 2. Comentario arriba que
cite W-272 y la Decisión 1.

### `src/navigation/index.tsx`

- Receta de migración de 173 §6: la vista de carga (`:31-32`) y `screenOptions` (`:50-53`)
  leen `colores` de `useTema`. `headerStyle` → `colores.block`.
- `NavigationContainer theme={temaNavegacion}`, con `temaNavegacion` calculado con
  `useMemo` sobre `tema` y `colores` (Decisión 5).

### `src/navigation/CarteleraStack.tsx`, `LocalesStack.tsx`, `MiLocalStack.tsx`, `MusicoStack.tsx`, `PerfilStack.tsx`

En cada `screenOptions`:

- `headerStyle: { backgroundColor: colores.block }`, `headerTintColor: colores.white`, con
  `colores` de `useTema`.
- `headerRight: () => <BotonTema />`.

Nada más cambia: títulos, pantallas y `headerShown: false` existentes quedan igual.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. `rg -n "colors\b" src/navigation src/components/BotonTema.tsx` no muestra nada.
4. En la Cartelera, sin sesión, el header muestra la luna; al tocarla, el header, la barra
   de pestañas y el fondo de la navegación pasan a oscuro sin recargar y el icono pasa a
   sol.
5. Con el tema oscuro elegido, cerrar y volver a abrir la app (o recargar en web) arranca
   en oscuro.
6. En claro, el header, la barra de pestañas y la vista de carga se ven igual que antes
   del spec (mismos colores).
7. El botón aparece en el header de pantallas de los cinco stacks (por ejemplo Cartelera,
   Detalle del local, Mi Local, Mi Perfil, Perfil) y no en las que tienen
   `headerShown: false`.

## V-candidatas

- **174-a** — Con un lector de pantalla (VoiceOver/TalkBack), el botón se anuncia como
  «Modo oscuro, botón» en claro y «Modo claro, botón» en oscuro.
- **174-b** — En un teléfono de 360 px de ancho, un título largo («Equipo del evento»)
  no se superpone con el botón.

## Fuera de alcance

- Fila «Modo oscuro / Modo claro» en un menú: la app no tiene menú hamburguesa
  (Decisión 1).
- El contenido de las pantallas: 176–182.
- `StatusBar` (`App.tsx:31`): sigue `light`, ver 173.

## Bugs encontrados al aplicar

- **13-nov-2026 — el criterio 3 choca con la Decisión 5.** `rg -n "colors\b" src/navigation
  src/components/BotonTema.tsx` encuentra `navigation/index.tsx:38`, `colors: {`: es la
  clave obligatoria del tipo `Theme` de React Navigation que la Decisión 5 manda
  reemplazar, no el alias deprecado `colors` de `src/theme`. Ningún archivo del spec
  importa ya `colors` de `../theme`; el criterio debió decir
  `rg -n "colors\." src/navigation src/components/BotonTema.tsx` (o excluir esa clave).
