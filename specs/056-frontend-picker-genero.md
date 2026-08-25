# Spec 056 — Picker de género en las 4 pantallas

> Estado: aplicado (2026-08-24)

**Capa: FRONTEND · `src/components/`, `src/screens/` · Depende de: spec 054, spec 055**

## Pedido de Victor

Que el listado cerrado (054) y la búsqueda (055) aparezcan donde se habla de género hoy:
crear evento, editar evento, editar perfil de banda ("qué estilo es tu banda") y Cartelera
(buscar/filtrar). Cuatro pantallas, mismo componente.

## Componente: `GeneroPicker`

`src/components/GeneroPicker.tsx` — modal con caja de búsqueda + lista, mismo patrón UX que
el dropdown de OffStep que originó el listado. Un solo componente para los dos modos que
hacen falta:

- **single** (Crear/Editar evento, filtro de Cartelera): tocar un género lo selecciona y
  cierra el modal.
- **multiple** (perfil de banda): tocar togglea el género en la selección; el modal se
  cierra con un botón "Listo", no al tocar un ítem — hace falta elegir más de uno seguido.

```tsx
interface GeneroPickerProps {
  visible: boolean;
  onClose: () => void;
  seleccionados: string[];       // 0 o 1 elemento en modo single, N en multiple
  onCambiar: (generos: string[]) => void;
  multiple?: boolean;            // default false
  titulo?: string;
}
```

El trigger (el campo que se ve en el formulario, tipo el resto de `TextInput`) NO es parte
de este componente — cada pantalla lo arma con su propio `TouchableOpacity` mostrando el
valor actual, igual que ya hacen los `chips` de `tipoProyecto`. Mantiene `GeneroPicker`
enfocado en una sola cosa (elegir de la lista) y cada pantalla libre de mostrar el valor
como quiera (un campo en Crear Evento, chips en perfil de banda).

## Cambios por pantalla

- **`CrearEventoScreen`**: el `TextInput` libre de "Género" se reemplaza por el trigger +
  `GeneroPicker` en modo single. `genero: string` no cambia de tipo, solo de dónde sale el
  valor.
- **`EditarEventoScreen`**: mismo cambio, mismo patrón (ya comparten el resto de la lógica
  de guardado vía `updateEvento`).
- **`EditarPerfilBandaScreen`**: el `TextInput` "separados por coma" (`generosTexto`) se
  reemplaza por el trigger + `GeneroPicker` en modo multiple, estado `generos: string[]`
  directo (se cae el parseo por coma — ya no hace falta, `mapProfileToDB` ya esperaba
  `string[]`).
- **`CarteleraScreen`**: agrega un filtro — botón "Género: Todos" arriba de la lista, abre
  `GeneroPicker` en modo single con un ítem extra "Todos los géneros" al principio de la
  lista (limpia el filtro). El `FlatList` filtra `eventos` con `eventoCoincideConGenero`
  (spec 055) antes de renderizar. Es el primer filtro que tiene Cartelera — hoy no filtra
  por nada.

## Fuera de alcance

- Filtro por múltiples géneros en Cartelera (spec 055 ya lo dejó fuera).
- Persistir el filtro elegido entre sesiones (AsyncStorage) — se resetea al volver a abrir
  la app, igual que el resto del estado de Cartelera hoy.

## Criterios de aceptación

- [x] `GeneroPicker` existe y soporta `multiple`/single
- [x] Las 4 pantallas usan `GENEROS_MUSICALES`/`buscarGeneros` en vez de texto libre
- [x] `EditarPerfilBandaScreen` guarda `generos: string[]` directo, sin el parseo de coma
- [x] `CarteleraScreen` filtra la lista visible por género elegido, con opción "Todos"
- [ ] Verificado en runtime (`expo start`) — no corrido en esta sesión, sin `node_modules`
      instalado en esta máquina

## Relacionado

- Spec 054 — el listado (`GENEROS_MUSICALES`)
- Spec 055 — `buscarGeneros`/`eventoCoincideConGenero` que este spec consume
- Spec 030 — precedente de los chips de `tipoProyecto`, mismo criterio de "trigger propio
  de cada pantalla, componente de selección aparte"

## Addendum (2026-08-25) — el filtro de Cartelera queda peor que el de sonopolisWeb

Al portar esto a la web (specs W-035/W-036/W-037) apareció que `Cartelera.js` **ya tenía**
su propio filtro de género, resuelto distinto y mejor: las opciones del `<select>` se
derivan de `[...new Set(eventos.map(e => e.genero))]` — solo se ofrecen los géneros que
existen entre los eventos que están en pantalla, igual que ya hace con `locales` y
`comunas`. Nunca hay una opción sin resultados.

El picker de `CarteleraScreen` en AppAll (arriba) hace lo contrario: ofrece los 174 géneros
del listado cerrado completo, sin importar cuántos eventos hay cargados. Con pocos eventos
(que es el caso real hoy) la mayoría de las opciones no devuelven nada — peor UX que el de
la web, que este spec no conocía porque se escribió antes de tocar `sonopolisWeb`.

**No se corrige acá** — el spec ya está aplicado y el diseño no se reescribe en silencio
(ver `Hermes/Config/ClaudeCode/CLAUDE.md` → specs inmutables). Recalibrar `CarteleraScreen`
para que derive las opciones de `eventos` en vez de usar `GENEROS_MUSICALES` completo es un
**spec nuevo** (siguiente número libre) si Victor lo pide — mismo patrón que `sonopolisWeb/components/Cartelera.js`,
adaptado a React Native (reemplazar el `<select>` HTML por el modal de `GeneroPicker`, pero
alimentado con la lista dinámica en vez de `buscarGeneros`).
