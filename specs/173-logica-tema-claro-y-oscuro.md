# Spec 173 — Tema claro y oscuro: paletas, proveedor, persistencia y hooks

> Estado: propuesto, sin aplicar (13-nov-2026)
> Capa: LÓGICA. `src/theme/index.ts`, `src/context/TemaContext.tsx` (nuevo),
> `src/hooks/useEstilos.ts` (nuevo), `App.tsx`.
> Depende de: nada.
> Hermano en la web: W-272 (`app/globals.css` tema `dark`, script `son-tema` en
> `app/layout.js`, `components/BotonTema.js`).

> **En una frase:** la app gana una segunda paleta, oscura, un proveedor que sabe cuál de
> las dos está activa y la recuerda en el teléfono, y un hook que arma los estilos de cada
> pantalla con la paleta activa; ninguna pantalla cambia todavía, porque la paleta clara
> conserva sus valores y `colors` sigue exportándose.

## Contexto

La web sumó modo oscuro el 12-nov-2026 (W-272). Su diseño, leído del spec y del código:

- Dos temas, claro (por defecto, sin cambios de valores) y oscuro, anclados en
  `data-theme`.
- La elección se guarda en `localStorage` con la clave `son-tema` (`dark` o `light`).
- **Sin elección guardada, el tema es el claro. No se sigue la preferencia del sistema**
  (W-272, «Persistencia y arranque» y «Fuera de alcance»): casi todos los celulares están
  en oscuro y seguir al sistema cambiaría la app para casi todos el día del despliegue.
- Un script lee la clave antes de la primera pintura, para que no aparezca clara y salte a
  oscura.
- Tokens con dos roles se separan: `--son-black` era «texto principal» y «superficie
  negra»; en oscuro un rol se invierte y el otro no. Los bloques de marca (nav, evento
  destacado) toman en oscuro el gris de la tarjeta (`--son-bloque`, addenda del 12-nov).
- Todo fondo de acento declara su color de texto, no lo hereda (addenda del 12-nov).

La app hoy no puede cambiar de tema. `src/theme/index.ts:1-17` exporta un único objeto
`colors` con `as const`, y lo consumen **76 archivos con 1186 referencias `colors.x`**
(medido con `rg -c "colors\." src`), casi todas dentro de `StyleSheet.create` a nivel de
módulo, que se evalúa una sola vez al importar el archivo: un estilo así no se entera si
la paleta cambia. Hay además 115 colores pasados como prop en JSX
(`placeholderTextColor={colors.muted}` y similares) y 8 archivos con hex sueltos
(`rg -n "#[0-9A-Fa-f]{3,8}\b['\"]" src`).

`colors` mezcla roles igual que la web:

| Token | Usos | Roles |
|---|---|---|
| `primary` (`#3D2B1F`) | 206 | texto principal; y **superficie** en 13 lugares: header de los 5 stacks (`navigation/*Stack.tsx`), `EventoDestacado.tsx:63`, `TalonEntrada.tsx:99`, `PanelFanScreen.tsx:251`, `EscanerQRScreen.tsx:306`, `AdminLocalesScreen.tsx:300,309`, `redes/MediosRedes.tsx:116` |
| `accent` (`#8B4513`) | 207 | texto de acción; y **fondo** de botón o píldora activa en 57 lugares |
| `white` | 108 | texto sobre fondo oscuro o de acento (78); y **superficie** en 8 lugares |

La paleta de la app es la marrón previa al rebrand, no la negra y amarilla de la web
(W-015). Este spec no la cambia (ver Decisiones).

`@react-native-async-storage/async-storage` 2.2.0 ya está instalado y lo usa
`src/context/PaisContext.tsx:2` con el mismo patrón que se necesita aquí (leer al montar,
`listo` para no parpadear).

## Decisiones

### 1. Dos paletas con las mismas claves; la clara conserva sus valores

`paletaClara` tiene exactamente las claves y valores de `colors` de hoy, más los tokens
nuevos de §2, cuyos valores claros son idénticos al color que reemplazan. Así, migrar una
pantalla no cambia nada en claro: es la misma regla de la web («`sonopolis` no cambia de
valores»).

