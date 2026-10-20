# Spec 157 — Redes del CRM en la app: cuentas, historial y redactor para local y músico

> Estado: propuesto (19-oct-2026)
> Capa: FRONTEND. `src/screens/RedesScreen.tsx` (nuevo), `src/screens/PublicarRedesScreen.tsx` (nuevo), `src/components/redes/ComunRedes.tsx` (nuevo), `src/components/redes/MediosRedes.tsx` (nuevo), `src/navigation/MiLocalStack.tsx`, `src/navigation/MusicoStack.tsx`, `src/navigation/CarteleraStack.tsx`, `src/screens/DashboardLocalScreen.tsx`, `src/screens/PerfilMusicoScreen.tsx`, `src/screens/DetalleEventoScreen.tsx`.
> Depende de: spec 150, spec 155, spec 156
> Hermano en la web: `app/(private)/local/redes/page.js`, `app/(private)/musico/redes/page.js`, sus `/publicar`, `components/redes/CuentasConectadas.js`, `ListaPublicaciones.js`, `RedactorPublicacion.js`, `SubirMedios.js`, `OpcionesTikTok.js`, `app/(marketing)/cartelera/[id]/BotonPublicarEnRedes.js` (W-237, W-238, W-239), sobre las rutas de W-249.

> **En una frase:** el local y el músico con Pro ven sus cuentas de redes, conectan en la
> web, publican o programan con fotos o video desde la app y siguen el resultado de cada
> red; desde la ficha de un evento, «Publicar en redes» abre el redactor ya armado con el
> anuncio; sin Pro ven un texto neutro y, mientras la web tenga las redes apagadas, «no
> disponible».

## Contexto

La web tiene la función completa en `/local/redes` y `/musico/redes`
(`app/(private)/local/redes/page.js:22-95`): una lista de las cinco redes con su estado
(`CuentasConectadas.js`), el historial con el resultado por red y recarga mientras algo
está en curso (`ListaPublicaciones.js:14-55`), y un redactor único para post libre o
anuncio de evento (`publicar/page.js:41-97`, `RedactorPublicacion.js`). Desde la ficha del
evento, `BotonPublicarEnRedes.js` lleva al redactor con `?evento=`. Toda la lógica que la
app necesita la deja el spec 150; este spec son solo pantallas.

**Por qué conectar una red se queda en la web.** El flujo OAuth (la autorización en la
página de Instagram, Facebook, etc.) depende de cuatro cosas que la app no tiene y que no
conviene duplicar:

1. La cookie firmada `redes_oauth` (`libs/redes/estadoOAuth.js`), que ata la vuelta del
   callback al tenant que pidió conectar; sin ella cualquiera podría pegar un `code` ajeno.
2. La sesión por cookie de la web: `/api/redes/<proveedor>/conectar/<red>` y su callback
   leen al usuario con `getUser()` de la cookie, no con un Bearer.
3. Las URLs de callback registradas en Meta y Zernio, que son de `sonopolis.org`; un
   esquema `appall://` exigiría registrar otra y pasar otra revisión de app de Meta.
4. El paso de elegir página de Facebook (`ElegirPaginaFacebook.js`) cuando la cuenta
   administra varias, que vive en el panel web.

Así que «Conectar» abre el panel web (`BASE_WEB` de `src/lib/apiWeb.ts`, que en
producción es `URL_WEB` de `src/constants/web.ts`, + `/local/redes` o `/musico/redes`) en el navegador del sistema dentro de la app (`expo-web-browser`, ya
instalado), y la pantalla vuelve a leer las cuentas al regresar. La primera vez hay que
entrar a sonopolis.org en ese navegador: no comparte la sesión de la app.

**Por qué sin Pro no hay botón de compra.** Las reglas de App Store y Google Play no
permiten llevar a pagar fuera de la tienda una función digital de la app. La web vende con
`CardSonopolisPro` (`local/redes/page.js:51`); la app solo dice que la función es parte de
Sonópolis Pro, sin precio, link ni botón. Por la misma razón el atajo de la ficha
(§5) se muestra solo con Pro: en la web sin Pro lleva a la invitación a comprar, y en la
app sería un botón que no lleva a nada que se pueda hacer.

## Diseño

