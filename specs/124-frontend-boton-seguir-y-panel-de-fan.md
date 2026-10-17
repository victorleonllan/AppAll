# Spec 124 — Botón «Seguir» y panel del fan: próxima entrada, feed y a quién sigo

> Estado: propuesto (16-oct-2026)
> Capa: FRONTEND. `src/components/BotonSeguir.tsx` (nuevo), `src/screens/PanelFanScreen.tsx` (reemplaza el placeholder del spec 114), `src/screens/VerMusicoScreen.tsx`, `src/screens/DirectorioMusicosScreen.tsx`.
> Depende de: spec 114, spec 119, spec 122, spec 123, spec 125
> Alimenta: spec 127 (pone `BotonSeguir` con `tipo="venue"` en el detalle del local).
> Hermano en la web: W-042 (panel de fan), W-075 (entradas independientes del feed), W-194/W-195 (feed y «Sigues a»). Archivos: `sonopolisWeb/components/BotonSeguir.js`, `app/(private)/fan/page.js`.

> **En una frase:** en la app seguir a alguien no existe y un fan no tiene pantalla
> propia; la web le da a cada perfil un botón «Seguir» y al fan un panel con su próxima
> entrada, lo que anunciaron los que sigue y la lista de a quién sigue — este spec lleva las
> dos cosas a la app.

## Contexto

- La app no tiene ningún botón de seguir. La web lo pone en el directorio
  (`musicos/DirectorioMusicos.js`, pie de cada tarjeta) y en el perfil público
  (`musicos/[id]/page.js`, junto al nombre), y no lo muestra a quien mira su propio perfil.
- El fan (rol `public`, o `fan` tras el spec 048) tiene como tercera pestaña
  `PerfilScreen.tsx`, que solo muestra tres botones de rol sin acción y «Cerrar sesión»
  (`PerfilScreen.tsx:16-38`). En la web su lugar es `/fan` (`fan/page.js`): «Tu próxima
  entrada», el feed, «Esta semana» (para quien todavía no sigue a nadie) y «Sigues a».
  El spec 114 ya convierte esa pestaña en `PerfilStack` (pestaña `Perfil`) y agrega en
  `PerfilScreen` el botón «⭐ Mi panel» → `PanelFan`, así que este spec no toca
  `PerfilScreen` ni la navegación.
- Lo que dejan los specs anteriores:
  - 123: `useSeguir(tipo, id)`, `useSeguidos()`, `useFeedFan(musicos, venues)`.
  - 125: `useMisEntradas()` → `{ cargando, error, proximas, pasadas, comprasEnEmision, refrescar }`,
    donde cada `EntradaPropia` y cada `CompraEnEmision` trae su `evento: EventoDeEntrada | null`
    (con `artista`, `venueName`, `fecha`, `hora`, `comienzaAt`, `status`).
  - 122: `DirectorioMusicosScreen` y `VerMusicoScreen` con datos reales y el hueco para el
    botón.
  - 119: `TarjetaEvento` con precio en su moneda y `Evento.comienzaAt`.
  - 114: `PanelFan` y `MisEntradas` en `PerfilStack` (pestaña `Perfil`);
    `DirectorioMusicos`, `VerMusico` y `DetalleLocal` (`{ venueId: string }`) en
    `LocalesStack` (pestaña `Locales`); `DetalleEvento` en `CarteleraStack`.

## Diseño

### 1. `src/components/BotonSeguir.tsx` (nuevo)

Props: `{ tipo: TipoSeguible; targetId: string; onCambio?: (siguiendo: boolean) => void }`.

- `const { user } = useAuth(); const s = useSeguir(tipo, targetId);`
- `tipo === 'musico' && user?.id === targetId` → `return null` (no tiene sentido seguirse a
  uno mismo).
- Sin sesión (`!s.haySesion`): botón «Seguir» que al tocarlo muestra
  `Alert.alert('Inicia sesión', 'Entra o crea tu cuenta para seguir a músicos y locales.')`.
