# Spec 159 — Admin de Sonópolis en la app: CRM de cada tenant, Pro y Locales

> Estado: aplicado (29-oct-2026) — CRM, detalle del tenant (Pro, código de suscripción, eventos, correo y WhatsApp en vista, contactos) y Locales (invitar, reenviar, cancelar). Verificado: `npx tsc --noEmit` sin salida fuera de `supabase/functions` y `npx expo export --platform web` sin error; no toca los tres stacks. Criterios 4-8 y V-candidatas 159-a/159-b pendientes en dispositivo (7 y 8 requieren W-249 y W-250 en producción)
> Capa: FRONTEND. `src/navigation/pantallasAdmin.tsx`, `src/screens/AdminScreen.tsx`, `src/components/BotonesPro.tsx` (nuevo), `src/screens/AdminCrmScreen.tsx` (nuevo), `src/screens/AdminTenantScreen.tsx` (nuevo), `src/screens/AdminLocalesScreen.tsx` (nuevo).
> Depende de: spec 153, spec 158
> Hermano en la web: `app/(private)/admin/crm/page.js`, `app/(private)/admin/crm/[tipo]/[id]/page.js`, `app/(private)/admin/crm/piezas.js`, `app/(private)/admin/crm/BotonesPro.js`, `app/(private)/admin/crm/CodigoSuscripcionPro.js`, `app/(private)/admin/locales/BuscadorLocales.js` (W-193, W-212, W-216, W-219, W-220, W-232, W-243).

> **En una frase:** el back office de la app suma CRM —la lista de locales y bandas con su
> público, Pro a mano, el detalle de cada uno y el código de suscripción— y Locales —buscar
> un local e invitar o cancelar a su dueño real—, como en la web.

## Contexto

El spec 158 dejó el back office: la entrada «Administración» en los tres perfiles, el
grupo de pantallas `pantallasAdmin.tsx` que incluyen los tres stacks y el inicio
`AdminScreen` con Pagos y Eventos. Este spec agrega tres pantallas **tocando solo
`pantallasAdmin.tsx` y `AdminScreen.tsx`**, no los stacks: para eso el 158 eligió un grupo
compartido.

La lógica la dejó el spec 153: `useAdminCrm`, `useTenantAdmin`, `useAdminLocales`,
`filtrarLocales` y `src/lib/adminPro.ts`.

**Despliegue.** Invitar y cancelar llaman a una ruta de la web que acepta la sesión de la
app solo desde el W-250, y `DELETE` pasa el CORS solo desde el W-249; los números de correo
del detalle también vienen de una ruta que abre el W-249. **Los dos tienen que estar en
producción antes de publicar un build con este spec.** Sin ellos, Locales muestra el error
de la ruta en rojo y la sección de correo dice que no pudo leer.

## Diseño

Errores en un `Text` rojo (`colors.danger`), nunca `Alert.alert`. Confirmaciones con
`confirmar`. Copias de la web literales. Las listas largas (cientos de tenants o contactos)
van en `SectionList`/`FlatList`, no en un `ScrollView` que dibuja todo de una vez.

### 1. `src/navigation/pantallasAdmin.tsx`

`AdminParamList` suma:

```ts
AdminCrm: undefined;
AdminTenant: { tipo: TipoTenant; id: string; nombre: string };
AdminLocales: undefined;
```

y el grupo suma tres `Stack.Screen`: `AdminCrm` («CRM»), `AdminTenant` (título
`route.params.nombre`) y `AdminLocales` («Locales»). `nombre` viaja en los params solo para
el título: la pantalla lo vuelve a leer de la base.

### 2. `src/screens/AdminScreen.tsx`

Dos tarjetas más, después de Pagos y Eventos (el orden de `AdminNav.js`):

- **CRM** — «El público de cada local y banda, como lo ve cada uno.» → `AdminCrm`.
- **Locales** — «Busca el local por nombre o dirección e invita a su dueño real con su
  correo oficial.» → `AdminLocales`.

### 3. `src/components/BotonesPro.tsx` (nuevo)

Dos exportaciones, porque la lista y el detalle usan las dos:

- **`EtiquetaPro({ proHasta })`**: insignia verde «Pro sin vencimiento» si
  `esProSinVencimiento`, «Pro hasta {d mmm}» si `esPro`, gris «Sin Pro» si no
  (`piezas.js`). La fecha corta se arma a mano (día + mes abreviado de un arreglo), sin
  `Intl`, por la misma razón que `formatearMonto` (`src/lib/precio.ts:30-35`).
