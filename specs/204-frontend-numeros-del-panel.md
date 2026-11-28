# Spec 204 — Los números del panel en el dashboard del local y en el perfil del músico

> Estado: aplicado (28-nov-2026) — `tsc` limpio fuera de `supabase/functions`, `expo export --platform web` sin errores y criterios 3 a 7 por `grep`; las pantallas no se abrieron (V 204-a a 204-e). Ver «Bugs encontrados al aplicar».
> Capa: FRONTEND. `src/components/NumerosPanel.tsx` (nuevo), `src/screens/DashboardLocalScreen.tsx`, `src/screens/PerfilMusicoScreen.tsx`.
> Depende de: spec 195 (`usePanel`, `armarNumerosPanel`, `etiquetaEstadoVenta`, `tonoEstadoVenta`, `haceTiempo`), spec 173 (`useEstilos`, `useTema`). Comparte `DashboardLocalScreen.tsx` con los specs 199 y 203, y `PerfilMusicoScreen.tsx` con el 203 (ver «Choque con el 199 y el 203»): serializar con ellos.
> Hermano en la web: `app/(private)/local/page.js` y `app/(private)/local/SolicitudesPendientes.js` (W-330 §1), `app/(private)/musico/page.js` (W-329 §1), `components/panel/Kpi.js` (W-327 §3).

> **En una frase:** el dashboard del local abre con «Cobrado en {mes}», «Entradas vendidas»,
> «Por responder» y «Tu público», las vendidas de cada evento, las ventas recientes y las
> solicitudes de bandas con «Aceptar» a mano; el perfil del músico, con «Próximos shows»,
> «Entradas vendidas», «Contactos» y «Solicitudes».

## Motivo

Pedido de Victor (27-nov-2026), literal: «La orquestación PR de AppAll Necesito que esté en
el mismo punto que Sonopolis Web. Y que además el repositorio quede como versión 1.0 después
de esta orquestación.»

La web pone primero lo que mueve plata o espera respuesta (W-329, W-330). En la app el
local ve «Eventos publicados / Entradas vendidas / Recaudado» (un total que mezcla
monedas) y el músico dos filas; ninguno ve cuántas solicitudes esperan respuesta ni qué se
vendió cada evento.

## Decisión

Lo nuevo vive en un componente, `NumerosPanel`, para que el cambio en cada pantalla sea
cambiar un bloque por una etiqueta. No es el rediseño visual completo de W-329/W-330 (dos
columnas, encabezado nuevo, barra lateral): es su contenido —los números y las dos listas—
dentro de la pantalla que ya existe.

### 1. `src/components/NumerosPanel.tsx` (nuevo)

```ts
interface Props {
  tipo: 'venue' | 'musician';
  tenantId: string;            // venue.id o el id del perfil (= user.id)
  pais: string;                // país del tenant
  eventos: Evento[];           // los «mis eventos» que la pantalla ya calcula
  onVerSolicitudes: () => void;
  onVerContactos: () => void;
  onVerVentas: () => void;
}
```

- Usa `useAuth()` (para `user.id`), `usePanel({ tipo, id: tenantId }, eventos.map((e) => e.id))`
  y `armarNumerosPanel({ eventos, cerrados, ventas, solicitudes, contactos, miUserId:
  user.id, pais, ahora })`, con `ahora = new Date().toISOString()` tomado en cada render.
- Estilos con `useEstilos` y la paleta (spec 173). Ningún hex nuevo.
- Se dibuja como bloque (no lista virtual: se monta dentro del `ListHeaderComponent` de un
  `FlatList` en el local y dentro de un `ScrollView` en el músico). Márgenes laterales
  `spacing.md`, como el resto de las dos pantallas.
- **Título** «Resumen», con el mismo estilo de los títulos de sección de cada pantalla
  (`fontSize.lg`, negrita, `c.primary`).
- **Cargando** (primera carga, `cargando` de `usePanel`): `ActivityIndicator` con
  `colores.accent` en lugar de la grilla.
- **Un número sin dato** (`null` en `NumerosPanel` del 195) se escribe «—» y su nota no se
  dibuja.

#### Tarjeta de número (`Kpi`, interna al archivo)