- Con sesión: `Seguir` (fondo `colors.accent`, texto `colors.white`) o `✓ Siguiendo` (borde
  `colors.accent`, fondo transparente). Deshabilitado y con `ActivityIndicator` chico mientras
  `s.cargando`.
- Al tocar: `const ok = await s.alternar();` Si `ok`, `onCambio?.(!siguiendoAntes)`. Si no y
  hay `s.error`, `Alert.alert('No se pudo actualizar', s.error)`.
- Tamaño chico (`paddingVertical: 6`, `paddingHorizontal: 12`, `fontSize.sm`): entra en el pie
  de una tarjeta y al lado de un nombre.

### 2. `src/screens/VerMusicoScreen.tsx`

En la fila del nombre que dejó el 122: `<BotonSeguir tipo="musico" targetId={musico.id} />`
a la derecha.

### 3. `src/screens/DirectorioMusicosScreen.tsx`

En el pie de cada tarjeta, a la derecha: `<BotonSeguir tipo="musico" targetId={m.id} />`.
Cada botón consulta su propio estado (una consulta por tarjeta visible). Con el volumen
actual de músicos alcanza; si el directorio crece, la mejora es pasarle a cada botón el
estado inicial desde una sola consulta de `getIdsSeguidos` (como hace la web con
`seguidosIds`), y queda anotado como deuda.

### 4. `src/screens/PanelFanScreen.tsx`

Reemplaza el placeholder entero. `ScrollView` con `RefreshControl`.

**Datos.**

```ts
const { user } = useAuth();
const seguidos = useSeguidos();
const feed = useFeedFan(seguidos.musicos, seguidos.venues);
const entradas = useMisEntradas();            // spec 125
const { eventos } = useEventos();
```

`useFocusEffect` (de `@react-navigation/native`) llama `seguidos.refrescar()` cada vez que
la pantalla vuelve a tener foco: seguir o dejar de seguir desde otra pantalla no avisa a
esta; también llama `entradas.refrescar()`. El `RefreshControl` llama a los mismos.

Sin sesión → texto «Inicia sesión para ver tu feed.» y nada más.

**Secciones, en este orden:**

1. **Saludo.** `Hola, {primerNombre}` con el primer nombre de
   `user.user_metadata.nombre || full_name || name`, o la parte del correo antes de la `@`.
   Debajo: si el feed está vacío, «Sigue a quien te guste y sus fechas aparecen acá.»; si no,
   «Lo que anunciaron los que sigues.»

2. **Tu próxima entrada.** Candidatos: los `evento` de `entradas.proximas` y de
   `entradas.comprasEnEmision` (una compra pagada cuyas entradas todavía no se emitieron
   también es una entrada). Se queda con el de menor `comienzaAt` que sea ≥ ahora y no esté
   `cancelled`. Ojo: `proximas` del 125 incluye eventos que empezaron hasta 12 h antes y los
   de `comienzaAt` nulo; por eso se vuelve a filtrar acá con «≥ ahora», el criterio de la
   web. Tarjeta con fondo `colors.primary` y texto `colors.white`: rótulo «TU
   PRÓXIMA ENTRADA», artista, `{venueName} · {fecha} · {hora}`, y botón «Ver entrada» que
   hace `navigation.navigate('MisEntradas')` (mismo stack; pantalla del 126). Sin compra futura, la sección
   no se muestra. **No depende del feed** (W-075): quien compró sin seguir a nadie igual ve
   su entrada.

3. **Tu feed.** Si `feed.feed` tiene elementos: cada uno con una línea arriba
   `{autor.nombre} publicó una fecha` (músico) o `{autor.nombre} programó una fecha` (local),
   y a la derecha cuánto hace (`hace 3 días`, calculado con `evento.createdAt`; función
   local de la pantalla: minutos, horas, días, y fecha corta pasado un mes), y debajo
   `<TarjetaEvento evento={item.evento} onPress={…} />`. Vacío: no se muestra (el saludo ya lo
   explica). Error: «No se pudo cargar tu feed.»