Convenciones del spec 137: los errores van en un `Text` rojo (`colors.danger`) dentro de su
sección, nunca en `Alert.alert` (en web no hace nada); las confirmaciones usan `confirmar`
de `src/lib/confirm.ts`. Los íconos de red son de Ionicons (`logo-instagram`,
`logo-facebook`, `logo-threads`, `logo-x`, `logo-tiktok`, verificados en el
`Ionicons.json` instalado).

### 1. `src/components/redes/ComunRedes.tsx` (nuevo)

- `IconoRed({ red, size, apagado })`: el ícono de la red; `apagado` lo pinta `colors.muted`.
- `abrirPanelRedesWeb(panelWeb: 'local' | 'musico'): Promise<void>` →
  `WebBrowser.openBrowserAsync(\`${BASE_WEB}/${panelWeb}/redes\`)`. La misma base que las
  llamadas a la API (spec 150 §1), para que conectar y publicar vayan al mismo deploy.
- `AvisoRedes({ tenant, disponibles })`: lo que se muestra cuando la función no está lista.
  Devuelve `null` si hay que mostrar la pantalla normal. Casos, en este orden:
  - `tenant.estado === 'cargando'` → `ActivityIndicator`.
  - `sin_tenant` → local: «Primero crea tu local: las publicaciones salen a nombre de tu
    local.» (texto de la web); músico: «Primero crea tu perfil de músico: las publicaciones
    salen a nombre de tu banda.».
  - `!tenant.esPro` (o un 402 de la API) → «Publica tus eventos en Instagram, Facebook,
    Threads, X y TikTok desde Sonópolis, al momento o programado.», los cinco íconos y
    «Publicar en redes es parte de Sonópolis Pro.». **Nada más**: sin precio, botón ni link.
  - `disponibles.length === 0` → «Publicar en redes todavía no está disponible.». Es lo que
    se ve hoy en producción: la web devuelve `disponibles: []` sin las variables de las redes.

### 2. `src/components/redes/MediosRedes.tsx` (nuevo)

Recibe lo que devuelve `useSubirMediosRedes` (spec 150 §11). Muestra:

- Botón «Agregar fotos o video» → `agregarDeGaleria()`; `aviso` debajo, en rojo.
- Una fila horizontal de miniaturas (64×64): `Image` con `preview` para imágenes; para un
  video, un recuadro con el ícono `videocam`. Encima de cada una, según `estado`:
  «Preparando…»; una barra de progreso (un `View` con `width: \`${progreso * 100}%\``) y el
  porcentaje; nada si está `listo`; si está en `error`, el mensaje en rojo y «Reintentar»
  → `reintentar(id)`. Un botón «×» quita el item en cualquier estado (`quitar(id)`).

### 3. `src/screens/RedesScreen.tsx` (nuevo) — cuentas e historial

Hooks: `useTenantRedes()`, `useIsFocused()`;
`habilitado = tenant.estado === 'listo' && tenant.esPro`;
`useConexionesRedes(tenant.tenantType, habilitado)` y
`usePublicacionesRedes(tenant.tenantType, habilitado && disponibles.length > 0, enFoco)`.
Si `AvisoRedes` devuelve algo (o `sinPro` de publicaciones es `true`), se muestra eso solo.

**Volver de la web y ver la cuenta conectada.** Las cuentas se recargan en tres momentos,
porque cada plataforma vuelve de forma distinta:

1. `useFocusEffect` → `recargar()` (entrar a la pantalla).
2. Al resolverse `abrirPanelRedesWeb` → `recargar()`. En iOS la promesa se resuelve
   cuando se cierra el navegador.
3. `AppState` pasa a `active` → `recargar()`. En Android el Custom Tab manda la app al
   fondo y la promesa se resuelve antes de que el usuario termine; en el build web, volver
   a la pestaña dispara lo mismo.

Contenido, con la pantalla lista:

- Arriba, «Nueva publicación» → `navigate('PublicarRedes')`. Deshabilitado si
  `activas.length === 0`, con la línea «Conecta al menos una red» debajo.