Grilla de 2 columnas (`flexDirection: 'row'`, `flexWrap: 'wrap'`, `gap: spacing.sm`, cada
tarjeta `flexBasis: '48%'`, `flexGrow: 1`). Cada tarjeta: fondo `c.cardBackground`, borde
1 `c.border`, `borderRadius.md`, padding `spacing.md`:

- etiqueta en `fontSize.sm`, semibold, `c.secondary`;
- valor en `fontSize.xl`, negrita, `c.primary`;
- `nota` opcional en `fontSize.xs`, `c.muted`;
- `destacado`: fondo `c.highlightBg`, borde `c.highlightBorder` y valor en
  `c.highlightText` (W-327: lo que espera respuesta salta a la vista);
- con `onPress`, es un `TouchableOpacity` con `accessibilityRole="button"`.

#### Local (`tipo === 'venue'`), en este orden

1. **Cuatro tarjetas**, textos de W-330 §1:
   - «Cobrado en {nombreMes}» — valor `cobradoMes`; nota «De {entradasPagadasMes} entradas
     pagadas». Toca → `onVerVentas`.
   - «Entradas vendidas» — valor `vendidasActivas`; nota «En {activos no cancelados} eventos
     activos».
   - «Por responder» — valor `porResponder.length`; `destacado` si es mayor que 0; nota «La
     más antigua, {haceTiempo(masAntiguaPorResponder, ahora)}» si hay alguna. Toca →
     `onVerSolicitudes`.
   - «Tu público» — valor `contactos`; nota «+{contactosNuevosMes} este mes» (nada si es 0).
     Toca → `onVerContactos`.
2. **«Vendidas por evento»** (título chico `fontSize.md` negrita), solo si hay eventos
   activos: hasta 4 activos, cada fila con el artista en negrita (`evento.artista`, una
   línea) y a la derecha «{n} vendidas» (`vendidasPorEvento[id] ?? 0`). Evento sin venta de
   entradas (`monto` nulo o 0): «Sin venta de entradas» en `c.muted` en vez del número
   (W-330). Evento cancelado: «Cancelado» en `c.dangerText`. Sin número de capacidad ni
   barra: los eventos no tienen aforo de venta en la base (W-330, Descartado). La lista
   completa de eventos sigue debajo, en el `FlatList` de la pantalla, sin cambios.
3. **«Solicitudes de bandas»**, con «Ver todas» a la derecha (→ `onVerSolicitudes`), solo
   si `porResponder` tiene alguna. Hasta 3, cada una:
   - nombre de la banda (`musicoNombre ?? 'Banda'`) en negrita;
   - «{genre} · propone {fecha}» en `c.secondary`, con la fecha de `proposedAt` en
     `formatearFechaHoraCorta(proposedAt, zona)` de `src/lib/redes/horario.ts` y `zona =
     PAISES[pais]?.zonaHoraria ?? PAISES[PAIS_POR_DEFECTO].zonaHoraria`; las partes que
     falten se omiten (sin género: solo «propone {fecha}»; sin fecha: solo el género);
   - «Llegó {haceTiempo(createdAt, ahora)}» en `c.muted`, `fontSize.xs`;
   - botón «Aceptar» (fondo `c.accent`, texto `c.onAccent`) y botón con borde «Ver
     propuesta» (→ `onVerSolicitudes`).
   - «Aceptar» llama a `aceptarSolicitud(id)`: mientras responde, ese botón muestra
     `ActivityIndicator` y los «Aceptar» de las tres quedan deshabilitados; con `{ ok:
     false }`, el `mensaje` en `c.dangerText` debajo de esa solicitud (no `Alert.alert`:
     no hace nada en el build web, `src/lib/confirm.ts`); con éxito la solicitud sale sola
     de la lista (el hook recarga). Sin confirmación previa: aceptar se deshace hablando con
     la banda; rechazar, no, y por eso no está acá (W-330).
   - Si `solicitudes` es `null` (no se pudo leer), la sección no se dibuja: la tarjeta «Por
     responder» ya dice «—».