- **`BotonesPro({ tipo, id, nombre, proHasta, compacto?, onCambio })`**, port de
  `BotonesPro.js`:
  - Sin Pro sin vencimiento, un botón por plazo de `PLAZOS_PRO`: «Activar 1 mes» /
    «Activar 3 meses» sin Pro, «+1 mes» / «+3 meses» con Pro. Confirma «¿{Activar|Sumar} Pro
    {n} {mes|meses} a {nombre}? Son US${PRO_PRECIO_USD × meses}.» y llama `darPro`.
  - Sin Pro sin vencimiento, «Sin vencimiento»: confirma «¿Activar Pro sin vencimiento y
    sin costo a {nombre}? Queda activo hasta que lo quites.» y llama `darProSinVencimiento`.
  - Con Pro, «Quitar Pro» en rojo: confirma «¿Quitar Pro a {nombre}? Pierde el acceso a su
    lista de contactos al instante.» y llama `darPro(tipo, id, 0)`.
  - Bien: un `Text` verde con lo que la web dice en el toast («Pro activado: {nombre}»,
    «Pro extendido: {nombre}», «Pro sin vencimiento: {nombre}», «Pro quitado: {nombre}») y
    `onCambio()`. Mal: el mensaje de la base en rojo. Todos deshabilitados mientras corre.
  - `compacto` achica padding y fuente para la fila de la lista.

### 4. `src/screens/AdminCrmScreen.tsx` (nuevo)

`useAdminCrm()`. `SectionList` con `RefreshControl` (`recargar`) y dos secciones,
«Bandas · {n}» y «Locales · {n}» (vacías: «No hay bandas.» / «No hay locales.»).
Encabezado: «El público de cada local y banda, como lo ve cada uno. {total}
{contacto|contactos} en toda la plataforma.» y el `error` en rojo.

Cada fila (`crm/page.js`, `Fila`):

- Nombre y `<EtiquetaPro>`.
- Debajo, unido por « · »: `etiquetaPais(pais)` si hay, «{n} contacto(s)», «{n}
  comprador(es)», «{n} con WhatsApp», «{n} evento(s) activo(s)», con singular y plural.
- Botón «Ver CRM» → `AdminTenant` con `{ tipo: type, id, nombre }`, y
  `<BotonesPro compacto onCambio={recargar} />`.

### 5. `src/screens/AdminTenantScreen.tsx` (nuevo)

`useTenantAdmin(tipo, id)`. Una `FlatList` de contactos cuyo `ListHeaderComponent` lleva
todo lo demás, en el orden de la página web:

1. **Cabecera.** Nombre con `<EtiquetaPro>`, `etiquetaPais(pais)`, `<BotonesPro onCambio={recargar} />`.
   Luego, con Pro: «{Este local|Esta banda} ve esta misma lista en su panel de
   contactos.»; sin Pro: «Sin Pro: {este local|esta banda} solo ve el conteo ({n}
   {persona|personas}) y la invitación a Pro.». Y la nota en fondo amarillo claro: «**Vista
   de admin:** así ve {nombre} su CRM con Pro. Desde aquí no se envía nada.».
2. **«Suscripción a Pro con Mercado Pago»** (`CodigoSuscripcionPro.js`), como componente
   local del archivo:
   - `errorSuscripcion` → «No se pudo leer la suscripción: {mensaje}».
   - Sin `cuenta` → «{Este local|Esta banda} no tiene cuenta en Sonópolis. Para suscribirlo,
     primero tiene que reclamarlo o crear una.».
   - Con cuenta: «Pro se activa en la cuenta {correo}», un `TextInput` numérico «Monto
     mensual» que arranca en `precioSugerido` (vacío si es `null`), la moneda al lado, y
     «Generar código de suscripción» (deshabilitado si el monto no es un número `> 0`).
     Confirma «¿Generar un código para {nombre}? Pro se activa en la cuenta {correo}. Son
     {formatearMonto(monto, moneda)} al mes.», llama `generarCodigoPro` y, bien, muestra el
     código grande en monoespaciada y la `url` en `<Text selectable>`, y `recargar()`. Mal:
     el mensaje en rojo.
   - «Códigos anteriores», si hay: código, correo de la cuenta, monto con moneda, fecha y
     estado con las etiquetas de `CodigoSuscripcionPro.js:19-30` («Esperando», «Abrió el
     pago» —`esperando` con `linkPedidoAt`—, «Activa», «Pausada», «Cancelada», «Anulado»).
3. **«Eventos activos · {n}»** (vacía: «Sin eventos activos.»). Cada uno, artista y
   «{fecha} · {local}»; al tocarlo abre su ficha en la pestaña Cartelera:
   `navigation.navigate('Cartelera', { screen: 'DetalleEvento', params: { eventoId } })`
   (la web enlaza a `/cartelera/<id>`).
4. **«Correo»**, en modo vista (la web muestra el redactor sin enviar, W-220): con
   `errorCorreo`, «No pudimos leer tus listas: {mensaje}» en rojo; si no, «{n} compradores
   · {n} seguidores» y «Último envío: {fecha}, a {n} personas» o «Todavía no ha enviado
   correos». No se dibuja el redactor: desde el admin no se envía nada.
5. **«Avisar por WhatsApp»**: «{Este local|Esta banda} lo usa desde la ficha de cada evento
   activo: un aviso por evento, a quienes dejaron su WhatsApp.» y los conteos de
   `whatsapp` (todos, compradores, seguidores).
