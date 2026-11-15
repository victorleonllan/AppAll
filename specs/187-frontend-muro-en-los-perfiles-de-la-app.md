# Spec 187 — El muro en el perfil de locales y bandas de la app, con comentarios

> Estado: aplicado (15-nov-2026) — `npx tsc --noEmit` limpio fuera de `supabase/functions`; `npx expo export --platform web` sin errores; sin hex nuevos en el diff; el grep del criterio 4 devuelve la línea del aviso. Sin probar en dispositivo ni contra la base (V 187-a/b/c en `PENDIENTES.md`). Dos desviaciones en la addenda.
> Capa: FRONTEND. `src/components/Muro.tsx` (nuevo), `src/screens/DetalleLocalScreen.tsx`, `src/screens/VerMusicoScreen.tsx`, `src/components/RedactarCorreo.tsx`.
> Depende de: spec 186 (`useMuro`, `EntradaMuro`, `MAX_COMENTARIO`, `enMuro` en `useCorreoCrm`), spec 184 (toca el mismo `RedactarCorreo.tsx`; debe estar aplicado antes), spec 173 (`useEstilos`, `useTema`).
> Hermano en la web: `components/Muro.js`, `components/ComentariosMuro.js`, `locales/[id]/page.js`, `musicos/[id]/page.js` (W-280) y `components/RedactarCorreo.js` (W-281).

> **En una frase:** el perfil de un local (`DetalleLocalScreen`) y el de una banda
> (`VerMusicoScreen`) muestran su muro —correos publicados y flyers de eventos pasados— y
> cualquier persona con sesión comenta; el redactor de correo avisa que el correo se publica.

## Motivo

Pedido de Victor (14-nov-2026): «la idea es que el muro de locales y muscios (lo que ven los
fans al entrar a ver el perfil de musico o local) tenga un muro con el historial… y el perfil
fan puede dejar comentarios… la idea es hacer una proto red social.»

## Decisión

### `src/components/Muro.tsx`

`<Muro tipo={'venue' | 'musician'} id={…} nombreTenant={…} puedeModerar={boolean} />`. Usa
`useMuro(tipo, id)` y `useAuth()` para saber si hay sesión y quién es.

Se dibuja como bloque dentro del `ScrollView` de cada pantalla (no un `FlatList` propio: son
30 entradas como máximo y anidar listas virtuales dentro de un `ScrollView` da avisos).

- Título de sección «Muro», con el estilo de los títulos de sección de la pantalla.
- Cargando: `ActivityIndicator`. Error de lectura: «No pudimos cargar el muro. Vuelve a
  intentarlo en un momento.»
- Vacío: «{nombreTenant} todavía no tiene publicaciones. Cuando le escriba a su público o pase
  un evento con flyer, va a aparecer acá.»
- Cada entrada es una tarjeta:

| | Entrada `correo` | Entrada `evento` |
|---|---|---|
| Cabecera | `nombreTenant` en negrita · fecha (`formatearFechaEs`) | «Evento pasado» · fecha |
| Cuerpo | `titulo` en negrita y `cuerpo` en texto plano | el flyer (`Image`, ancho completo, `resizeMode="cover"`, `accessibilityLabel="Flyer de {titulo}"`) y «{titulo} · {venue}» |

- **Comentarios** de cada entrada: `autorNombre` en negrita · fecha · texto. Se muestran los
  3 más recientes; con más, «Ver los {N} comentarios» despliega todos (estado local).
- **Borrar**: «Borrar» en un comentario si es de quien mira o si `puedeModerar`; confirma con
  el helper de confirmación que ya usa la app (`src/lib/confirm.ts`) y llama a `borrarComentario`.
- **Comentar**: con sesión, `TextInput` multilinea con `maxLength={MAX_COMENTARIO}`, contador
  «n/500» y botón «Comentar» (deshabilitado vacío o enviando). Debajo, texto chico: «Se
  publica con tu nombre.» Un error se muestra en rojo bajo el campo (`mensaje` del hook).
- **Sin sesión**: «Inicia sesión para comentar», con la misma navegación a la pantalla de
  sesión que ya usa `BotonSeguir` u `OptInWhatsApp` cuando no hay usuario.
- **Quitar del muro**: en entradas `correo` y con `puedeModerar`, enlace «Quitar del muro»;
  confirma («¿Quitar esta publicación del muro? Sus comentarios se borran con ella.») y llama a
  `quitarPublicacion`. Los flyers no se pueden quitar.

Estilos con `useEstilos` y la paleta (spec 173): nada de hex, se lee en tema claro y oscuro.
No se muestra ningún correo electrónico.

### `src/screens/DetalleLocalScreen.tsx`

`<Muro tipo="venue" id={venue.id} nombreTenant={venue.name} puedeModerar={…} />` después del
bloque de datos del local y **antes** del mapa. `puedeModerar` = quien mira es el dueño del
local (`user.id === venue.ownerId`, el mismo dato que ya usa la pantalla para no mostrar
«Seguir» al dueño) o el admin (`useEsAdmin`).

### `src/screens/VerMusicoScreen.tsx`

`<Muro tipo="musician" id={musico.id} nombreTenant={musico.nombre} puedeModerar={…} />` al
final del `ScrollView`. `puedeModerar` = `user.id === musico.id` o admin.

### `src/components/RedactarCorreo.tsx`

1. Aviso fijo encima del botón de enviar: «Este correo también se publica en tu muro: lo ve
   cualquiera que entre a tu perfil público en Sonópolis.»
2. El texto de éxito («Correo enviado a N personas.») suma, según `enMuro` del resultado:
   `true` → « Quedó publicado en tu muro.»; `false` → « No se pudo publicar en tu muro; el
   correo sí se envió.»; `undefined` → nada.

### Lo que NO cambia

- El resto de las dos pantallas y la lógica de envío del correo.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `npx expo export --platform web` termina sin errores.
3. Ningún hex nuevo en los archivos tocados (`git diff` sin `#[0-9a-fA-F]{3,6}` agregado).
4. `grep -n "se publica en tu muro" src/components/RedactarCorreo.tsx` devuelve al menos una línea.
5. `git diff --stat` del commit toca solo los cuatro archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Perfil de un local con eventos pasados: se ven los flyers en el muro, del más nuevo al más viejo.
- Con sesión de fan: comentar, ver el comentario con su nombre y borrarlo.
- Con sesión del dueño: borrar un comentario ajeno y quitar un correo del muro.

## Bugs encontrados al aplicar (15-nov-2026)

1. **«Antes del mapa» choca con la pantalla real.** El diseño asume que en
   `DetalleLocalScreen` el mapa va después del bloque de datos del local, pero ahí el mapa
   está en la sección «Dónde», justo bajo la cabecera y el opt-in de WhatsApp; «Sobre el
   local», «Contacto» y «Próximas fechas» vienen después. Poner el muro antes del mapa
   habría empujado la dirección, los datos y las próximas fechas bajo hasta 30 entradas. Se
   aplicó la otra mitad de la regla («después del bloque de datos»): el muro va al final del
   `ScrollView`, después de «Próximas fechas», igual que en `VerMusicoScreen`.
2. **No hay navegación a la pantalla de sesión que reutilizar.** `BotonSeguir` sin usuario
   no navega: muestra un `Alert.alert` («Inicia sesión»), que además es un no-op en web
   (ver `src/lib/confirm.ts`). `OptInWhatsApp` funciona sin sesión. Sin sesión, el muro
   muestra el texto «Inicia sesión para comentar» sin enlace. Llevar a la pantalla de sesión
   desde el muro sería un spec nuevo.
