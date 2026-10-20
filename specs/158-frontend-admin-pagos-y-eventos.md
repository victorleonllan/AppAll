# Spec 158 — Admin de Sonópolis en la app: entrada desde el perfil, Pagos y Eventos

> Estado: propuesto (19-oct-2026)
> Capa: FRONTEND. `src/navigation/pantallasAdmin.tsx` (nuevo), `src/navigation/PerfilStack.tsx`, `src/navigation/MiLocalStack.tsx`, `src/navigation/MusicoStack.tsx`, `src/components/BotonAdmin.tsx` (nuevo), `src/components/BotonCerrarEvento.tsx` (nuevo), `src/screens/AdminScreen.tsx` (nuevo), `src/screens/AdminPagosScreen.tsx` (nuevo), `src/screens/AdminEventosScreen.tsx` (nuevo), `src/screens/PerfilScreen.tsx`, `src/screens/DashboardLocalScreen.tsx`, `src/screens/PerfilMusicoScreen.tsx`.
> Depende de: spec 152, spec 157
> Hermano en la web: `app/(private)/admin/layout.js`, `app/(private)/admin/AdminNav.js`, `app/(private)/admin/sonopolis/page.js`, `app/(private)/admin/sonopolis/FilaPago.js`, `app/(private)/admin/BotonCerrarEvento.js`, `app/(private)/admin/eventos/page.js` (W-083, W-092, W-095, W-172, W-175).

> **En una frase:** quien es admin de Sonópolis ve un botón «Administración» en su perfil,
> sea fan, músico o local, que abre el back office de la app con Pagos y Eventos iguales a
> los de la web.

## Contexto

El spec 152 dejó la lógica: `useEsAdmin`, `useAdminPagos`, `useAdminEventos` y
`cerrarEvento`. Faltan las pantallas y el lugar por donde se entra.

**Dónde se entra.** Ser admin no es un rol: es una fila en `platform_admins`, independiente
de `profiles.role` (`sonopolisWeb/libs/admin.js:9-13`; hoy la cuenta de Victor es `fan` y
admin). Por eso la entrada tiene que estar en el perfil de los tres roles. La tercera
pestaña cambia según el rol (`src/navigation/index.tsx:17-24`):

| Rol | Stack de la pestaña | Pantalla de perfil |
|---|---|---|
| fan (o sin rol) | `PerfilStack` | `PerfilScreen` |
| musician | `MusicoStack` | `PerfilMusicoScreen` |
| local | `MiLocalStack` | `DashboardLocalScreen` |

Las tres pantallas ya tienen una fila de accesos de cuenta («🔑 Contraseña de tu cuenta»,
`PerfilScreen.tsx:52`, `DashboardLocalScreen.tsx:131` y `:249`,
`PerfilMusicoScreen.tsx:170` y `:316`). Músico y local la repiten en la rama «aún
no tienes perfil/local» porque la cuenta existe aunque falte el perfil (spec 128); el botón
de admin sigue la misma regla.

**Cómo se registran las pantallas.** Un stack de React Navigation no puede navegar a una
ruta que no tiene registrada, y las tres pestañas son stacks distintos. Hay dos caminos:

- Un `AdminStack` anidado como una ruta más en cada stack. Se descarta: suma un segundo
  navegador para cinco pantallas, obliga a esconder el encabezado de la ruta padre para no
  tener dos, y las rutas de la pestaña (`CambiarContrasena`, `DetalleEvento` en otra
  pestaña) quedan un nivel más lejos.
- **Un grupo de pantallas compartido** (`Stack.Group`) que cada stack incluye con una
  línea. Es el patrón del spec 114 (mismas rutas registradas en varios stacks) sin repetir
  la lista tres veces: el spec 159 agrega sus pantallas tocando solo ese archivo, no los
  tres stacks. Se elige este.

**Spec 157.** Edita los mismos stacks y paneles de perfil, en paralelo. Este spec va después
y solo agrega líneas; si el 157 movió la fila de accesos, el botón de admin va pegado a
«Contraseña de tu cuenta» donde haya quedado.

## Diseño

Errores en un `Text` rojo (`colors.danger`), nunca `Alert.alert` (en web no hace nada).
Confirmaciones con `confirmar` de `src/lib/confirm`. Copias de la web literales.

### 1. `src/navigation/pantallasAdmin.tsx` (nuevo)

```tsx
export type AdminParamList = {
  Admin: undefined;
  AdminPagos: undefined;
  AdminEventos: undefined;
};

export function pantallasAdmin(Stack: { Group: any; Screen: any }) {
  return (
    <Stack.Group>
      <Stack.Screen name="Admin" component={AdminScreen} options={{ title: 'Administración' }} />
      <Stack.Screen name="AdminPagos" component={AdminPagosScreen} options={{ title: 'Pagos' }} />
      <Stack.Screen name="AdminEventos" component={AdminEventosScreen} options={{ title: 'Eventos' }} />
    </Stack.Group>
  );
}
```