- **Cuentas.** Una fila por red en `ORDEN_REDES`: ícono, nombre y, según el estado (mismos
  casos que `CuentasConectadas.js:139-195`):
  - Red fuera de `disponibles` → «Pronto», ícono apagado, sin acción.
  - Sin conexión → la `ayuda` de la red (`REDES[red].ayuda`) y «Conectar en la web».
  - `activa` → avatar (`Image` de `cuentaAvatar`, un círculo gris si falta o falla),
    `cuentaNombre`, «Conectada» en `colors.success` y «Desconectar».
  - `reconectar` → `cuentaNombre`, `error` en `colors.warning`, «Reconectar en la web» y
    «Desconectar».
  - X disponible → «Hasta 30 publicaciones en X al mes.» (`TOPES_REDES.maxPostsXMes`).

  «Desconectar» pide `confirmar` con título «Desconectar <Red>», el mensaje de la web
  («Sonópolis deja de publicar en <cuenta>. Las publicaciones programadas para <Red> se
  cancelan. Lo ya publicado sigue en tu cuenta.») y `destructive: true`. Después recarga
  también el historial, porque la API canceló los destinos pendientes de esa red. Debajo
  de la lista, en gris: «Las cuentas se conectan en sonopolis.org. Al volver, esta lista se
  actualiza sola.».
- **Publicaciones.** Cargando → `ActivityIndicator`; error → `Text` rojo; vacía →
  «Todavía no publicas nada desde Sonópolis.». Cada publicación, una tarjeta:
  - Miniatura del primer medio (imagen o ícono `videocam`; un medio que ya no está en el
    bucket muestra un recuadro gris, como la web, porque la limpieza borra a los 30 días).
  - El texto, en 2 líneas (`numberOfLines={2}`).
  - La fecha, igual que `ListaPublicaciones.js:136-145`: «Programada para el …» si está
    `programada`, si no «Publicada el …» con el primer `publicadoAt`, si no «Creada el …»,
    con `formatearFechaHoraCorta` en la zona del tenant.
  - Una pastilla por destino: ícono + nombre + «· Programada» (`pendiente`) o
    «· Publicando…» (`publicando`/`esperando`); color por estado (`publicada`
    `colors.success`, `fallida` `colors.danger`, `publicando`/`esperando`
    `colors.warning`, `cancelada` tachada en `colors.muted`). `publicada` con `urlExterna`
    suma «Ver» → `Linking.openURL`. `fallida` muestra su `error` en rojo y «Reintentar» →
    `reintentar(id, red)`.
  - «Cancelar» si la publicación está `programada` → `confirmar` («Cancelar publicación»,
    «No se publica en ninguna red que siga pendiente. Lo que ya se publicó sigue en tu
    cuenta.») → `cancelar(id)`.
  - Mientras una acción corre (`ocupado`), los botones de todas las tarjetas quedan
    deshabilitados; el error de la acción va en rojo arriba de la lista.

### 4. `src/screens/PublicarRedesScreen.tsx` (nuevo) — el redactor

Params: `{ eventoId?: string } | undefined`. Hooks: `useTenantRedes()`,
`useConexionesRedes(tenantType, habilitado)`, `useSubirMediosRedes(tenantType)` y
`useEventos()`; el evento es `eventos.find(e => e.id === eventoId)`, la misma fuente que
`DetalleEventoScreen.tsx:45`. Si no aparece, el redactor abre como post libre, sin error
(como `publicar/page.js:23-35`). Todos los hooks van antes de cualquier `return`.

Guardas, en orden: `AvisoRedes`; y si `activas.length === 0`, «Conecta al menos una red
para publicar.» con «Conectar en la web» (la web redirige a `/redes` en ese caso).

**Punto de partida**, una sola vez cuando llegan las `activas` (un `ref` para que una
recarga no pise lo escrito):

- `elegidas` = todas las `activas`.
- Con evento: `textosPorRed` = `textoDelEvento(evento, red)` para cada red de
  `ORDEN_REDES`, `texto` = el de `facebook`, «Personalizar por red» encendido (Instagram y
  TikTok no llevan link y las demás sí), y `agregarFlyer(evento.imagen)` si hay imagen.
  Debajo del título: «Anunciar: <artista> · <fecha larga>».

**Formulario**, de arriba abajo, igual que `RedactorPublicacion.js:210-420`:

1. **¿Dónde publicas?** Una fila por red activa: casilla (`checkbox` / `square-outline`),
   ícono, nombre y `cuentaNombre`. Sin «Personalizar», los errores de esa red van debajo
   de su fila. Las redes disponibles sin conectar se listan apagadas con «Conectar en la
   web».