4. **«Ventas recientes»**, con «Ver ventas» a la derecha (→ `onVerVentas`): `ventasRecientes`
   (hasta 5), cada una en una fila (en el celular no hay tabla, W-330 móvil):
   - arriba, artista del evento (el de `eventos` con ese id, o «Evento») en negrita y a la
     derecha el monto (`formatearMonto(monto, moneda)` de `src/lib/precio.ts`);
   - abajo, el comprador (`compradorEmail`, ya enmascarado por el 195, o «Sin correo»),
     «{cantidad ?? 1} ent.» y la fecha (`formatearFechaHoraCorta(createdAt, zona)`) en
     `c.secondary`, y una insignia con `etiquetaEstadoVenta(status)`: tono `success` →
     fondo `c.successBg` y texto `c.success`; `warning` → `c.warningBg`/`c.warningText`;
     `danger` → `c.dangerBg`/`c.dangerText`; `neutral` → `c.accentLight`/`c.secondary`.
   - Sin ventas: «Todavía no hay compras.» en `c.muted`, cursiva. Con `ventas` `null`: «No
     pudimos leer las ventas. Vuelve a intentarlo en un momento.» en `c.dangerText`.

#### Músico (`tipo === 'musician'`), en este orden

1. **Cuatro tarjetas**, textos de W-329 §1:
   - «Próximos shows» — valor `proximosShows`; nota `notaProximoShow`.
   - «Entradas vendidas» — valor `vendidasActivas`; nota «En tus eventos activos». Toca →
     `onVerVentas`.
   - «Contactos» — valor `contactos`; nota «+{contactosNuevosMes} este mes» (nada si es 0).
     Toca → `onVerContactos`.
   - «Solicitudes» — valor `porResponder.length`; nota «De locales, por responder». Toca →
     `onVerSolicitudes`. (Sin `destacado`: en W-329 solo el local lo tiene.)
2. **«Vendidas por evento»**, igual que en el local.

Sin «Solicitudes» ni «Ventas recientes» en lista: el diseño del músico (W-329) no las tiene.

### 2. `src/screens/DashboardLocalScreen.tsx` — exactamente esto

1. `import NumerosPanel from '../components/NumerosPanel';` junto a los demás imports de
   componentes.
2. Se borran el estado `resumenVentas` (`const [resumenVentas, setResumenVentas] = …`), la
   constante `idsEventos` y el `useEffect` que consulta `tickets` (con su comentario sobre
   `tickets_select_event_owner`): esa consulta pasa a `usePanel`, y el comentario ya no es
   cierto (existe `tickets_select_event_team`). `misEventos` y la consulta de músicos no
   cambian.
3. En el `ListHeaderComponent`, el `<Text style={styles.tituloSeccion}>Resumen</Text>` y el
   `<View style={styles.resumenRow}>…</View>` con sus tres tarjetas se reemplazan por:

   ```tsx
   <NumerosPanel
     tipo="venue"
     tenantId={miVenue.id}
     pais={miVenue.pais}
     eventos={misEventos}
     onVerSolicitudes={() => navigation.navigate('Solicitudes')}
     onVerContactos={() => navigation.navigate('Contactos', { tipo: 'venue' })}
     onVerVentas={() => navigation.navigate('Ventas')}
   />
   ```

4. En `crearEstilos` se borran `resumenRow`, `resumenCard`, `resumenNumero` y
   `resumenLabel` (quedan sin uso). `tarjetaPro`, que está entre ellos, se queda.

Nada más de la pantalla cambia: tarjeta del local, Pro, botones, lista de eventos y pie.

### 3. `src/screens/PerfilMusicoScreen.tsx`

1. `import NumerosPanel from '../components/NumerosPanel';` y `PAIS_POR_DEFECTO` de
   `'../constants/paises'`.
2. Se borran el estado `ventas`, la constante `idsEventos` y el `useEffect` que consulta
   `tickets`; si `useEffect` queda sin uso, sale del import de `react`.
3. La tarjeta «Resumen» (`<View style={styles.card}>` con «Eventos publicados» y «Entradas
   vendidas») se reemplaza por, solo si `!esMock` (un perfil de muestra no tiene fila
   real):

   ```tsx
   <NumerosPanel
     tipo="musician"
     tenantId={perfil.id}
     pais={perfil.pais ?? PAIS_POR_DEFECTO}
     eventos={misEventos}
     onVerSolicitudes={() => (navigation as any).navigate('Solicitudes')}
     onVerContactos={() => (navigation as any).navigate('Contactos', { tipo: 'musician' })}
     onVerVentas={() => (navigation as any).navigate('VentasMusico')}
   />
   ```