`paletaOscura` tiene las mismas claves. Neutros tomados de la tabla oscura de W-272; el
acento conserva el marrón de la app aclarado, porque `#8B4513` sobre la tarjeta oscura da
contraste 2,36:1 (ilegible como texto).

| Clave | Rol | Claro (sin cambios) | Oscuro | Contraste oscuro |
|---|---|---|---|---|
| `background` | fondo de página | `#FAF0E6` | `#121315` (W-272) | — |
| `cardBackground` | tarjeta, campo | `#FFFFFF` | `#1C1E20` (W-272) | — |
| `border` | borde | `#E8DDD4` | `#303236` (W-272) | — |
| `primary` | texto principal | `#3D2B1F` | `#F6F5F4` (W-272) | 15,4 sobre tarjeta |
| `secondary` | texto secundario | `#6B4F3A` | `#B0B3B7` (W-272) | 7,9 |
| `muted` | texto terciario, placeholder | `#A0897A` | `#8A868D` (W-272) | 4,7 |
| `accent` | acción, píldora activa | `#8B4513` | `#D4935C` | 6,5 sobre tarjeta |
| `accentLight` | fondo tenue de acento | `#F5EDE6` | `#2E241C` | acento sobre él 5,9 |
| `success` | éxito | `#2E7D32` | `#57A06A` (W-272) | 5,3 |
| `danger` | error | `#C62828` | `#E0634A` (W-272) | 4,8; blanco sobre él 3,5 |
| `warning` | advertencia | `#EF6C00` | `#EF6C00` | 5,4; blanco sobre él 3,1 |
| `white` | literal blanco | `#FFFFFF` | `#FFFFFF` | — |

Los contrastes son WCAG, calculados contra `#1C1E20`.

Descartado:

- **Llevar la app a la paleta negra y amarilla de la web antes del oscuro.** Es un rebrand
  visual de toda la app que nadie pidió en este alcance; aquí solo se suma el oscuro. Si
  se quiere, es otro spec, y con la estructura de este (claves de rol) se reduce a cambiar
  valores en `src/theme/index.ts`.
- **Acento amarillo `#FFE900` en oscuro, como la web.** La app tendría marrón en claro y
  amarillo en oscuro: dos identidades según el tema.
- **Invertir `primary` y `white` en oscuro** en vez de separar roles: es lo que la web
  descartó; un token llamado `white` que vale gris oscuro engaña, y el header (superficie
  `primary`) quedaría claro con texto blanco.

### 2. Tokens nuevos para los roles que hoy comparten token o son hex

