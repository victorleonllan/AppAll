# Spec 172 — Pantalla «Visitas» en el admin de la app: visitantes de la web por país y detalle de cada uno

> Estado: propuesto, sin aplicar (13-nov-2026)
> Capa: FRONTEND. `src/screens/AdminVisitasScreen.tsx` (nuevo), `src/navigation/pantallasAdmin.tsx`, `src/screens/AdminScreen.tsx`.
> Depende de: spec 171 (`useAdminVisitas`, `src/lib/visitas.ts`), spec 158, spec 159, spec 173 (los archivos nuevos de este spec arman sus estilos con `useEstilos` y leen los colores de JSX con `useTema().colores`, según la receta §6 del 173; los archivos que ya existen siguen con `colors` hasta su spec de migración).
> Hermano en la web: `app/(private)/admin/visitas/page.js`, `app/(private)/admin/AdminNav.js` (W-263, W-266, W-269).

> **En una frase:** Administración gana un destino «Visitas» que muestra, como
> `/admin/visitas` de la web, cuántos visitantes y visitas tuvo la web por cartelera de país
> en 7 a 365 días, cuántos compraron, y cada visitante con quién es, de dónde llegó, su
> recorrido y sus compras.

## Contexto

Pedidos de Victor para la web: «necesito en mi crm admin de sonopolis, poder ver visitantes
de la pagina web, dividirla a que cartelera accedieron» (W-261), «puedes aumentar la cantidad
de tiempo registrado??» (W-266) y «puedes dar mas detalles de cada visitante? no me da
confianza los datos, porque no entiendo la diferencia de visitantes vs visitas» (W-267).

La página de la web (`app/(private)/admin/visitas/page.js`) tiene, en orden: la bajada con el
total (`:71-74`), el recuadro que explica visita y visitante (`:76-91`), el selector de
período (`:93-104`), la sección «Por cartelera · N» (`:106-112`), la línea de compras y la
primera visita del período (`:114-125`) y la sección «Visitantes · N» con el aviso de 500
(`:127-138`). Cada visitante (`FilaVisitante`, `:178-226`) muestra nombre, email o «Anónimo»,
la insignia «Compró · N entradas», la línea país · origen · páginas · fechas, y el recorrido en
un `<details>`. En `AdminNav.js:12` «Visitas» va después de «CRM».

En la app, Administración es la lista de destinos de `src/screens/AdminScreen.tsx:16-25`
(Pagos, Eventos, CRM, Locales) y las rutas se registran una sola vez en
`src/navigation/pantallasAdmin.tsx` (`AdminParamList` `:15-23`, grupo `:38-50`), que incluyen
los tres stacks de perfil (spec 158). El spec 171 deja `useAdminVisitas(periodo)` y las
funciones puras (`PERIODOS_VISITAS`, `origenDeVisita`, `etiquetaDeRuta`, `formatearMomento`,
`resumirVisitas`, `MAX_VISITANTES`). `etiquetaPais` vive en `src/constants/paises.ts:122`.

## Decisiones

1. **Una pantalla aparte, no una sección del CRM.** Mismo porqué que W-263: el CRM es el
   público de cada local y banda; las visitas son de toda la web y no tienen tenant.
2. **«Visitas» después de «CRM» en Administración**, con la bajada de la web («Quién entró a
   la web, según la cartelera de país que vio.»), igual que el orden de `AdminNav`.
3. **`FlatList` con encabezado, no `ScrollView`.** Pueden llegar hasta 500 visitantes;
   `FlatList` dibuja solo los visibles. Todo lo que en la web va antes de la lista entra en
   `ListHeaderComponent`, como un elemento y no como función componente (el mismo cuidado de
   `AdminTenantScreen.tsx:246-247`).
4. **El período vive en un `useState`, no en la ruta.** En la web es `?periodo=` porque es una
   URL; en la app no hay URL que compartir, y la pantalla no tiene deep link (fuera de alcance
   del 158).
5. **«Ver recorrido» despliega en la misma tarjeta** con un `useState` por fila, porque React
   Native no tiene `<details>`. Mismo porqué que W-269: abrir y cerrar en la lista es más
   rápido que entrar y volver.
6. **Sin guarda de navegación propia.** Las otras pantallas del admin (Pagos, Eventos, CRM) no
   la tienen: la guarda de navegación es `AdminScreen` y la de seguridad es la RPC, que a un
   no-admin le responde «solo admin», y ese error se muestra en rojo.
7. **Textos literales de la web**, incluido el recuadro de explicación. Su frase «Las compras
   hechas en la app no pasan por la web y no aparecen acá» sigue siendo cierta vista desde la
   app (spec 171, Decisión 1), así que no se cambia.

## Cambios por archivo

### `src/navigation/pantallasAdmin.tsx`

- `AdminParamList` suma `AdminVisitas: undefined;` con el comentario
  `// Spec 172 — visitantes de la web por cartelera de país.`
- El grupo suma `<Stack.Screen name="AdminVisitas" component={AdminVisitasScreen} options={{ title: 'Visitas' }} />`
  después de `AdminCrm` (el título del encabezado hace de H1 «Visitas»).

