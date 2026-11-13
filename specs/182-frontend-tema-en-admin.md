# Spec 182 — Tema oscuro en las pantallas de admin

> Estado: propuesto, sin aplicar (13-nov-2026)
> Capa: FRONTEND. `src/screens/AdminScreen.tsx`, `src/screens/AdminCrmScreen.tsx`,
> `src/screens/AdminEventosScreen.tsx`, `src/screens/AdminLocalesScreen.tsx`,
> `src/screens/AdminPagosScreen.tsx`, `src/screens/AdminTenantScreen.tsx`.
> Depende de: spec 173, spec 170 y spec 172 (mismos `AdminTenantScreen.tsx` y `AdminScreen.tsx`: este va después); las líneas citadas en Contexto pueden haberse movido con ese spec, ubicarlas por contenido.. **Serializar** con cualquier otro spec de la tanda que edite
> pantallas de admin.
> Hermano en la web: W-272 (paso 5: `app/(private)/admin/**`; tokens `--son-yellow-*` y
> `--son-cerrado-*`).

> **En una frase:** el panel de admin, su CRM, eventos, locales, pagos y la ficha de cada
> tenant leen la paleta activa, con los amarillos de aviso y el gris de evento cerrado
> pasados a tokens.

## Contexto

173 dejó la paleta doble, `useTema`, `useEstilos` y la receta (§6). Referencias por
archivo:

| Archivo | `colors.` | Texto blanco | Fondo `accent` (línea) | Props JSX |
|---|---|---|---|---|
| `screens/AdminScreen.tsx` | 6 | 0 | — | 1 |
| `screens/AdminCrmScreen.tsx` | 14 | 0 | — | 1 |
| `screens/AdminEventosScreen.tsx` | 11 | 0 | — | 0 |
| `screens/AdminLocalesScreen.tsx` | 29 | 2 | — | 3 |
| `screens/AdminPagosScreen.tsx` | 19 | 0 | — | 0 |
| `screens/AdminTenantScreen.tsx` | 45 | 1 | 425 | 3 |

Casos especiales:

- **Constantes hex a nivel de módulo:**
  - `AdminEventosScreen.tsx:14` `CERRADO_FONDO = '#EFEAE5'`, usada en `filaCerrada`
    (`:162`).
  - `AdminLocalesScreen.tsx:19-21` `AMARILLO_FONDO` `#FFF8E1`, `AMARILLO_BORDE` `#F5D77A`,
    `AMARILLO_TEXTO` `#8D6E00`, usadas en `:282`, `:284` y `:289`.
  - `AdminPagosScreen.tsx:16-17` `AMARILLO_FONDO` `#FFF8E1`, `AMARILLO_BORDE` **`#FFE082`**,
    usadas en `:239`.
  - `AdminTenantScreen.tsx:36-37` `AMARILLO_FONDO` `#FFF8E1`, `AMARILLO_BORDE` `#F5D77A`,
    usadas en `:383`, `:385`, `:434`, `:436`.
- **Blanco como superficie de campo:** `AdminLocalesScreen.tsx:268` y
  `AdminTenantScreen.tsx:420`.
- **Botones con fondo `primary`:** `AdminLocalesScreen.tsx:300` (`botonOscuro`, texto
  `botonOscuroTexto` blanco en `:302`) y `:309` (`botonPrimario`, texto en `:314`). Con
  `block` desaparecerían sobre la tarjeta oscura (173 §2).
- Otros specs de esta tanda editan pantallas de admin; de ahí la serialización declarada
  arriba.

## Decisiones

1. **Receta de 173 §6.** En claro, nada cambia de valor salvo el borde de la Decisión 2.
2. **Constantes hex → tokens de 173 §2**, y las constantes se borran:
   `CERRADO_FONDO` → `c.closedBg`; `AMARILLO_FONDO` → `c.highlightBg`; `AMARILLO_BORDE` →
   `c.highlightBorder`; `AMARILLO_TEXTO` → `c.highlightText`. En `AdminPagosScreen` el
   borde pasa de `#FFE082` a `#F5D77A`: dos amarillos casi iguales para el mismo rol, el
   mismo criterio con que W-272 unificó sus ámbar. Es el único cambio visible en claro de
   toda la serie.
3. **Campos blancos → `c.cardBackground`.**
4. **Botones `primary` → siguen `c.primary` con texto `c.onPrimary`** (en oscuro, botón
   claro con texto oscuro, como el `btn-primary` de W-272).

## Cambios por archivo

Los 6 archivos: receta de 173 §6, más:

- `AdminEventosScreen.tsx`: borrar `CERRADO_FONDO`; `filaCerrada` → `c.closedBg`.
- `AdminLocalesScreen.tsx`: borrar las tres constantes `AMARILLO_*`; `:282`, `:284`,
  `:289` → `c.highlightBg`, `c.highlightBorder`, `c.highlightText`; `:268` →
  `c.cardBackground`; `botonOscuroTexto` y `botonPrimarioTexto` → `c.onPrimary`.
- `AdminPagosScreen.tsx`: borrar las dos constantes; `filaSinDatosPasada` (`:239`) →
  `c.highlightBg` / `c.highlightBorder`.
- `AdminTenantScreen.tsx`: borrar las dos constantes; `:383`, `:385`, `:434`, `:436` →
  `c.highlightBg` / `c.highlightBorder`; `:420` → `c.cardBackground`; texto blanco sobre
  el fondo `accent` de `:425` → `c.onAccent`.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. `rg -n "colors\b" <los 6 archivos>` no muestra nada.
4. `rg -n "#[0-9A-Fa-f]{6}|CERRADO_FONDO|AMARILLO_" <los 6 archivos>` no muestra nada.
5. En claro, las seis pantallas se ven igual que antes del spec, salvo el borde amarillo
   de las filas sin datos de `AdminPagos` (`#F5D77A` en vez de `#FFE082`).
6. En oscuro, una fila de evento cerrado es `#17181A`; los avisos amarillos son `#2A2608`
   con borde `#6B6100` y texto `#F5DF4D`.
7. En oscuro, los botones «oscuros» y primarios de `AdminLocales` se ven claros
   (`#F6F5F4`) con texto oscuro sobre la tarjeta `#1C1E20`.

## V-candidatas

- **182-a** — Con una cuenta admin en un teléfono, recorrer las seis pantallas en oscuro
  sin texto ilegible.

## Fuera de alcance

- Cambios de función en admin: los traen otros specs de la tanda.
