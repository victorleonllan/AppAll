# Spec 144 — Selector de fecha y hora nativo en vez de escribir AAAA-MM-DD

> Estado: aplicado (17-oct-2026) — `npx tsc --noEmit` sin errores fuera de `supabase/functions`, `npx expo export --platform web` termina sin error, `@react-native-community/datetimepicker` 9.1.0 vía `expo install`; criterio 4 comprobado con la conversión en `TZ=America/Santiago` (28-nov 23:30 → `2026-11-29T02:30Z`). Falta la prueba en teléfono (V-candidata 144-a).
> Capa: FRONTEND. `src/components/CampoFecha.tsx` (nuevo), `src/components/ModalSolicitud.tsx`,
> `src/screens/CrearEventoScreen.tsx`, `src/screens/EditarEventoScreen.tsx`, `package.json`
> y lockfile (dependencia nueva).
> Depende de: spec 132 (aplicado), spec 136 (aplicado)
> Hermano en la web: los `<input type="date">` / `type="time"` de `FormEvento` y `ModalSolicitud.js`.

> **En una frase:** en el teléfono, la fecha y la hora se eligen con el selector del sistema
> y no se escriben a mano; el estado de cada pantalla sigue siendo el mismo texto
> `AAAA-MM-DD` / `HH:MM`, así que la validación y el guardado no cambian.

## Contexto

La app no tiene un *date picker* (selector de fecha) instalado. Por eso, cuatro formularios
piden la fecha como texto:

- Solicitud de bolo (`ModalSolicitud.tsx:109-130`, spec 132), con placeholder `AAAA-MM-DD`.
- Crear evento (`CrearEventoScreen.tsx:372-387`) y Editar evento
  (`EditarEventoScreen.tsx:170-190`), que validan con `fechaHoraValidas` y avisan
  «La fecha va como AAAA-MM-DD y la hora como HH:MM».
- Cierre de preventa (`PreventasEvento.tsx:271`), un solo campo `AAAA-MM-DD HH:MM`.

En un teléfono, escribir `2026-11-28` con el teclado es lento y fácil de equivocar. En la
web, el navegador ya muestra su propio selector.

**Decisión: el componente nuevo produce el mismo texto que hoy se escribe a mano.** Así,
`armarFecha` (ModalSolicitud), `armarFechaHora` y `fechaHoraValidas` (`src/lib/fecha.ts`)
siguen igual, y el cambio queda solo en cómo se ingresa el dato.

## Diseño

### Dependencia

`npx expo install @react-native-community/datetimepicker`. Se usa `expo install` y no
`npm install` porque así se elige la versión compatible con Expo SDK 56, y Expo Go ya la
trae incluida.

### `src/components/CampoFecha.tsx` (nuevo)

Exporta dos componentes con la misma forma:

```ts
interface CampoFechaProps {
  value: string;                 // 'AAAA-MM-DD' o '' (CampoFecha) · 'HH:MM' o '' (CampoHora)
  onChange: (v: string) => void;
  placeholder: string;
  minimo?: Date;                 // solo CampoFecha
  opcional?: boolean;            // muestra «Quitar» cuando hay valor
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;  // para heredar el estilo `input` de cada pantalla
}
export function CampoFecha(props: CampoFechaProps): JSX.Element;
export function CampoHora(props: Omit<CampoFechaProps, 'minimo'>): JSX.Element;
```

- **Nativo (iOS y Android):** un `TouchableOpacity` con el estilo de input. Muestra el valor
  formateado: la fecha con `formatearFechaEs(value)` y la hora tal cual. Si no hay valor,
  muestra el placeholder en `colors.muted`. Al tocarlo se abre `DateTimePicker`
  (`mode="date"` o `mode="time"`, con `is24Hour`). Si no hay valor, el selector parte de hoy
  a las 21:00.
  - En Android el selector es un diálogo. Con `event.type === 'set'` se guarda el valor y
    se cierra; con `'dismissed'` solo se cierra.
  - En iOS se muestra debajo del campo (`display="inline"` para la fecha y `"spinner"` para
    la hora), con un botón «Listo» que lo cierra. Cada cambio llama a `onChange`.
- **El valor se arma con los componentes locales del `Date`** (`getFullYear`,
  `getMonth() + 1`, `getDate`, `getHours`, `getMinutes`, rellenando con ceros), **nunca con
  `toISOString()`**. Si se usara `toISOString()`, en Chile una fecha elegida después de las
  21:00 se convertiría a UTC y el campo mostraría el día siguiente.
- **Web (`Platform.OS === 'web'`):** el `DateTimePicker` no tiene implementación web. Se
  renderiza el mismo `TextInput` de hoy, con el mismo `placeholder`, para que el build web
  siga funcionando igual.
- Con `opcional` y un valor puesto, al lado aparece «Quitar», que llama a `onChange('')`.

### Pantallas

- **`ModalSolicitud.tsx`:** los dos `TextInput` de fecha y hora pasan a
  `<CampoFecha opcional minimo={hoy} …/>` y `<CampoHora opcional …/>`. Se actualiza el
  comentario de `:43-45` («no hay date picker instalado»). El `Alert` de formato inválido
  se queda, porque en web el texto se sigue escribiendo.
- **`CrearEventoScreen.tsx`:** fecha con `minimo={hoy}` y hora, sin `opcional`.
- **`EditarEventoScreen.tsx`:** fecha y hora **sin** `minimo`, porque se puede corregir un
  evento que ya pasó. Se conserva la ayuda «Este evento no tiene fecha exacta: complétala».

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` no muestra nada.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. `package.json` tiene `@react-native-community/datetimepicker` con la versión que
   eligió `expo install`.
4. En nativo, elegir 28-nov-2026 a las 23:30 deja el estado en `'2026-11-28'` y `'23:30'`,
   y crear el evento guarda `comienza_at` como 28-nov 23:30 hora de Chile (no 29-nov).
5. En ModalSolicitud, «Quitar» deja la fecha vacía y la solicitud se envía con
   `proposedAt: null`.
6. En web, los campos siguen siendo de texto y aceptan `2026-11-28` como hoy.

## Fuera de alcance

- `PreventasEvento.tsx` (cierre `AAAA-MM-DD HH:MM` en un solo campo). Ahí habría que partir
  el estado en dos, y eso es otro spec.
- Un selector propio para web (`<input type="date">` vía `react-native-web`).

## Verificación manual

- **V-candidata 144-a:** en un Android y en un iPhone con Expo Go, crear un evento eligiendo
  fecha y hora con el selector, y mandar una solicitud de bolo con fecha y otra sin fecha.
