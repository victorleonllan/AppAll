# Spec 155 — Contactos y «Escribir a tu público» en la app, para local y músico

> Estado: propuesto (19-oct-2026)
> Capa: FRONTEND. `src/screens/ContactosScreen.tsx` (nuevo), `src/components/RedactarCorreo.tsx` (nuevo), `src/navigation/MiLocalStack.tsx`, `src/navigation/MusicoStack.tsx`, `src/screens/DashboardLocalScreen.tsx`, `src/screens/PerfilMusicoScreen.tsx`.
> Depende de: spec 148, spec 149, spec 154
> Hermano en la web: `app/(private)/local/contactos/page.js`, `app/(private)/musico/contactos/page.js`, `components/TablaContactos.js`, `components/RedactarCorreo.js` (W-101, W-177, W-187, W-197, W-200).

> **En una frase:** una pantalla «Contactos» en el stack del local y en el del músico
> muestra, con Pro, el redactor de correo, el resumen, la búsqueda, los filtros y la lista
> agrupada como en la web; sin Pro, solo cuántas personas hay en su público y la tarjeta
> Pro informativa.

## Contexto

En la web, `/local/contactos` y `/musico/contactos` son dos páginas con el mismo cuerpo
(`local/contactos/page.js:20-92`, `musico/contactos/page.js:20-74`), y las dos están en la
navegación del panel siempre, con o sin Pro (`local/layout.js:13`, `musico/layout.js:13`):

- **Error de lectura** → «No pudimos leer tus contactos. Vuelve a intentarlo en un
  momento.», nunca una lista vacía (W-100).
- **Sin Pro** → «Tienes **N** personas en tu público.» y la tarjeta Pro. El número es lo
  que hace visible el valor de Pro; la RLS ya deja al dueño leer sus contactos, el gate es
  de producto.
- **Con Pro** → `RedactarCorreo` + `TablaContactos`.

La app no tiene nada de esto. Los datos y las reglas ya están en el spec 149
(`useTenantPropio`, `useContactosCrm` y sus funciones puras, `useCorreoCrm`); la tarjeta en
el 154. Este spec solo dibuja.

**Vista previa del correo: texto, no HTML.** La web la dibuja con la misma
`renderCorreoCrm` que usa el servidor, en un `iframe` (`RedactarCorreo.js:88-100`, `:215-221`).
En la app eso no se hace, por tres razones:

1. La plantilla HTML vive en la web (`libs/emails/correoCrm.js`). Copiarla a la app crea
   una segunda copia que se desfasa al primer cambio, y entonces la vista previa miente.
2. Mostrar HTML en nativo pide `react-native-webview`, que no está en `package.json`:
   sería una dependencia nativa nueva (build nuevo) para una sola pantalla.
3. El servidor manda el correo con una parte de texto armada con las mismas piezas
   (`correoCrm.js:92-104`): nombre, asunto, cuerpo, firma y «Te escribe … porque …». La
   vista previa de texto es fiel a lo que dice el correo; lo único que no muestra es el
   logo, los colores y la tipografía, y lo avisa.

## Diseño

### Navegación

- `MiLocalStack.tsx` y `MusicoStack.tsx`: en el `ParamList`,
  `Contactos: { tipo: TipoTenant }` (tipo importado de `../hooks/useTenantCrm`), y
  `<Stack.Screen name="Contactos" component={ContactosScreen} options={{ title: 'Contactos' }} />`.
  Una sola pantalla para los dos stacks, como `Escaner` (spec 041): lo que cambia es el
  tenant, no el código.
- `DashboardLocalScreen.tsx`: un botón «👥 Contactos» con el estilo `botonEscaner`, justo
  debajo de «📷 Escanear entradas», que hace `navigation.navigate('Contactos', { tipo: 'venue' })`.
  Y a la `TarjetaPro` del spec 154 se le pasa
  `onVerContactos={() => navigation.navigate('Contactos', { tipo: 'venue' })}`.
- `PerfilMusicoScreen.tsx`: lo mismo dentro de la tarjeta «Acciones», debajo de «📷
  Escanear entradas», con `{ tipo: 'musician' }`, y el mismo `onVerContactos`.

El botón está con y sin Pro, igual que la pestaña de la web: sin Pro la pantalla muestra
el número, que es información útil por sí sola.

### `src/screens/ContactosScreen.tsx` (nuevo)

```ts
const { tipo } = route.params;
const { tenant, cargando: cargandoTenant, error: errorTenant } = useTenantPropio(tipo);
const { contactos, cargando, error, refrescar } = useContactosCrm(tenant);
const etiqueta = tipo === 'venue' ? 'tu local' : 'tu banda';
```

Estados, en este orden:

