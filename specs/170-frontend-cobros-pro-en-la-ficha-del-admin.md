# Spec 170 — Cobros de Pro en la ficha del tenant del admin en la app: si se recibió, si falló y por qué

> Estado: propuesto, sin aplicar (13-nov-2026)
> Capa: FRONTEND. `src/screens/AdminTenantScreen.tsx`, `src/components/CobrosPro.tsx` (nuevo).
> Depende de: spec 168 (`useCobrosPro`, `src/lib/cobrosPro.ts`), spec 159, spec 173 (los archivos nuevos de este spec arman sus estilos con `useEstilos` y leen los colores de JSX con `useTema().colores`, según la receta §6 del 173; los archivos que ya existen siguen con `colors` hasta su spec de migración).
> Hermano en la web: `app/(private)/admin/crm/[tipo]/[id]/page.js`, `app/(private)/admin/crm/CobrosPro.js` (W-271).

> **En una frase:** en la ficha de cada local o banda del admin de la app, debajo del código
> de suscripción, una sección «Cobros de Pro» dice en una línea cómo está cada suscripción y
> lista cada cobro de Mercado Pago con fecha, monto, medio de pago y qué pasó.

## Contexto

Pedido de Victor para la web (09-nov-2026): «crearia algo apra poder ver en el crm, de que
manera falló el cobro, si es que falló y si se recibió correctamente.» El 30-oct un cobro de
Quintal se devolvió y solo se supo mirando la cuenta de Mercado Pago (spec 163).

La web pone `<CobrosPro>` justo después de `<CodigoSuscripcionPro>`
(`app/(private)/admin/crm/[tipo]/[id]/page.js:107-109`) y lo carga en paralelo con
`cargarCobros` (`:176-183`), que ante un error deja el mensaje y no tumba la ficha.
`CobrosPro.js` dibuja, por suscripción, el código, la fecha de creación, el resumen como
insignia, la lista de cobros y un `<details>` «Datos de Mercado Pago» cerrado
(`CobrosPro.js:36-128`).

En la app, la ficha es `src/screens/AdminTenantScreen.tsx` (spec 159). Su encabezado monta
`<CodigoSuscripcionPro …/>` en `:270-280` y la sección «Eventos activos» en `:282`; tiene
`Seccion` y `Vacio` locales (`:56-71`) y un `RefreshControl` que llama `t.recargar` (`:357`).
El spec 168 deja `useCobrosPro(tipo, id)` y las traducciones puras (`fechaCobro`,
`medioDePago`, `diagnosticoCobro`, `resumenSuscripcion`). `formatearMonto` vive en
`src/lib/precio.ts:37`.

## Decisiones

1. **Solo en la ficha, no en la lista del CRM.** Igual que la web: consultar Mercado Pago por
   cada tenant de la lista sería lento y no hace falta.
2. **Componente aparte, sección en la pantalla.** `CobrosPro.tsx` dibuja las suscripciones;
   la pantalla lo envuelve en su `Seccion` local y resuelve cargando, error y vacío con su
   `Vacio`. Así no se exportan `Seccion`/`Vacio` ni se duplican, y `AdminTenantScreen.tsx`
   (484 líneas) no crece con el detalle de cada cobro.
3. **«Datos de Mercado Pago» como un toque que despliega.** React Native no tiene
   `<details>`; un `TouchableOpacity` «Datos de Mercado Pago ▸/▾» con un `useState` por
   suscripción, cerrado al abrir la ficha. Los valores en `<Text selectable>` (mismo criterio
   que los datos bancarios del spec 158): son ids que se le pasan a soporte de Mercado Pago.
4. **Tono de la insignia con los colores del tema:** `success` → `colors.success` sobre
   `#E8F5E9` (la insignia verde de `EtiquetaPro`, `src/components/BotonesPro.tsx:147-150`),
   `danger` → `colors.danger` sobre un rojo claro, `neutral` → `colors.muted` sobre
   `colors.border`. Texto largo con salto de línea: el resumen del 30-oct no entra en una
   línea de teléfono.
5. **El pull-to-refresh recarga también los cobros.** Si no, el admin que vuelve a la ficha
   después de mirar Mercado Pago vería los cobros viejos.

## Cambios por archivo

### `src/components/CobrosPro.tsx` (nuevo)

Props: `{ suscripciones: SuscripcionConCobros[] }` (con al menos una; el vacío lo resuelve la
pantalla). Port de `CobrosPro.js` sin `Seccion`:

- **Por suscripción**, en el orden que llega (la más reciente arriba), una tarjeta
  (`colors.cardBackground`, borde `colors.border`, `borderRadius.lg`):
  - «{codigo} · creada el {fechaCobro(created_at)}», el código en negrita y fuente monoespaciada
    (`fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })`).
  - La insignia de `resumenSuscripcion(s)` (Decisión 4).
  - **Cobros**, uno por fila, separados por una línea `colors.border`:
    - arriba: `fechaCobro(c.date_approved ?? c.date_created)` en negrita y la insignia de
      `diagnosticoCobro(c).texto`;
    - abajo: `formatearMonto(c.transaction_amount, c.currency_id)` en negrita, « · », y
      `medioDePago(c)`; debajo, `diagnosticoCobro(c).detalle` en `colors.secondary`.
    - Siempre apilado (la web apila en pantalla angosta; en el teléfono siempre lo es).
  - Sin cobros: solo el resumen.
  - **«Datos de Mercado Pago»** (Decisión 3), con las mismas filas de `CobrosPro.js:96-120`,
    etiqueta arriba y valor abajo:
    - por cobro: «Operación {id}» → «{status} · {status_detail}» («—» si falta);
    - por `suscripciones_mp`: «Suscripción {id}» → «{status} · {fechaCobro(last_modified)}»;
      sin ninguna: «Suscripción en MP» → «ninguna»;
    - por `pagos_sonopolis`: «pro_pagos {mp_pago_id}» → «{fechaCobro(pagado_at)} → Pro hasta
      {fechaCobro(hasta_despues)}»; sin ninguno: «pro_pagos» → «ninguno»;
    - «Plan» → `mp_plan_id` o «—».

### `src/screens/AdminTenantScreen.tsx`

- `const cobros = useCobrosPro(tipo, id);` junto a `useTenantAdmin` (`:219`), antes de los
  `return` tempranos.
- En `encabezado`, justo después de `<CodigoSuscripcionPro …/>` (`:280`):

```tsx
<Seccion titulo="Cobros de Pro">
  {cobros.error ? <Vacio>No se pudieron leer los cobros: {cobros.error}</Vacio>
   : cobros.cargando && cobros.suscripciones.length === 0 ? <ActivityIndicator color={colors.accent} />
   : cobros.suscripciones.length === 0 ? <Vacio>Sin intentos de suscripción.</Vacio>
   : <CobrosPro suscripciones={cobros.suscripciones} />}
  <Text style={styles.textoChico}>Leído en vivo de Mercado Pago al abrir esta página.</Text>
</Seccion>
```

- `RefreshControl`: `onRefresh={() => { t.recargar(); cobros.recargar(); }}`;
  `refreshing={t.cargando}` sin cambios (los cobros muestran su propio indicador).
- El comentario de cabecera suma: «Spec 170 — Cobros de Pro (W-271).»

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. Con la cuenta admin, la ficha de Quintal (`venue`, `6a5f2a25-b086-4f3f-943f-8be57dda90ba`)
   muestra la suscripción `W5Q3DXJN` con «Mercado Pago cobró y lo devolvió; la suscripción no
   quedó creada» y la fila «30 oct, 13:26 · Devuelto · $20.000 · Tarjeta de débito (debvisa) ·
   Devuelto el 30 oct, 13:34, 8 min después del cobro» (lo mismo que dejó verificado W-271).
4. Un tenant sin suscripciones (p. ej. Café La Palma) muestra «Sin intentos de suscripción.».
5. Con la función devolviendo error (p. ej. sin red), la ficha carga entera y la sección dice
   «No se pudieron leer los cobros: …».
6. «Datos de Mercado Pago» abre cerrado y se despliega al tocarlo; el id de operación se puede
   seleccionar y copiar con pulsación larga.
7. A 375 px de ancho (build web o teléfono chico) ningún texto se sale de la tarjeta.

## V-candidatas

- **V-candidata 170-a:** con la cuenta admin en un teléfono y
  `sonopolis.org/admin/crm/venue/6a5f2a25-b086-4f3f-943f-8be57dda90ba` al lado, comparar la
  sección cobro por cobro; confirmar que la hora sale en hora de Chile también en Hermes
  (`Intl` con `timeZone`).

## Fuera de alcance

- Mostrar los cobros al dueño en su panel (spec 163: solo admin).
- Avisos automáticos de un cobro fallido.
- Cobros en la lista del CRM (Decisión 1).