2. **Texto.** `TextInput` multilínea. Debajo, un contador por red elegida
   («Instagram 120/2200»), en rojo si se pasa (`largoParaRed`).
3. **Personalizar por red** (`Switch`). Encendido: una fila de chips con las redes elegidas
   (un punto rojo en la que tiene errores), un `TextInput` con `textosPorRed[activa] ?? texto`,
   su contador, la `ayuda` de la red y sus errores. Se mandan solo los textos que difieren
   del principal (`RedactorPublicacion.js:146-157`).
4. **Fotos o video.** `<MediosRedes>`.
5. **Opciones de TikTok**, solo si TikTok está elegida. TikTok exige mostrarlas antes de
   publicar por su API (`OpcionesTikTok.js:3-9`): «Quién puede verlo» con tres chips
   (Público, Amigos, Solo yo; con video, solo Público y la nota «En TikTok los videos de
   cuentas de empresa se publican como públicos.»), `Switch` «Permitir comentarios» y una
   fila fija y marcada «Este contenido promociona mi banda o local».
6. **¿Cuándo?** Dos chips: «Ahora» y «Programar». «Programar» muestra `CampoFecha` y
   `CampoHora` (spec 144) con `minimoProgramable(zona)` de valor inicial, y la línea «Hora
   de <país>» (`PAISES[pais].nombre`) para que quede claro en qué hora se programa.
7. Los errores `generales` en rojo y el botón «Publicar en N red(es)» o «Programar en N
   red(es)». Deshabilitado si la validación no pasa, si algo sigue subiendo («Esperando que
   terminen de subir los archivos…») o mientras envía.

**Validación:** `validarEnApp({ texto, textosPorRed: enviados, medios, redes, programadaPara })`
en cada render, con `programadaPara = programar ? aISOEnZona(fecha, hora, zona) ?? '' : null`
(vacío da «La fecha programada no es válida», como en la web). Un 400 de la API con
`generales`/`porRed` (en `ErrorApiWeb.cuerpo`) reemplaza la validación local hasta el
próximo cambio de cualquier campo.

**Enviar:** `crearPublicacionRed(tenantType, { texto, textosPorRed, medios, redes, opcionesPorRed, programadaPara, eventoId })`,
con `opcionesPorRed.tiktok` solo si TikTok está elegida (privacidad `PUBLIC_TO_EVERYONE`
si hay video). Al recibir 201 el formulario se reemplaza por una confirmación: «Programada
para el <formatearProgramada>» o «Publicando… El resultado de cada red aparece en Redes.»,
y el botón «Volver» → `navigation.goBack()`. Así funciona igual desde Redes (vuelve al
historial, que recarga al enfocarse) que desde la ficha del evento (vuelve a la ficha). Un
402 pasa al aviso de Pro; cualquier otro error, `mensajeRedes(e)` en rojo sobre el botón.

### 5. `DetalleEventoScreen.tsx` — «Publicar en redes»

Antes del `return` de «Evento no encontrado» (la regla de hooks de `:48-49`):

```ts
const tenantRedes = useTenantRedes();
const redesHabilitado =
  tenantRedes.estado === 'listo' && tenantRedes.esPro && !!permisos.rol && evento?.status !== 'cancelled';
const { disponibles: redesDisponibles } = useConexionesRedes(tenantRedes.tenantType, redesHabilitado);
```

En la fila de la tarjeta «Gestión del evento», después de «Equipo», un botón
«📣 Publicar en redes» con el estilo `botonGestion`, visible si
`redesHabilitado && redesDisponibles.length > 0` →
`navigation.navigate('PublicarRedes', { eventoId: evento.id })`. Las condiciones son las de
`cartelera/[id]/page.js:229-239`: un rol en el evento, evento no cancelado, redes
encendidas y una cuenta de local o músico; el tenant es el de **quien publica**, no el del
evento, porque un local puede anunciar el show de una banda en su sala. El rol en el evento
lo vuelve a revisar la API al publicar (`event_role_of`). Con un rol de fan,
`useTenantRedes` da `sin_tenant` y no consulta nada.

Si el spec 156 reorganizó la tarjeta de gestión, el botón va con las acciones de difusión
(junto a WhatsApp si existe), no en otra tarjeta.

### 6. Navegación y entradas desde los paneles