| Clave | Rol | Claro | Oscuro | Reemplaza |
|---|---|---|---|---|
| `block` | superficie oscura de marca: header, evento destacado, talón, cámara, tarjeta «próxima» | `#3D2B1F` | `#1C1E20` | `backgroundColor: colors.primary` cuando es superficie (10 de los 13 usos) |
| `onPrimary` | texto sobre un **botón** con fondo `primary` | `#FFFFFF` | `#08090A` | `color: colors.white` sobre los botones `primary` de `AdminLocalesScreen.tsx:300,309` y `redes/MediosRedes.tsx:116` |
| `onAccent` | texto e iconos sobre fondo `accent` | `#FFFFFF` | `#08090A` | `color: colors.white` cuando el fondo es `accent` |
| `dangerBg` | fondo tenue de error | `#FDECEA` | `#3A1D18` | hex en `DetalleEventoScreen.tsx:696` |
| `dangerText` | texto de error sobre fondo claro o tenue | `#B71C1C` | `#F28B7D` | hex en `DetalleEventoScreen.tsx:697,734`, `ConfirmacionCompraScreen.tsx:68` |
| `warningBg` | fondo tenue de advertencia | `#FFF3E0` | `#3A2A12` | hex en `ConfirmacionCompraScreen.tsx:304` |
| `warningText` | texto de advertencia | `#F57F17` | `#F5B25B` | hex en `ConfirmacionCompraScreen.tsx:74,80,309` |
| `successBg` | fondo tenue de éxito | `#E8F5E9` | `#16291B` | hex en `BotonesPro.tsx:147` |
| `highlightBg` | fondo amarillo de aviso (admin) | `#FFF8E1` | `#2A2608` (W-272 `--son-yellow-50`) | `AMARILLO_FONDO` de 3 pantallas admin |
| `highlightBorder` | borde amarillo de aviso | `#F5D77A` | `#6B6100` (W-272 `--son-yellow-border`) | `AMARILLO_BORDE` (`#F5D77A` y `#FFE082`) |
| `highlightText` | texto amarillo oscuro | `#8D6E00` | `#F5DF4D` (W-272 `--son-yellow-700`) | `AMARILLO_TEXTO` de `AdminLocalesScreen.tsx:21` |
| `closedBg` | fila de evento cerrado | `#EFEAE5` | `#17181A` (W-272 `--son-cerrado-bg`) | `CERRADO_FONDO` de `AdminEventosScreen.tsx:14` |
| `especial` | color del ticket especial (packs, spec 165) | `#DC2626` | `#DC2626` (W-254 `--color-especial`, la web no lo cambia en oscuro) | nuevo |
| `especialContenido` | texto sobre `especial` | `#FFFFFF` | `#FFFFFF` | nuevo |
| `especialSuave` | fondo tenue de las tarjetas del pack (spec 166) | `#FDECEC` | `#3A1A1A` | nuevo |

Los tres `especial*` se suman aquí y no en el spec 165 para que un solo spec edite `src/theme/index.ts` (agregado al orquestar, 13-nov-2026).

Por qué `block` en oscuro vale lo mismo que `cardBackground`: es la addenda del 12-nov de
W-272 (`--son-bloque` oscuro = `#1C1E20`); con negro puro el header y el destacado se
despegan de las tarjetas.

Por qué un botón con fondo `primary` no pasa a `block`: en oscuro `block` vale lo mismo que
la tarjeta y el botón desaparecería sobre ella. El botón conserva `c.primary` (que en oscuro
es claro, `#F6F5F4`) con texto `c.onPrimary`: es el `btn-primary` invertido de W-272
(`primary` / `primary-content` = `#F6F5F4` / `#08090A`).

Por qué `onAccent` es oscuro en oscuro: el acento oscuro es claro (`#D4935C`); blanco sobre
él da 2,6:1 y `#08090A` da 7,7:1. Es la misma inversión que `primary`/`primary-content` de
W-272.

**Única diferencia en claro:** `highlightBorder` unifica `#FFE082` (`AdminPagosScreen.tsx:17`)
con `#F5D77A`, dos amarillos casi iguales para el mismo rol. Es el mismo criterio con el
que W-272 unificó sus tres ámbar.

Los velos de modal (`rgba(0,0,0,0.4)` y `0.5`) **no** se tokenizan: oscurecen lo que está
detrás, sea claro u oscuro.

### 3. `colors` sigue exportándose, como alias de `paletaClara`

`export const colors = paletaClara` con comentario `@deprecated`. Así este spec se aplica
solo, sin tocar las 76 pantallas, y los specs FRONTEND 174 y 176–182 migran por grupos
en paralelo. Mientras una pantalla siga con `colors`, se ve clara dentro del tema oscuro;
ese estado intermedio dura lo que tarde la tanda.

Descartado **un solo spec que migre todo**: 76 archivos, entre ellos
`DetalleEventoScreen.tsx`, las pantallas de crear/editar evento, `TarjetaPro.tsx` y las de
admin, que otros specs de la misma tanda editan; un spec único bloquearía a todos.

### 4. El proveedor: `TemaProvider` y `useTema`

`src/context/TemaContext.tsx`, mismo patrón que `PaisContext`:

```ts
export type Tema = 'light' | 'dark';
export const CLAVE_TEMA = 'son-tema'; // misma clave que la web (W-272)
export function temaDesdeGuardado(valor: string | null): Tema; // 'dark' → 'dark'; cualquier otra cosa → 'light'
interface TemaState {
  tema: Tema;
  colores: Paleta;            // paletaClara o paletaOscura
  setTema: (t: Tema) => void;
  alternar: () => void;
}
export function TemaProvider({ children }: { children: ReactNode }): JSX.Element | null;
export function useTema(): TemaState; // lanza Error si se usa fuera del proveedor
```

- **Arranque sin parpadeo:** al montar lee `AsyncStorage.getItem(CLAVE_TEMA)`. Hasta que
  la lectura termina, el proveedor devuelve `null`. Es el equivalente del script en línea
  de la web: sin esto, quien eligió oscuro ve la app clara y el salto a oscura en cada
  arranque. La lectura local tarda milisegundos y en nativo la tapa la pantalla de carga.
- Si la lectura falla: `console.warn('[tema] no se pudo leer la preferencia', error)` y
  tema claro. Nada de `catch {}` vacío (spec 115).
- `setTema` cambia el estado al instante y después guarda con `setItem`. Si guardar falla:
  `console.warn('[tema] no se pudo guardar la preferencia', error)`, y el tema elegido
  sigue activo hasta cerrar la app.
- `useTema` fuera del proveedor lanza `Error('useTema fuera de TemaProvider')`. Descartado
  un valor por defecto claro: escondería en silencio una pantalla montada fuera del árbol,
  que es justo el error que hay que ver.
- **No se sigue la preferencia del sistema** (`useColorScheme`), igual que la web.

### 5. El hook de estilos: `useEstilos`

`src/hooks/useEstilos.ts`:

```ts
export function useEstilos<T>(crear: (c: Paleta) => T): T;
```

Devuelve `useMemo(() => crear(colores), [crear, colores])`. `crear` es una función a nivel
de módulo (`const crearEstilos = (c: Paleta) => StyleSheet.create({...})`), así que su
identidad es estable y los estilos solo se recalculan al cambiar el tema. Las dos paletas
son constantes de módulo, así que `colores` tampoco cambia de identidad entre renders.

Descartado **`StyleSheet.create` dos veces por archivo (`estilosClaros`/`estilosOscuros`)**:
duplica cada hoja de estilos y la próxima edición se olvida de una de las dos.

### 6. Receta de migración (la aplican 174 y 176–182)

Para cada archivo del grupo:

1. `import { colors, … } from '../theme'` → `import { …, Paleta } from '../theme'` sin
   `colors`.
2. `const styles = StyleSheet.create({ … })` → `const crearEstilos = (c: Paleta) =>
   StyleSheet.create({ … })`, y en **cada** componente del archivo que lea `styles`:
   `const styles = useEstilos(crearEstilos);`. Dentro, `colors.x` → `c.x`.
3. Colores en props de JSX (`placeholderTextColor`, `color` de `ActivityIndicator` o
   `Ionicons`, `trackColor` de `Switch`, `tintColor`) → `const { colores } = useTema();` y
   `colores.x`.
4. Constantes de módulo que guardan colores (mapas de estado a color, como
   `ConfirmacionCompraScreen.tsx:60-82`) → función `(c: Paleta) => …` llamada dentro del
   componente, o `useMemo` sobre `colores`.
5. Reglas de rol:
   - `backgroundColor: colors.primary` en una **superficie** (header, tarjeta, cabecera,
     fondo de cámara) → `c.block`; en un **botón** → se queda `c.primary` y su texto
     blanco pasa a `c.onPrimary`.
   - Texto o icono blanco **sobre fondo `accent`** → `c.onAccent`. Sobre `block`, `danger`,
     `success`, `warning`, una foto o un velo → sigue `c.white`.
   - `backgroundColor: colors.white` como tarjeta o campo → `c.cardBackground`. Debajo de
     un QR o como relleno sobre un velo → sigue `c.white`, a propósito (un QR necesita
     fondo blanco para escanearse; es el mismo criterio de la estatua de `/signin` en
     W-272).
   - Módulos de un QR (`color` de `react-native-qrcode-svg`) → `paletaClara.primary`,
     importada explícitamente: con `c.primary` en oscuro el QR sería claro sobre blanco.
   - Hex → el token de §2. Velos `rgba(0,0,0,…)` → se quedan.
