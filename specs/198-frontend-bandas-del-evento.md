# Spec 198 — Al crear un evento aparecen las cuentas de músico, «Soy yo» y «Otras bandas»; la ficha enlaza a cada banda

> Estado: aplicado (28-nov-2026) — `tsc` limpio fuera de `supabase/functions`, `expo export --platform web` sin errores, criterios 3 a 8 con `git`/`grep`; no probado en dispositivo ni contra la base (V 198-a/e). Ver «Bugs encontrados al aplicar».
> Capa: FRONTEND. `src/components/ArtistaSelector.tsx`, `src/screens/CrearEventoScreen.tsx`, `src/screens/DetalleEventoScreen.tsx`, `src/components/TarjetaEvento.tsx`.
> Depende de: spec 188 (`Banda`, `buscarBandas`, `crearFichaSuelta`, `bandaDeLaCuenta`, `Evento.musicoId`, `createEvento` con `musicoId`), spec 189 (`tituloDelLineup`, `mismaBanda`, `agregarBandasAdicionales`, `useBandasDelEvento`), spec 173 (`useEstilos`, `useTema`).
> Alimenta: spec 199 (correos de invitación en el mismo formulario).
> Hermano en la web: W-305 (`components/FormEvento.js`, `cartelera/[id]/page.js`), W-338 («Soy yo», `components/ArtistaSelect.js`) y W-349 (`ArtistaSelect.js`, `FormEvento.js`, `cartelera/[id]/page.js`).

> **En una frase:** al escribir el nombre de una banda aparecen primero las cuentas de músico de
> Sonópolis («En Sonópolis»), un músico se elige con «Soy yo», se agregan «Otras bandas» al
> crear, y la ficha y la tarjeta del evento enlazan al perfil de cada banda con cuenta.

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en el
mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después de
esta orquestación.»

Hoy en la app (con W-347 en producción): `ArtistaSelector` no encuentra a las cuentas de músico
(Felio Saud no aparece), así que se crean fichas duplicadas y la banda no queda admin del evento;
no hay forma de agregar una segunda banda; y la ficha del evento muestra solo `artist_name` sin
enlace (`DetalleEventoScreen.tsx:548`).

## Decisión

Colores con `useEstilos`/`useTema` y la paleta (spec 173): ningún hex nuevo. Errores en un
`Text` rojo, nunca `Alert.alert` (no hace nada en el build web de Expo, `src/lib/confirm.ts`).

### `src/components/ArtistaSelector.tsx`

Props nuevas:

```ts
interface ArtistaSelectorProps {
  userId: string;
  value: Banda | null;
  onChange: (b: Banda | null) => void;
  /** Solo si quien crea es músico: habilita «Soy yo» (su propia cuenta). */
  yo?: { nombre: string; foto: string | null } | null;
}
```

- Busca con `buscarBandas` (spec 188), 300 ms después de la última tecla, como hoy. Cada
  opción muestra el nombre y:
  - una cuenta: su foto redonda de 24 px (`Image`, `borderRadius` 12) o, sin foto, un círculo
    con la inicial en mayúscula (fondo `border`, texto `secondary`); a la derecha la etiqueta
    **«En Sonópolis»** en color `success`;
  - una ficha suelta: la etiqueta **«Sin cuenta»** en color `muted`.
- `+ Crear "<nombre>" como artista nuevo` (texto actual de la app) crea con `crearFichaSuelta`
  y entrega `{ tipo: 'ficha', … }`. Aparece solo si ninguna opción tiene ese nombre exacto (sin
  distinguir mayúsculas), como hoy. «Agregar contacto (opcional)» no cambia.
- **«Soy yo»**: con `yo` y sin selección, un botón con borde bajo el campo de búsqueda.
  Texto «Soy yo: <nombre>»; si `yo.nombre` está vacío, «Soy yo (pon el nombre de tu banda en tu
  perfil)» y queda desactivado (`disabled`, opacidad 0,5). Al tocarlo entrega
  `bandaDeLaCuenta({ id: userId, nombre: yo.nombre, foto: yo.foto })`, sin crear nada (W-349).