### `src/screens/AdminScreen.tsx`

- El tipo de `ruta` en `DESTINOS` suma `'AdminVisitas'`.
- Nuevo destino después de CRM:
  `{ ruta: 'AdminVisitas', titulo: 'Visitas', bajada: 'Quién entró a la web, según la cartelera de país que vio.' }`.

### `src/screens/AdminVisitasScreen.tsx` (nuevo)

`const [periodo, setPeriodo] = useState<ClavePeriodo>(PERIODO_POR_DEFECTO);`
`const v = useAdminVisitas(periodo);` y `resumirVisitas(v.porPais, v.visitantes)`.

Primera carga sin datos: `ActivityIndicator` centrado. Después, `FlatList` con
`data={v.visitantes}`, `RefreshControl` → `v.recargar`, y:

**Encabezado** (en este orden):

1. `error` del hook en rojo (`colors.danger`), si hay.
2. Bajada: «Quién entró a la web, según la cartelera de país que vio. {total}
   {visitante|visitantes} en los últimos {PERIODOS_VISITAS[periodo]} días.»
3. Recuadro de explicación (fondo `colors.cardBackground`, borde `colors.border`), dos
   párrafos con las copias de `page.js:80-90`; «Visita:» y «Visitante:» en negrita.
4. Selector: cinco botones en fila con salto de línea («7 días» … «365 días», en el orden de
   `PERIODOS_VISITAS`). El activo con fondo `colors.primary` y texto blanco; los demás con
   borde. Tocar uno hace `setPeriodo(clave)`; mientras carga, los conteos anteriores siguen
   visibles.
5. Sección «POR CARTELERA · {n}» (título en mayúsculas pequeñas, como las demás pantallas del
   admin): una tarjeta por país con `etiquetaPais(pais)` en negrita y debajo
   «{n} visitante(s) · {n} visita(s) · {n} con cuenta», con singular para 1. Sin filas: tarjeta
   punteada «Nadie visitó la web en este período.»
6. Línea de compras en negrita: «{compraron} de {n} {visitante|visitantes}
   {compró|compraron} · {n} {entrada|entradas}» y, si hay `primero`, debajo en texto chico
   «Primera visita del período: {formatearMomento(primero.primera, primero.pais)}».
7. Título «VISITANTES · {n}» y, si `visitantes.length >= MAX_VISITANTES`, «Se muestran los 500
   visitantes más recientes.»

**`ListEmptyComponent`:** tarjeta punteada «Nadie visitó la web en este período.»

**Cada visitante** (`FilaVisitante`, componente del mismo archivo, con su `useState`
`abierto`):

- Fila de título: `nombre || email || 'Anónimo'` en negrita (`numberOfLines={1}`) y, si
  `compras > 0`, una insignia verde «Compró · {n} {entrada|entradas}» (`colors.success` sobre
  `#E8F5E9`, el par de la insignia verde de `EtiquetaPro`).
- Si hay `nombre` y `email`, el email debajo en texto chico.
- Línea: `etiquetaPais(pais)` · `origenDeVisita(v)` · «{n} página(s)» · «{desde} → {hasta}»
  con `formatearMomento(..., pais)`; una sola fecha si las dos son iguales.
- «Ver recorrido» / «Ocultar recorrido» (`colors.accent`): al abrir, una línea por paso,
  «{formatearMomento(at, pais)} — {etiquetaDeRuta(paso)}», en el orden que trae el hook
  (viejas primero).

El comentario de cabecera dice de qué página de la web es port y que los textos son literales
(Decisión 7).

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. Con la cuenta admin, Administración muestra cinco destinos y «Visitas» va después de
   «CRM»; abrirla muestra la bajada, el recuadro, los cinco botones con «30 días» activo, la
   sección por cartelera, la línea de compras y la lista de visitantes; la flecha atrás vuelve
   a Administración.
4. Tocar «365 días» cambia la bajada a «en los últimos 365 días» y los conteos coinciden con
   `sonopolis.org/admin/visitas?periodo=365` en el mismo momento.
5. «Ver recorrido» despliega los pasos de ese visitante y no los de otros.
6. Con una cuenta de prueba que no es admin, el botón «Administración» no aparece (spec 158);
   si se llega a la pantalla igual, se ve el error «solo admin» en rojo y ningún dato.
7. `grep -rn "registrar_visita" src` sin salida (la app no registra visitas).

## V-candidatas

- **V-candidata 172-a:** en un teléfono, con la cuenta admin y `sonopolis.org/admin/visitas`
  al lado, comparar países, conteos, la línea de compras y tres visitantes con su recorrido;
  confirmar que las horas de un visitante de México salen en hora de México.

## Fuera de alcance

- Gráfico por día, desglose por página, exportar, filtrar por país u origen, paginar más allá
  de 500 (también fuera en la web, W-263 y W-269).
- Deep link a `/admin/visitas` (`linking.ts`), como el resto del admin (spec 158).
- Registrar visitas desde la app (spec 171, Decisión 1).