4. **Esta semana.** Eventos de `eventos` con `status === 'published'` y `comienzaAt` entre
   ahora y ahora + 7 días, ordenados por `comienzaAt`, máximo 10, como `TarjetaEvento`. Se
   muestra siempre que haya alguno: resuelve el arranque en frío de un fan que no sigue a
   nadie (criterio de la web).

5. **Sigues a.** Filas de `seguidos.musicos` (nombre; `TIPO_PROYECTO_LABEL` · ciudad;
   avatar o foto en círculo de 36 si hay) y de `seguidos.venues` (nombre;
   `venueLabel(type)` · comuna). Cada fila lleva `<BotonSeguir … onCambio={() => seguidos.refrescar()} />`
   para dejar de seguir ahí mismo. Tocar un músico → su perfil; tocar un local → su detalle.
   Vacía: «Todavía no sigues a nadie.». Siempre al final de la sección, un enlace
   «Descubrir músicos →» a `DirectorioMusicos`.

**Navegación entre pestañas.** `PanelFan` vive en `PerfilStack`; las demás pantallas destino
viven en otros stacks, y se llega por la pestaña que las contiene (con el tipo
`NavigatorScreenParams` que dejó el 114 en el tipo raíz):

- `navigation.navigate('Cartelera', { screen: 'DetalleEvento', params: { eventoId } })`
- `navigation.navigate('Locales', { screen: 'VerMusico', params: { musicoId } })`
- `navigation.navigate('Locales', { screen: 'DetalleLocal', params: { venueId } })`
- `navigation.navigate('Locales', { screen: 'DirectorioMusicos' })`
- `navigation.navigate('MisEntradas')` (mismo stack)

No se toca `src/navigation/`. Si alguna de esas rutas no está donde dice el 114, es un
defecto del 114: se reporta, no se arregla acá.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin errores.
2. En el perfil de un músico y en su tarjeta del directorio, «Seguir» pasa a «✓ Siguiendo»
   y la fila aparece en `follows_musicians`; tocar de nuevo la borra.
3. Un músico mirando su propio perfil no ve el botón.
4. Sin sesión, tocar «Seguir» muestra el aviso de iniciar sesión y no escribe nada.
5. Siguiendo a un músico con un evento publicado, ese evento aparece en «Tu feed» con
   «{nombre} publicó una fecha»; tocarlo abre su detalle en la pestaña Cartelera.
6. Con una entrada `completed` de un evento futuro, «Tu próxima entrada» la muestra **aunque
   el fan no siga a nadie**, y «Ver entrada» abre Mis entradas. Una entrada de un evento que
   empezó hace 2 horas no se muestra como próxima.
7. Dejar de seguir desde «Sigues a» saca la fila al instante; seguir desde `VerMusico` y
   volver al panel la agrega sin tirar para refrescar.
8. Un fan que no sigue a nadie ve el saludo, «Esta semana» (si hay eventos esa semana) y
   «Descubrir músicos →».
9. `npx expo export --platform web` termina sin errores.

## Fuera de alcance

- «Tus eventos» (eventos donde el fan es parte del equipo, W-089) y el atajo al escáner.
- Sugerencias de a quién seguir: el directorio (spec 122) cumple ese papel; se puede sumar
  después con `useMusicos` sin tocar nada de este spec.
- Comprar desde la tarjeta del feed (`BotonComprarChico` de la web): la compra vive en el
  detalle del evento (spec 118).
- Botón de seguir en el detalle del local: spec 127.
- Opt-in de WhatsApp (CRM, fuera del plan).

## Verificación manual (candidatas a `V#`)

- V-a: misma cuenta en la web y la app: lo seguido en una aparece en «Sigues a» de la otra,
  y el feed muestra los mismos eventos en el mismo orden.
- V-b: con varios botones «Seguir» en el directorio, tocar dos rápido no deja ninguno en un
  estado distinto al de la base (recargar y comparar).