1. **Cargando** (tenant o primera carga de contactos) → `ActivityIndicator`.
2. **Sin tenant** → con `errorTenant`, el mensaje en `Text` rojo; si no, `venue`: «Primero
   crea tu local: los contactos salen de las compras y de quienes lo siguen.»;
   `musician`: «No encontramos tu perfil de músico.».
3. **Error de contactos** (`contactos === null`) → `Text` rojo «No pudimos leer tus
   contactos. Vuelve a intentarlo en un momento.».
4. **Sin Pro** (`!esPro(tenant)`) → «Tienes **N** persona(s) en tu público.» (singular con
   1) y `<TarjetaPro tenant={tenant} etiqueta={etiqueta} />` sin `onVerContactos` (ya se
   está ahí).
5. **Con Pro** → un `SectionList`:
   - `ListHeaderComponent` = **un elemento JSX, no una función componente** (si fuera una
     función creada en cada render, React la remontaría y los `TextInput` de adentro
     perderían el foco a cada letra). Contiene, en orden:
     1. `<RedactarCorreo tipo={tipo} nombreTenant={tenant.nombre} />`.
     2. **Resumen**: tres tarjetas en fila — «Contactos» (`total`), «Compradores»,
        «Con WhatsApp» — con `resumirContactos(contactos)`. Sin montos (W-218).
     3. Si `resumen.conWhatsapp === 0`: el aviso de W-177 en una tarjeta, «**Todavía nadie
        dejó su WhatsApp.** Las personas lo dejan por decisión propia, marcando la casilla
        en tu perfil público o al comprar una entrada. Cuando alguien lo haga, su número va
        a aparecer en la lista.».
     4. `TextInput` «Buscar por email o teléfono».
     5. Chips de filtro: «Todos», «Compradores», «Seguidores», «Con WhatsApp» (valores
        `todos`, `comprador`, `seguidor`, `whatsapp`); el elegido con fondo
        `colors.accent` y texto blanco.
   - `sections` = `agruparContactos(filtrarContactos(contactos, filtro, busqueda))`,
     mapeado a `{ title, data }`. Encabezado de sección: «{TÍTULO} · {n}» en mayúsculas,
     `fontSize.xs`, color `colors.accent`.
   - Cada contacto, una tarjeta como la vista móvil de la web (`TablaContactos.js:193-215`):
     - Línea 1: el correo enmascarado; si no hay ni correo ni teléfono, «Seguidor sin
       datos de contacto» en cursiva; si solo hay teléfono, esta línea no se dibuja.
     - Línea 2: «WhatsApp: {telefono}» o «Sin WhatsApp».
     - Insignias de origen: «Comprador» (fondo `colors.success`), «Seguidor», «WhatsApp».
     - Línea 3: «{n} entrada(s) · {formatearMonto(totalGastado, null)} · desde el
       {formatearFechaEs(separarFechaHora(primerContacto).fechaISO)}».
   - `keyExtractor` = `clave` (md5 de la vista, spec 149).
   - `ListEmptyComponent`, con los textos de la web: sin contactos → «Todavía nadie compró
     ni te sigue. Esto se llena solo: cada compra deja el correo del comprador, y quien te
     sigue desde tu perfil público aparece acá.»; filtro «Con WhatsApp» con
     `conWhatsapp === 0` → el aviso de W-177; si no → «Ningún contacto calza con esta
     búsqueda.».
   - `refreshControl` con `refrescar`: es el equivalente de recargar la página en la web.
   - `keyboardShouldPersistTaps="handled"` y la pantalla dentro de un
     `KeyboardAvoidingView` (`behavior="padding"` en iOS) para que el teclado no tape el
     redactor.

### `src/components/RedactarCorreo.tsx` (nuevo)

Props `{ tipo: TipoTenant; nombreTenant: string }`. Usa `useCorreoCrm(tipo)`. Solo se monta
con Pro (estado 5), así que el hook nunca pide la ruta sin Pro.

Una tarjeta «✉️ Escribir a tu público» con:

1. `error` del hook → `Text` rojo arriba.
2. **«¿A quién le escribes?»** — tres chips: «Compradores · n», «Seguidores · n»,
   «Ambos · n» (`ambos` = compradores + seguidores). Mientras carga, «…» en vez del
   número; un chip con 0 queda deshabilitado y atenuado. La lista inicial, como la web:
   `ambos` si hay de los dos, si no la que tenga gente, si no `ambos`.
3. **Pestañas** «Escribir» | «Vista previa» (en la web: «Ver diseño»; acá no es el diseño).
4. **Escribir:**
   - «Asunto»: `TextInput` con `maxLength={MAX_ASUNTO_CORREO}`, inicial «Gracias por estar,
     de parte de {nombreTenant}».
   - «Mensaje» con contador «{largo}/3000»: `TextInput multiline`, alto mínimo 180,
     `maxLength={MAX_CUERPO_CORREO}`, inicial el de la web: «¡Gracias por venir! Fue
     increíble tocar para ustedes.\n\nSi quieres enterarte del próximo show, síguenos en
     Sonópolis.».
   - Ayuda: «Una línea en blanco separa párrafos. La firma de Sonópolis y el link para
     darse de baja se agregan solos.».