- Elegida: «🎤 <nombre>» como hoy, y si es una cuenta, la etiqueta «En Sonópolis» al lado.
  «Cambiar» no cambia.
- Error de búsqueda o de creación: el `Text` rojo de hoy («No se pudo buscar artistas» / «No se
  pudo crear el artista» si el error no trae mensaje).
- Deja de importar `ArtistaBreve`, `buscarArtistas` y `crearArtista`.

### `src/screens/CrearEventoScreen.tsx`

- `artista` pasa a `Banda | null`. Estado nuevo `otrasBandas: Banda[]` y `selectorOtra: number`
  (la `key` del segundo selector: se suma 1 tras cada banda agregada para vaciarlo, como
  `selectorAdicional` de la web).
- «Soy yo»: `const { musico: miPerfil } = usePerfilMusico(role === 'musician' && user ? user.id : null)`
  (de `src/hooks/useMusicos`, llamado siempre, antes de cualquier return). Se pasa
  `yo={role === 'musician' ? { nombre: miPerfil?.nombre ?? '', foto: miPerfil?.foto ?? null } : null}`
  a los dos selectores: un músico puede ser principal o adicional (W-338).
- Bajo «Artista *», la ayuda actual («Si el artista tiene cuenta en Sonópolis y ya reclamó su
  perfil, entra al equipo del evento») pasa a: «Si la banda está en Sonópolis, elígela de la
  lista: entra al equipo del evento.» (supuesto: texto nuevo de la app, la web no tiene ayuda
  ahí; la de antes hablaba de «reclamar el perfil», que desde W-347 ya no existe).
- **«Otras bandas (opcional)»** debajo de «Artista», con el estilo de `label`:
  - lista de las agregadas, cada una con su nombre (y «En Sonópolis» si es cuenta) y «Quitar»
    (estilo `enlace`), que la saca con `mismaBanda`;
  - un `ArtistaSelector` con `key={selectorOtra}`, `value={null}` y `onChange` que agrega la
    banda si no está ya en `otrasBandas` ni es la principal (`mismaBanda`), y suma 1 a
    `selectorOtra`;
  - ayuda bajo el selector: «Si tocan dos o más bandas, agrégalas aquí.» (primera frase literal
    del texto de W-338; la segunda, sobre el correo, la suma el spec 199).
- Al publicar:
  - `createEvento` con `artista: tituloDelLineup([artista.nombre, ...otrasBandas.map((b) => b.nombre)])`
    y, según el tipo de la principal, `musicoId: artista.id` (cuenta) o `artistId: artista.id`
    (ficha), nunca los dos;
  - después de `guardarDatosPago` y antes de las preventas,
    `agregarBandasAdicionales(creado.id, artista, otrasBandas)`; si falla, se suma a `fallos`:
    «El evento se publicó, pero no se guardaron las otras bandas: <mensaje>.» (el evento no se
    deshace, igual que los demás pasos 5 y 6);
  - el aviso «Evento publicado» usa el título del lineup en vez de `artista.nombre`.
- La validación «Elige un artista o crea uno nuevo» no cambia. Deja de importar `ArtistaBreve`.

### `src/screens/DetalleEventoScreen.tsx`

- `const { bandas } = useBandasDelEvento(evento)` junto a los otros hooks, antes del return
  temprano (regla del spec 120).
- `verMusico(id)` = `navigation.getParent()?.navigate('Locales', { screen: 'VerMusico', params: { musicoId: id } })`:
  `VerMusico` vive en la pestaña Locales, no en `CarteleraStack` (mismo patrón que
  `PanelFanScreen`, spec 114).
- Con **más de una banda**: bajo el género, una fila «Tocan» (texto chico en negrita, color
  `secondary`) con un chip por banda, en orden (fondo `block`, borde `border`, radio completo,
  texto chico en negrita). Una cuenta es tocable y lleva a `verMusico(id)`, con el nombre
  subrayado y `accessibilityRole="link"`; una ficha suelta es solo texto (W-305/W-349).
- Con **una sola banda que es cuenta**: antes de «Lugar», una fila con el mismo estilo de «Lugar»
  (`infoRow`): «Banda» → «<nombre> ›» en color de enlace (`infoValorEnlace`), que lleva a
  `verMusico(id)`. Con una ficha suelta no se agrega nada: el título ya la nombra.