Es una **función que devuelve elementos**, no un componente: los navegadores de React
Navigation solo aceptan `Screen`/`Group` como hijos directos, y un componente propio en
medio rompe el registro. El parámetro va tipado laxo con un comentario que lo explique: los
nombres de ruta se chequean en cada pantalla con `AdminParamList`, no en el helper. El grupo
hereda el `screenOptions` (colores del encabezado) del stack que lo incluye.

### 2. Los tres stacks

En `PerfilStack.tsx`, `MiLocalStack.tsx` y `MusicoStack.tsx`:

- el `ParamList` pasa a `{ …lo de hoy… } & AdminParamList`;
- `{pantallasAdmin(Stack)}` como último hijo del `Stack.Navigator`.

### 3. `src/components/BotonAdmin.tsx` (nuevo)

Props: `{ style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle> }`. Usa
`useEsAdmin()`: mientras carga, si no es admin o si hubo error, devuelve `null` (quien no es
admin no se entera de que existe, como el redirect silencioso de `admin/layout.js`). Si es
admin, un `TouchableOpacity` con el texto «🛠️ Administración» que hace
`navigation.navigate('Admin')` con `useNavigation<NativeStackNavigationProp<AdminParamList>>()`.
Recibe el estilo de cada pantalla para verse igual que sus vecinos.

### 4. Los tres perfiles

`<BotonAdmin style={…} textStyle={…} />` justo antes de «🔑 Contraseña de tu cuenta», con
el estilo del botón de contraseña de esa misma pantalla:

- `PerfilScreen.tsx`: dentro de `acciones`, con `styles.botonAccion` / `styles.textoAccion`.
- `DashboardLocalScreen.tsx`: en las dos ramas (sin local y con local), con
  `styles.botonEscaner` / `styles.textoBotonSecundario`.
- `PerfilMusicoScreen.tsx`: en las dos ramas (sin perfil y con perfil), con
  `styles.botonEscaner` / `styles.textoBotonSecundario`.

### 5. `src/screens/AdminScreen.tsx` (nuevo) — el inicio del back office

Reemplaza a la barra `AdminNav` de la web: en el teléfono no hay espacio para cuatro
botones arriba de cada pantalla, así que es una lista de destinos.

- Guarda de navegación: con `useEsAdmin()`, mientras carga un `ActivityIndicator`; si
  termina y no es admin, `navigation.goBack()` en un efecto y no dibuja nada.
- Dos tarjetas tocables, título y bajada (las bajadas son los subtítulos de cada página de
  la web):
  - **Pagos** — «Lo que hay que transferirle a los locales después de cada show.» →
    `AdminPagos`.
  - **Eventos** — «Todos los eventos de la plataforma, incluidos los borradores.» →
    `AdminEventos`.

### 6. `src/components/BotonCerrarEvento.tsx` (nuevo)

Props: `{ eventoId; monto: number; moneda: string | null; artista: string; titular?: string | null; cancelado: boolean; onCerrado: () => void }`.

Port de `BotonCerrarEvento.js`:

- `conPlata = !cancelado && monto > 0`. Texto: «Cerrando…» mientras corre; si no,
  «Pagado y cerrado» con plata o «Cerrar evento» sin ella.
- Al tocar, `confirmar` con `destructive: true`, título igual al texto del botón y como
  mensaje la pregunta de la web (`BotonCerrarEvento.js:27-34`), con `formatearMonto`:
  - cancelado: «¿Cerrar {artista}? Está cancelado: el cierre no registra pago al
    organizador{ ni reembolso de los {monto} vendidos, si monto > 0}. No se puede
    deshacer.»
  - con plata: «¿Ya transferiste {monto}{ a {titular}, si hay}? Queda marcado como pagado y
    el evento se cierra. No se puede deshacer.»
  - sin plata: «¿Cerrar {artista}? No tiene entradas vendidas. No se puede deshacer.»
- Si confirma: `cerrarEvento(eventoId)`; bien → `onCerrado()`; mal → el mensaje del RPC en
  un `Text` rojo debajo del botón. Deshabilitado mientras corre.

### 7. `src/screens/AdminPagosScreen.tsx` (nuevo)

`ScrollView` con `RefreshControl` que llama `recargar`. `error` del hook arriba, en rojo.
Títulos de sección en mayúsculas pequeñas, como la web. Las cuatro secciones, en el orden
y con las copias de `sonopolis/page.js`:

1. **«Por pagar»** + `· {totalPorPagar} en total` si hay filas. Vacía: tarjeta punteada
   «No debes nada» / «Acá aparece un evento cuando su organizador reclama el pago.».