6. En claro nada cambia de valor: cada reemplazo da el mismo color que antes (salvo el
   borde de `AdminPagosScreen`, §2).

## Cambios por archivo

### `src/theme/index.ts`

- `export const paletaClara = { …claves y valores actuales de colors…, block, onPrimary, onAccent,
  dangerBg, dangerText, warningBg, warningText, successBg, highlightBg, highlightBorder,
  highlightText, closedBg, especial, especialContenido, especialSuave } as const` con los valores claros de §1 y §2. El comentario del
  spec 041 sobre `danger`/`warning` se conserva.
- `export type Paleta = { readonly [K in keyof typeof paletaClara]: string }`.
- `export const paletaOscura: Paleta = { … }` con los valores oscuros de §1 y §2.
- `/** @deprecated Spec 173: usar useEstilos/useTema. Alias de paletaClara mientras
  quedan pantallas sin migrar. */ export const colors = paletaClara;`
- `spacing`, `borderRadius` y `fontSize` no cambian.

### `src/context/TemaContext.tsx` (nuevo)

Lo de §4. Comentario arriba que cite W-272 y explique por qué no se sigue al sistema.

### `src/hooks/useEstilos.ts` (nuevo)

Lo de §5.

### `App.tsx`

`TemaProvider` envuelve **todo**, incluida la rama temprana de `OAuthErrorScreen`
(`App.tsx:17-20`), porque esa pantalla también se migra (178) y llamará a `useTema`. Se
mueve el cuerpo actual a un componente interno `Contenido` y `App` devuelve
`<TemaProvider><Contenido /></TemaProvider>`.

`<StatusBar style="light" />` (`App.tsx:31`) no cambia: el header es `block` en los dos
temas, oscuro, y pide texto claro en la barra de estado.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. Las 12 claves de `colors` en `git show HEAD:src/theme/index.ts` tienen el mismo valor
   en `paletaClara` (comprobado con un script `npx tsx` que importa los dos y compara).
4. `paletaOscura` tiene exactamente las mismas claves que `paletaClara` (lo exige el tipo
   `Paleta`; el criterio 1 lo prueba).
5. `temaDesdeGuardado('dark') === 'dark'`; `temaDesdeGuardado(null)`, `('light')` y
   `('cualquier cosa')` devuelven `'light'` (script `npx tsx`).
6. `rg -n "catch\s*(\(\w*\))?\s*\{\s*\}" src/context/TemaContext.tsx src/hooks/useEstilos.ts`
   no muestra nada.
7. Sin ningún archivo migrado, la app se ve igual que antes en web y en dispositivo
   (`colors` sigue siendo la paleta clara).
8. Con `son-tema = dark` guardado a mano, la primera pantalla renderizada ya recibe
   `paletaOscura` de `useTema` (sin render intermedio con la clara).

## V-candidatas

- **173-a** — En un teléfono físico, con `son-tema = dark` guardado, al abrir la app no
  se ve un cuadro claro entre la pantalla de carga y la primera pantalla.
- **173-b** — Con el almacenamiento lleno o bloqueado, alternar el tema sigue
  funcionando durante la sesión y aparece el `console.warn`.

## Fuera de alcance

- Seguir la preferencia del sistema: la web tampoco lo hace (W-272). Es una línea en
  `TemaProvider` el día que se decida.
- `app.json` `"userInterfaceStyle": "light"` no cambia: los controles nativos (selector de
  fecha, `Alert`, teclado) siguen claros. Pasarlo a `automatic` los haría seguir al
  sistema, no a la elección de la app, y exige recompilar el binario.
- Cambiar la paleta clara de la app a la de la web (W-015): ver Decisión 1.
- Borrar el alias `colors`: cuando 174 y 176–182 estén aplicados,
  `rg "colors\b" src --glob '!src/theme/**'` debe dar cero y el alias se borra en un spec
  aparte.
- Migrar pantallas: 174 y 176–182.