4. En `crearEstilos` se borran `resumenFila`, `resumenLabel` y `resumenValor`.

### Choque con el 199 y el 203

El spec 199 también edita `DashboardLocalScreen.tsx` (botón con modal para invitar bandas a
Sonópolis) y el 203 cambia el texto del botón «👥 Contactos» en `DashboardLocalScreen.tsx`
y en `PerfilMusicoScreen.tsx`. Este spec toca solo los puntos del §2 y del §3: imports, el
bloque de estado y efecto de ventas, el bloque «Resumen» y los estilos que quedan sin uso;
no toca el botón de contactos ni los botones de acción. Los cambios se ubican por contenido,
no por número de línea: si el 199 o el 203 se aplican antes, se aplica el mismo cambio sobre
lo que haya, sin tocar lo de ellos.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `npx expo export --platform web` termina sin errores.
3. Ningún hex nuevo en los archivos tocados (`git diff` sin `#[0-9a-fA-F]{3,6}` agregado).
4. `grep -n "from('tickets')" src/screens/DashboardLocalScreen.tsx src/screens/PerfilMusicoScreen.tsx`
   no devuelve nada (la consulta vive en `usePanel`).
5. `grep -n "resumenVentas\|toLocaleString" src/screens/DashboardLocalScreen.tsx` no
   devuelve nada.
6. `grep -n "aceptarSolicitud" src/components/NumerosPanel.tsx` devuelve la llamada, y
   `grep -n "booking_requests" src/components/NumerosPanel.tsx` no devuelve nada (sin copia
   de la lógica de `useSolicitudes`).
7. `grep -n "Cobrado en\|Por responder\|Tu público\|Próximos shows\|De locales, por responder" src/components/NumerosPanel.tsx`
   devuelve las cinco.
8. `git diff --stat` del commit toca solo los tres archivos de «Capa» y los del cierre.

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Local con una solicitud pendiente de una banda: «Por responder» en 1 y destacado, la
  solicitud en «Solicitudes de bandas»; «Aceptar» la saca de la lista y en
  `SolicitudesScreen` figura aceptada.
- Local con ventas en un evento creado por una banda en su local: las ventas aparecen en
  «Ventas recientes» y en «Vendidas por evento».
- «Cobrado en {mes}» con una venta del último día del mes a las 22:00 en Chile cuenta en ese
  mes, no en el siguiente.
- Músico: «Próximos shows» con un evento pasado sin cerrar no dice «Es hoy».
- Las dos pantallas en tema claro y oscuro.

## Fuera de alcance

- Rechazar desde el panel (W-330, Descartado).
- El rediseño visual completo (encabezado con avatar, dos columnas, barra lateral de W-327)
  y «Ficha a medias» de W-330: la app ya muestra «Perfil completo {n}/{total}» en la tarjeta
  del local.
- La pantalla de contactos («Tu público» con cuatro números, W-329 §2 y W-330 §2).
- Las vendidas dentro de cada `TarjetaEvento` de la lista: es un componente compartido con
  la cartelera.

## Bugs encontrados al aplicar (28-nov-2026)

- **Singulares.** Los textos literales daban «En 1 eventos activos», «De 1 entradas pagadas»
  y «1 vendidas». Se usa el singular cuando la cuenta es 1, como la web (`plural` en
  `app/(private)/local/page.js`).
- **Vendidas sin lectura.** `vendidasPorEvento[id] ?? 0` falla con `vendidasPorEvento` en
  `null` (no se pudieron leer las ventas). La fila escribe «—», la regla general del §1.
- **Margen doble en el músico.** El `ScrollView` de `PerfilMusicoScreen` ya tiene
  `padding: spacing.md`: sumar el margen lateral del componente desalineaba el bloque. El
  margen lo pone el componente solo en el local; en el músico deja `marginBottom: spacing.md`,
  como las tarjetas vecinas.