5. **Vista previa** (texto):
   - Cabecera: «De: {nombreTenant} vía Sonópolis», «Asunto: {asunto || '(sin asunto)'}»,
     «Para: {n} persona(s) ({lista en minúscula})».
   - Cuerpo, en una tarjeta blanca: el nombre en mayúsculas chicas; el asunto en negrita;
     el mensaje partido en párrafos por línea en blanco; un separador; «Sonópolis · Música
     en vivo, cerca de ti»; y en gris chico «Te escribe {nombreTenant} a través de
     Sonópolis porque {motivo}. Darte de baja» — `motivo` de `MOTIVOS_CORREO`, el de
     seguidores si la lista es `seguidores` y el de compradores si no (como la web).
     «Darte de baja» es texto, no enlace.
   - Debajo, en `colors.muted`: «Así se lee el texto del correo. El correo que llega lleva
     además el logo y los colores de Sonópolis.».
6. **Enviar** — botón «Enviar a {n} persona(s)», fondo `colors.accent`, habilitado solo si
   no carga, no hay error, `n > 0`, asunto y mensaje con texto, no hay `proximoEnvio` y no
   se está enviando. Al tocarlo, `confirmar` (de `src/lib/confirm.ts`, que en web usa
   `window.confirm`) con título «¿Mandar este correo?», mensaje «Vas a mandar «{asunto}» a
   {n} persona(s) ({lista}). No se puede deshacer.» y `confirmText: 'Mandar'`. Si confirma,
   `enviar(...)`:
   - `ok` → `Text` verde (`colors.success`) «Correo enviado a {enviados} persona(s).».
   - si no → `Text` rojo con `mensaje`. Nada de `Alert.alert` (no hace nada en web, spec 137).
   - Mientras envía, el botón dice «Enviando…».
7. **Línea de estado** bajo el botón, en `colors.muted`:
   - con `proximoEnvio` → «Puedes volver a escribir el {fecha} a las {hora}. Un correo cada
     24 horas cuida que tus correos no terminen en spam.»;
   - con `ultimoEnvio` → «Último envío: {fecha}, a {destinatarios} personas.»;
   - si no → «Puedes mandar un correo cada 24 horas.».
   Fechas con `separarFechaHora` (día y hora locales) + `formatearFechaEs`; nada de
   `toLocaleString` (Hermes, ver spec 148).

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. Un local sin Pro con 12 contactos entra a «👥 Contactos» y ve «Tienes 12 personas en tu
   público.» y la tarjeta Pro sin «Ver tus contactos →»; no se pide `GET /api/crm/correo`.
4. El mismo local con Pro ve el redactor, el resumen con los mismos tres números que
   `sonopolis.org/local/contactos`, y los grupos «Compraron entradas», «Te siguen»,
   «Dejaron su WhatsApp» con los mismos contactos.
5. Escribir en la búsqueda no hace perder el foco del `TextInput`; «jose» encuentra
   «josé…» donde el motor tenga `normalize`; el filtro «Con WhatsApp» sin nadie con
   WhatsApp muestra el aviso de W-177 y no «Ningún contacto calza…».
6. Enviar un correo de prueba a una lista de 1 persona: llega con el asunto y el mensaje
   escritos; la línea de estado pasa a «Puedes volver a escribir el …» y el botón queda
   deshabilitado. Un segundo intento (forzado) muestra en rojo «Ya mandaste un correo en
   las últimas 24 horas».
7. «Vista previa» muestra el asunto, los párrafos separados por la línea en blanco y la
   línea «Te escribe … porque sigues a …» cuando la lista es «Seguidores».
8. Lo mismo desde el panel de un músico con Pro (`tipo: 'musician'`).
9. En el build web, «Enviar» pide confirmación con `window.confirm` y los errores salen en
   el `Text` rojo de la tarjeta.

## Fuera de alcance

- Exportar CSV (`config.crm.exportarCSV: false` en la web).
- La tarjeta «Ir a Redes» de la web (W-239): es del spec de Redes de la app.
- Vista previa con el HTML real del correo (ver Contexto).
- Ver o escribir a un tenant ajeno (la vista de admin de `/admin/crm`, W-219/W-220).
- Paginar la lista: la web tampoco pagina; es correcto al volumen actual (W-100).

## Verificación manual

- **V-candidata 155-a:** en un iPhone y un Android, con un local de prueba con Pro y un
  correo propio como único comprador: abrir Contactos, revisar la vista previa, mandar el
  correo, confirmar que llega con «De: {local} vía Sonópolis» y que el enlace «Darte de
  baja» del correo funciona.