6. **Resumen de contactos**: tres tarjetas, «Contactos», «Compradores», «Con WhatsApp»
   (sin ingresos, W-218).

Cada contacto de la lista: correo (ya enmascarado por la base; «Sin correo» si es nulo),
teléfono si hay, orígenes como «Comprador», «Seguidor», «WhatsApp», entradas y gastado
(`formatearMonto(totalGastado, moneda)`). Vacía: «Todavía no tiene contactos.».

Con `error` principal (por ejemplo «No existe»), la pantalla muestra solo ese mensaje en
rojo.

### 6. `src/screens/AdminLocalesScreen.tsx` (nuevo)

`useAdminLocales()`. Arriba, la bajada de la web: «Busca el local por nombre o dirección e
invita a su dueño real con su correo oficial. El local pasa a esa cuenta cuando entra a
Sonópolis con ese correo.», un `TextInput` «Nombre, dirección o comuna», y «{n}
{local|locales}». `FlatList` sobre `filtrarLocales(locales, q)`, con `RefreshControl`.
Vacía con búsqueda: «Ningún local coincide con «{q}».». `error` en rojo.

`TarjetaLocal`, componente local (port de `BuscadorLocales.js`):

- Nombre y, si `dueno?.rol !== 'local'`, la insignia amarilla «No está a nombre del
  local».
- «{venueLabel(tipo)} · {etiquetaPais(pais)} · {n} evento(s)», «📍 {dirección, comuna}» o
  «📍 Sin dirección», y «Dueño actual: {nombre o (sin nombre)} · {músico|local|fan} ·
  {correo}» o «Dueño actual: nadie».
- Con invitación: «Invitación enviada a {correo} · {d mmm}» o «Invitación a {correo}
  creada, sin enviar», y tres botones: **Reenviar** (llama `invitar` con el mismo correo,
  sin confirmar), **Cancelar** (confirma «¿Cancelar la invitación a {correo}? El enlace que
  le llegó dejará de servir.» y llama `cancelar`) y **Otro correo** (abre el formulario).
- Sin invitación: **Invitar dueño** / **Cerrar**, que abre o cierra el formulario.
- Aviso bajo la tarjeta: verde «Invitación enviada a {correo}.» o «Invitación cancelada.»;
  `colors.warning` «La invitación quedó creada pero el correo no salió: {emailError}. Usa
  Reenviar.»; rojo con el mensaje de la ruta si falló.

Formulario: «Correo oficial del local» (`keyboardType="email-address"`,
`autoCapitalize="none"`), y con correo escrito la frase «**{local}** ({dirección}) pasará
de {dueño actual} a **{correo}** cuando esa persona entre a Sonópolis.». Botón «Enviar
invitación» («Enviando…» mientras corre), deshabilitado sin correo. Al enviar bien, el
formulario se cierra.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. `git diff --stat` del spec no toca `PerfilStack.tsx`, `MiLocalStack.tsx` ni
   `MusicoStack.tsx`.
4. Con la cuenta admin, Administración muestra cuatro destinos; CRM lista los mismos
   tenants y conteos que `sonopolis.org/admin/crm`.
5. «+1 mes» sobre un tenant de prueba pide confirmación con «Son US$20.», y al aceptar la
   insignia pasa a «Pro hasta …» en la lista y en la web; «Quitar Pro» la vuelve a «Sin
   Pro».
6. En el detalle de un tenant con cuenta, generar un código muestra el código y la `url`, y
   el código aparece en «Códigos anteriores» como «Esperando».
7. Con W-249 en producción, la sección «Correo» del detalle muestra los mismos conteos que
   el redactor de la web.
8. Con W-249 y W-250 en producción, invitar al dueño de un local de prueba muestra
   «Invitación enviada a …» y la tarjeta pasa a «Invitación enviada a … · {fecha}»;
   «Cancelar» la quita. Un error de la ruta aparece en rojo en la tarjeta.

## Fuera de alcance

- Filtros por origen, búsqueda y exportar CSV de la tabla de contactos (sí están en
  `TablaContactos` de la web): la app muestra la lista completa.
- La vista previa HTML del correo de invitación y del redactor: requiere un `WebView` (otra
  dependencia nativa) y el HTML lo arma código de la web.
- Mandar correos o avisos de WhatsApp desde el admin: la web tampoco lo hace.
- Botones «copiar» con `expo-clipboard` para el código y la `url`: van en `Text selectable`.

## Verificación manual

- **V-candidata 159-a:** con la cuenta admin en el teléfono, recorrer CRM → un tenant de
  prueba: activar Pro 1 mes, verlo en la web, quitarlo; generar un código, abrir su `url` en
  el navegador.
- **V-candidata 159-b:** con W-249 y W-250 en producción, invitar al dueño de un local de
  prueba desde la app nativa y desde el build web, recibir el correo, y cancelar la
  invitación.