2. **«Terminaron y no han reclamado · {n}»**, solo si hay: filas con nota «No ha reclamado
   el pago».
3. **«Se está juntando · {totalAcumulando}»**, solo si hay: filas en solo lectura (sin
   botón: no se paga algo que no pasó).
4. **«Sin datos bancarios · {n}»**, solo si hay: por evento, artista, «{local} · {fecha}» y
   a la derecha «Ya pasó — hay que pedirle la cuenta» (`colors.warning`, fondo amarillo
   claro) o «Próximo».

`FilaPago`, componente local del archivo (port de `FilaPago.js`):

- Artista; «{local} · {fecha}»; a la derecha el monto grande (`formatearMonto(monto, moneda)`)
  y debajo «vendido» si está cancelado, «le corresponde» si ya pasó, «va acumulado» si no.
- Si está cancelado, «Cancelado — la plata es de los compradores» en rojo; si no y hay
  nota, la nota en `colors.warning`.
- Los datos bancarios de a uno, etiqueta y valor: Banco, Tipo (la `etiqueta` de
  `TIPOS_CUENTA`), N° de cuenta, Titular, RUT y Email si hay. **El valor va en un
  `<Text selectable>`**: se copia con una pulsación larga en iOS y Android y seleccionando en
  web. En la web cada dato es un botón «copiar» porque retipear un número de cuenta termina
  en una transferencia a la cuenta equivocada; acá se cubre lo mismo sin sumar
  `expo-clipboard`, que es un módulo nativo y obliga a un build nuevo.
- Fuera de solo lectura, `<BotonCerrarEvento … onCerrado={recargar} />`.

La fecha se muestra con `formatearDiaLargo(comienzaAt)` (`src/lib/fechaCartelera.ts:27`) y,
sin `comienzaAt`, con el texto `fecha`.

### 8. `src/screens/AdminEventosScreen.tsx` (nuevo)

`ScrollView` con `RefreshControl`; `error` en rojo. Tres secciones (`eventos/page.js`):

- **«Próximos · {n}»** (vacía: «No hay eventos próximos.»).
- **«Por cerrar · {n}»** (vacía: «Todavía no pasó ningún evento.» si `!hayPasados`, si no
  «Todos los eventos pasados están cerrados.»). Cada fila con
  `<BotonCerrarEvento monto={montoATransferir} cancelado={status === 'cancelled'} … onCerrado={recargar} />`.
- **«Cerrados · {n}»**, solo si hay: fondo gris, nombre en `colors.secondary`, «Fue el
  {fecha} · Cerrado» y el local debajo.

En cada fila: artista y, si `status` no es `published`, una etiqueta «Borrador» o
«Cancelado» (esta en rojo): marcar solo la excepción, como la web. Debajo, «{fecha} ·
{local}».

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. Con la cuenta de Victor (fan + admin), «🛠️ Administración» aparece en Perfil y abre
   «Administración» con Pagos y Eventos; la flecha atrás vuelve al perfil.
4. Con una cuenta de prueba fan, músico y local (sin fila en `platform_admins`), el botón
   no aparece en ninguna de las cinco ubicaciones.
5. Pagos muestra las mismas secciones, eventos y totales que `sonopolis.org/admin/sonopolis`;
   un número de cuenta se puede copiar con pulsación larga en el teléfono.
6. Eventos muestra los mismos próximos, por cerrar y cerrados que `/admin/eventos`,
   incluidos borradores ajenos con su etiqueta.
7. Cerrar un evento de prueba pasado pide confirmación (en el build web, `window.confirm`
   vía `confirmar`) y, al aceptar, el evento pasa a «Cerrados»; cerrar uno que el RPC
   rechaza deja el mensaje de la base en rojo bajo el botón.

## Fuera de alcance

- CRM y Locales del admin: spec 159.
- «Editar» y «Entradas» en cada fila de Eventos (sí están en la web): `useEventoPermisos`
  no reconoce al admin de plataforma, así que `EditarEventoScreen` no le mostraría los
  controles de un evento ajeno, y `PerfilStack` (el de Victor) no registra esas rutas.
  Queda para un spec LÓGICA que agregue el admin a `useEventoPermisos`.
- Botón «copiar» de cada dato bancario con `expo-clipboard`.
- Rutas de deep link para `/admin/*` en `linking.ts`.

## Verificación manual

- **V-candidata 158-a:** con la cuenta admin en el teléfono, abrir Administración → Pagos
  con `sonopolis.org/admin/sonopolis` al lado y comparar; copiar un número de cuenta a la
  app del banco; cerrar un evento de prueba desde Eventos y verlo cerrado en la web.
- **V-candidata 158-b:** agregar temporalmente una cuenta de prueba de rol músico a
  `platform_admins` (con service role, en el SQL editor) y confirmar que el botón aparece en
  su perfil; quitar la fila al terminar.