- `MiLocalStack.tsx` y `MusicoStack.tsx`: suman a su `ParamList`
  `Redes: undefined` y `PublicarRedes: { eventoId?: string } | undefined`, y registran
  `RedesScreen` («Redes») y `PublicarRedesScreen` («Publicar en redes»).
- `CarteleraStack.tsx`: solo `PublicarRedes`, porque `DetalleEventoScreen` vive en ese
  stack. Es el mismo motivo por el que `Escaner` y `EquipoEvento` están registradas en
  varios stacks (comentario de `CarteleraStack.tsx:82-84`); navegar a otra pestaña desde
  la ficha dejaría «atrás» fuera de la ficha.
- `DashboardLocalScreen.tsx`: en el grupo de botones del local (donde están «Ventas» y
  «Editar local», `:196-200`), «📣 Redes» → `navigate('Redes')`, solo si `miVenue` existe.
- `PerfilMusicoScreen.tsx` (el panel propio del músico, raíz de `MusicoStack`): junto a
  «Mis Ventas» y «Editar perfil» (`:261-276`), «📣 Redes» → `navigate('Redes')`.
- Si el spec 155 reordenó estos paneles, el botón va en el mismo grupo que las demás
  funciones de Pro que haya dejado, con el estilo de sus botones secundarios.

El botón de los paneles se muestra también sin Pro: lleva a la explicación neutra, que es
información de la cuenta y no una oferta.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` termina sin error.
3. `grep -n "Alert.alert" src/screens/RedesScreen.tsx src/screens/PublicarRedesScreen.tsx src/components/redes/*.tsx`
   sin resultados.
4. Con un local **sin** Pro, Redes muestra solo el texto de §1 y los íconos: ningún botón,
   precio ni link. En la ficha de un evento suyo no aparece «Publicar en redes».
5. Con un local Pro contra producción de hoy (redes apagadas), Redes muestra «Publicar en
   redes todavía no está disponible.» y la ficha no muestra el atajo.
6. Con las redes encendidas (preview de la web con las variables): «Conectar en la web»
   abre `https://sonopolis.org/local/redes` (o `/musico/redes` para un músico); después de
   conectar Facebook allá y cerrar el navegador, la fila muestra «Conectada» sin salir de
   la pantalla, en iOS y en Android.
7. Desconectar pide confirmación; la fila vuelve a «Conectar en la web» y una publicación
   programada para esa red aparece con esa pastilla tachada.
8. En el redactor, desmarcar todas las redes muestra «Elige al menos una red» y deshabilita
   el botón; un texto de 300 caracteres con X elegida pone su contador en rojo y «Te pasas
   por 20 caracteres».
9. Publicar ahora un texto con una foto en Facebook: vuelve a Redes y la tarjeta pasa de
   «Publicando…» a publicada con «Ver» sin tocar nada (recarga cada 10 s). Programar para
   mañana 21:00 muestra «Programada para el …, 21:00» en la hora del local; «Cancelar» la
   deja con todas las pastillas tachadas.
10. Desde la ficha de un evento propio: «Publicar en redes» abre el redactor con «Anunciar:
    …», el texto de Instagram sin `https://`, el de Facebook con el link con UTM, y el
    flyer subiendo; al publicar, «Volver» regresa a la ficha.
11. Una red `fallida` muestra su error y «Reintentar» la deja en «Publicando…».

## Fuera de alcance

- Conectar una red dentro de la app (ver Contexto) y el aviso `?conectada=`/`?error=` del
  callback: lo muestra el panel web en el navegador, que es donde vuelve el callback.
- La vista previa por red (`VistaPorRed.js`) y reordenar medios arrastrando.
- Editar una publicación programada: la API no lo permite; se cancela y se crea otra.
- El link «Evento» de cada tarjeta del historial: `DetalleEvento` no está en
  `MiLocalStack` ni en `MusicoStack`.
- Avisar por notificación que una publicación programada falló.
- Comprar o renovar Pro desde la app.

## Verificación manual

- **V-candidata 157-a:** con las variables de redes cargadas en un preview de la web,
  `EXPO_PUBLIC_WEB_URL` apuntando a ese preview y un local Pro de prueba: conectar
  Facebook e Instagram desde la app (pasando por la web), anunciar un evento con su flyer
  en las dos redes programado a 5 minutos, y ver en el historial de la app y en las dos
  cuentas que salió a la hora; después desconectar ambas.