- Mientras carga o si la lectura falla (`bandas === null`), no se dibuja nada de esto: la ficha
  sigue con el título, como hoy.
- El título (`evento.artista`, línea 548) no cambia: ya trae «A + B».

### `src/components/TarjetaEvento.tsx`

- Si el evento tiene banda principal con cuenta (`evento.musicoId`), bajo la línea de detalle un
  enlace chico «🎤 Ver banda ›» (color `accent`, `accessibilityRole="link"`,
  `accessibilityLabel="Ver el perfil de la banda"`), que navega a
  `navigation.navigate('Locales', { screen: 'VerMusico', params: { musicoId: evento.musicoId } })`
  con `useNavigation<NavigationProp<ParamListBase>>()`: la acción sube por los navegadores hasta
  la pestaña Locales, así funciona desde la cartelera, el panel del local, el del músico y el del
  fan sin tocar esas pantallas.
- Supuesto: la tarjeta no consulta el lineup (son listas de decenas de eventos; una consulta por
  tarjeta no vale la pena). Las bandas adicionales se ven en el título («A + B») y con enlace en
  la ficha.
- Sin `musicoId` la tarjeta queda igual que hoy.

### Lo que NO cambia

- Los correos para invitar a las bandas sin cuenta y al local → spec 199.
- Editar el evento no cambia la banda ni el lineup (spec 034).

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `npx expo export --platform web` termina sin errores.
3. Ningún hex nuevo en los archivos tocados (`git diff` sin `#[0-9a-fA-F]{3,6}` agregado).
4. `grep -rnE "buscarArtistas|crearArtista\(|ArtistaBreve" src --include="*.tsx"` no devuelve nada
   (quedan solo las definiciones `@deprecated` en `src/lib/artistas.ts`; anotar en
   `PENDIENTES.md` que se pueden borrar).
5. `grep -n "En Sonópolis\|Sin cuenta\|Soy yo" src/components/ArtistaSelector.tsx` devuelve las tres.
6. `grep -n "Otras bandas (opcional)\|tituloDelLineup\|agregarBandasAdicionales\|musicoId" src/screens/CrearEventoScreen.tsx`
   devuelve las cuatro.
7. `grep -n "Tocan\|useBandasDelEvento" src/screens/DetalleEventoScreen.tsx` devuelve las dos.
8. `git diff --stat` del commit toca solo los cuatro archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Como local, crear un evento con «Felio Saud» (cuenta) de principal y una banda nueva de
  adicional: Felio sale con «En Sonópolis», el título es «Felio Saud + <banda nueva>», el evento
  aparece en el perfil de Felio y Felio queda admin.
- Como músico con nombre en su perfil, «Soy yo» en «Artista» y en «Otras bandas»; con el nombre
  vacío, el botón desactivado.
- Ficha de un evento con dos bandas: «Tocan» con un chip por banda; tocar la cuenta abre su perfil
  en la pestaña Locales.
- Tarjeta de un evento con `musicoId` en la cartelera y en el panel del local: «Ver banda ›» abre
  el perfil.

## Bugs encontrados al aplicar (28-nov-2026)

1. **`borderRadius.full` no existe** en `src/theme` (solo `sm`, `md`, `lg`). El «radio completo» del
   chip se escribió como `borderRadius: 999`, igual que `CarteleraScreen` y `SelectorTipoEntrada`.
2. **Texto del chip sobre `block`.** El spec pide fondo `block` sin fijar el color del texto. En la
   paleta clara `block` (marrón oscuro) es el mismo color que `primary`: el texto habría quedado
   invisible. Se usó `white`, como las otras superficies `block` de la app.
3. **La Cartelera no usa `TarjetaEvento`.** Dibuja `EventoDestacado` (y `TarjetaEventoExterno`).
   «Ver banda ›» sale en el panel del local, el del músico y el del fan, no en la cartelera. No se
   tocó `EventoDestacado`: no está en la capa de este spec y decidirlo es diseño (spec nuevo). La
   V-candidata «Tarjeta de un evento con `musicoId` en la cartelera» no se puede cumplir así.
