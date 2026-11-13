# Spec 169 — La tarjeta Pro de la app dice cuándo se renueva, deja cancelar y dice hasta qué día queda Pro

> Estado: aplicado (13-nov-2026) — `tsc` limpio fuera de `supabase/functions` (criterio 1), export web limpio (criterio 2), grep del criterio 6 sin salida, estado del 154 actualizado (criterio 8). Pendientes en dispositivo: criterios 3, 4, 5 y 7 y V-candidatas 169-a y 169-b
> Capa: FRONTEND. `src/components/TarjetaPro.tsx`, `src/components/BotonCancelarSuscripcionPro.tsx` (nuevo), `src/screens/DashboardLocalScreen.tsx`, `src/screens/PerfilMusicoScreen.tsx`, `src/screens/ContactosScreen.tsx`.
> Depende de: spec 168 (`useMiSuscripcionPro`, `cancelarMiSuscripcionPro`, `fechaLargaPro`, `fechaFinSiCancela`), spec 154, spec 155, spec 173 (los archivos nuevos de este spec arman sus estilos con `useEstilos` y leen los colores de JSX con `useTema().colores`, según la receta §6 del 173; los archivos que ya existen siguen con `colors` hasta su spec de migración).
> Hermano en la web: `components/CardSonopolisPro.js`, `components/BotonCancelarSuscripcionPro.js`, `app/(private)/local/page.js`, `local/contactos/page.js`, `musico/page.js`, `musico/contactos/page.js` (W-265 y su addenda).

> **En una frase:** con suscripción a Pro, la tarjeta «Sonópolis Pro» de la app dice cuándo
> se renueva sola y tiene «Cancelar suscripción»; cancelada, dice hasta qué día sigue Pro.
> Sigue sin precio, sin botón de compra y sin mandar a pagar por fuera.

## Contexto

La web (W-265) cambió `CardSonopolisPro` para el dueño con suscripción
(`components/CardSonopolisPro.js:30-35`, `141-176`): con estado `activa` dice «Activo. Se
renueva solo el {fecha} por {monto} con Mercado Pago.» y ofrece cancelar; `pausada` avisa que
el cobro falló; `cancelada` dice hasta cuándo sigue Pro. Con suscripción `activa` no sale
«Vence pronto» (`:35`: se renueva sola). La addenda de W-265 también muestra la tarjeta en el
CRM del dueño (`/local/contactos`, `/musico/contactos`) con Pro activo, **solo si hay
suscripción** (`local/contactos/page.js:73`), porque Victor pidió que cancelar sea fácil
«dentro del crm de local».

La app tiene la tarjeta informativa del spec 154 (`src/components/TarjetaPro.tsx`) montada en
tres lugares:

- `src/screens/DashboardLocalScreen.tsx:196` (panel del local; el `return` temprano sin local
  está en `:122`);
- `src/screens/PerfilMusicoScreen.tsx:263` (panel del músico, solo si `!esMock`; los `return`
  tempranos están en `:145` y `:154`);
- `src/screens/ContactosScreen.tsx:145` (solo **sin** Pro; `tenant` sale de
  `useTenantPropio(tipo)` en `:97`, con `id`).

El spec 168 deja `useMiSuscripcionPro(tipo, id | null)`, `cancelarMiSuscripcionPro`,
`fechaLargaPro` y `fechaFinSiCancela`.

## Decisiones

1. **Cancelar sí va en la app; comprar no.** La decisión vigente es que Pro no se vende en la
   app (plan del 19-oct, tabla de decisiones; spec 154): Apple y Google exigen su cobro
   integrado para vender funciones digitales y prohíben dirigir a pagar por fuera. Cancelar no
   es vender ni dirigir a pagar: es dejar de cobrar algo que la persona ya contrató. Ponerlo
   junto a la tarjeta del 154 es lo que pidió Victor para la web («que sea fácil cancelarlo»)
   y el dueño que abre la app no tiene por qué ir a la web para eso.
   - Descartado: mostrar la renovación sin botón y mandar a cancelar en la web. Sería un
     llamado a ir fuera de la app justo para lo que sí se puede hacer dentro.
2. **Qué se saca de los textos de la web, y por qué.** Se quitan el monto y toda mención a
   Mercado Pago, para no mostrar precio ni nombrar el medio de pago externo (misma regla del
   154, criterio 6):

   | Estado | Web (W-265) | App |
   |---|---|---|
   | `activa` | «Activo. Se renueva solo el **{fecha}** por **{monto}** con Mercado Pago.» | «Activo. Se renueva solo el **{fecha}**.» |
   | `pausada` | «Mercado Pago no pudo cobrar la renovación. Pro sigue activo hasta el **{fecha}**. Revisa tu medio de pago en Mercado Pago.» | «No se pudo cobrar la renovación. Pro sigue activo hasta el **{fecha}**.» |
   | `cancelada` | «Cancelaste tu suscripción. Puedes seguir usando Sonópolis Pro hasta el **{fecha}**. No se te va a cobrar de nuevo.» | igual |

   «Revisa tu medio de pago en Mercado Pago» es una instrucción de pagar por fuera; queda
   fuera por la misma razón que el «escríbenos para renovarlo» del 154.
3. **Este spec reemplaza el criterio 6 del spec 154.** Ese grep prohíbe `suscrib` y `renov`
   en `TarjetaPro.tsx`, y ahora la tarjeta tiene que decir «suscripción» y «se renueva». El
   criterio nuevo (criterio 6 de este spec) mantiene prohibido lo que el 154 quería evitar:
   Mercado Pago, precio, «escríbenos», `mailto`, «se cobra», «al mes». Al cerrar este spec, la
   línea de estado del 154 suma «criterio 6 reemplazado por spec 169»; el diseño del 154 no
   se edita.
4. **Confirmación con `confirmar` y no con un modal propio.** La app ya confirma acciones
   destructivas con `confirmar` (`src/lib/confirm.ts:16`, spec 158 en `BotonCerrarEvento`):
   `Alert.alert` en nativo y `window.confirm` en el build web, donde `Alert.alert` no hace
   nada. El diálogo de la web se queda abierto si falla; en la app el error queda en un `Text`
   rojo bajo el botón, que cumple lo mismo (la persona lee el motivo y puede reintentar).
5. **La tarjeta sigue sin llamadas; las pantallas cargan.** El 154 dejó la tarjeta como
   componente de presentación («no hay estado ni llamadas»). Cada pantalla llama
   `useMiSuscripcionPro` y le pasa `suscripcion` y `onCambio={recargar}`, igual que las
   páginas de la web le pasan `suscripcion` a `CardSonopolisPro`. La única acción con red es
   la de `BotonCancelarSuscripcionPro`, que es su propio componente (como en la web).
6. **Después de cancelar se recarga la suscripción, no el tenant.** El texto `cancelada` usa
   `suscripcion.proHasta`, que el RPC lee en vivo de `sonopolis_pro_hasta`, así que con
   `recargar` la tarjeta ya dice la fecha nueva. El `sonopolisProHasta` del tenant en el
   contexto queda 3 días más largo hasta la próxima carga del contexto; solo afecta la cuenta
   de «quedan N días», y refrescar Pro con el panel abierto ya estaba fuera de alcance en el
   148 y el 154.
7. **En Contactos, la tarjeta con Pro solo si hay suscripción** (addenda de W-265). Con Pro
   regalado por el admin, Contactos queda como hoy.

## Cambios por archivo

### `src/components/TarjetaPro.tsx`

Props nuevas, todas opcionales para no romper otros usos:

```ts
interface Props {
  tenant: { id?: string; sonopolisProHasta?: string | null };
  tipo?: TipoTenant;                        // 'venue' | 'musician', para cancelar
  etiqueta: string;
  onVerContactos?: () => void;
  suscripcion?: MiSuscripcionPro | null;    // de useMiSuscripcionPro
  onCambio?: () => void;                     // la pantalla recarga la suscripción
}
```

- `sus = activo && suscripcion && ['activa','pausada','cancelada'].includes(suscripcion.estado) ? suscripcion : null`
  (misma regla que `CardSonopolisPro.js:34`: sin Pro vigente, la suscripción no se muestra).
- `porVencer = activo && !sinVencimiento && dias !== null && dias <= 7 && sus?.estado !== 'activa'`.
- Con `sus`, en lugar de la línea «Activo hasta el…», el texto de la tabla de la Decisión 2,
  con la fecha en negrita (`fontWeight: 'bold'` en un `Text` anidado):
  - `activa`: `fechaLargaPro(sus.proximoCobroAt ?? sus.proHasta)`;
  - `pausada` y `cancelada`: `fechaLargaPro(sus.proHasta)`.
- Con `sus` en `activa` o `pausada`, y si vienen `tipo` y `tenant.id`:
  `<BotonCancelarSuscripcionPro tipo={tipo} id={tenant.id} finTexto={…} onCancelada={onCambio} />`.
  `finTexto`: con `fechaFinSiCancela(sus)` no nulo → «Puedes seguir usando Pro hasta el
  {fechaLargaPro(fin)}.»; nulo → «Pro termina hoy, porque el último mes no se pudo cobrar.»
  (copias de `CardSonopolisPro.js:169-176`).
- Sin `sus` la tarjeta se ve exactamente como hoy. «Ver tus contactos →» y la línea de
  WhatsApp siguen igual en todos los casos con Pro.
- El comentario de cabecera suma: «Spec 169 — con suscripción dice cuándo se renueva y deja
  cancelar; sigue sin precio ni Mercado Pago (Decisión 2)».

### `src/components/BotonCancelarSuscripcionPro.tsx` (nuevo)

Props: `{ tipo: TipoTenant; id: string; finTexto: string; onCancelada?: () => void }`.

- Un `TouchableOpacity` de texto discreto «Cancelar suscripción» (`fontSize.sm`,
  `colors.secondary`, subrayado): no es la acción principal de la tarjeta, igual que en la
  web.
- Al tocar: `confirmar({ title: '¿Cancelar Sonópolis Pro?', message: \`No se te va a cobrar más. ${finTexto}\`, confirmText: 'Sí, cancelar', cancelText: 'Seguir con Pro', destructive: true }, …)`.
- Si confirma: `cancelarMiSuscripcionPro(tipo, id)`. Mientras espera, el texto dice
  «Cancelando…» y el botón queda deshabilitado.
  - Bien → un `Text` en `colors.success` «Listo. Tienes Pro hasta el {fechaLargaPro(proHasta)}.»
    (el toast de la web) y `onCancelada?.()`.
  - Mal → el mensaje de la función (`errorLegible`, p. ej. «No tienes una suscripción
    activa») en un `Text` en `colors.danger` bajo el botón. Nunca `Alert.alert` para el error.

### `src/screens/DashboardLocalScreen.tsx`

- Junto a los demás hooks, **antes** del `return` temprano de `:122`:
  `const { suscripcion, recargar: recargarSuscripcion } = useMiSuscripcionPro('venue', miVenue?.id ?? null);`
- `<TarjetaPro … tipo="venue" suscripcion={suscripcion} onCambio={recargarSuscripcion} />`
  (lo demás del montaje de `:196` igual).

### `src/screens/PerfilMusicoScreen.tsx`

- Junto a los demás hooks, antes de los `return` tempranos de `:145`/`:154`:
  `useMiSuscripcionPro('musician', !esMock && perfil ? perfil.id : null)`.
- `<TarjetaPro … tipo="musician" suscripcion={suscripcion} onCambio={recargarSuscripcion} />`.

### `src/screens/ContactosScreen.tsx`

- Junto a `useTenantPropio` (`:97`), antes de los `return` tempranos:
  `useMiSuscripcionPro(tipo, tenant?.id ?? null)`.
- Rama sin Pro (`:136-150`): sin cambios.
- Rama con Pro: si hay `suscripcion`, `<TarjetaPro tenant={tenant} tipo={tipo} etiqueta={etiqueta} suscripcion={suscripcion} onCambio={recargarSuscripcion} />`
  arriba de `RedactarCorreo`, dentro de `encabezado`, con el mismo envoltorio `styles.tarjetaPro`.
  Sin `onVerContactos`: ya está en Contactos (igual que la web, que no pasa `contactosHref`
  ahí).

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. Sin suscripción (local sin Pro, local con Pro del admin, músico con Pro sin vencimiento),
   la tarjeta se ve igual que antes de este spec en los tres lugares, y Contactos con Pro no
   muestra la tarjeta.
4. Con suscripción `activa`: «Activo. Se renueva solo el {fecha}.», sin «VENCE PRONTO» aunque
   falten menos de 7 días, y «Cancelar suscripción». Con `cancelada`: «Cancelaste tu
   suscripción. Puedes seguir usando Sonópolis Pro hasta el {fecha}…», sin botón.
5. Tocar «Cancelar suscripción» pide confirmación con «¿Cancelar Sonópolis Pro?» y la fecha
   de `finTexto`; «Seguir con Pro» no llama a nada (en el build web, `window.confirm`).
6. `grep -niE "mercado ?pago|escr[ií]benos|mailto|se cobra|al mes|formatearMonto|monto" src/components/TarjetaPro.tsx src/components/BotonCancelarSuscripcionPro.tsx`
   → nada. Reemplaza al criterio 6 del spec 154 (Decisión 3).
7. Un error de `cancelar-suscripcion-pro` (p. ej. con una cuenta que no es la dueña, 403)
   queda en rojo bajo el botón y la tarjeta no cambia.
8. Al cerrar, la línea de estado del spec 154 suma «criterio 6 reemplazado por spec 169».

## V-candidatas

- **V-candidata 169-a (es la misma V40 de la web):** con Quintal Clandesta y una suscripción
  real, el panel del local y Contactos dicen «Se renueva solo el {fecha del pago + 1 mes}»;
  «Cancelar suscripción» → la confirmación muestra esa misma fecha → «Sí, cancelar» → la
  tarjeta dice «Puedes seguir usando Sonópolis Pro hasta el {misma fecha}», y en Mercado Pago
  la suscripción figura cancelada. **Hay una sola suscripción real para probar:** si V40 se
  hace en la web, en la app se verifica solo el estado `cancelada`; coordinarlo antes.
- **V-candidata 169-b:** en un iPhone y un Android, con la cuenta de Quintal, la tarjeta en
  `activa` no ofrece nada que lleve a pagar o a Mercado Pago, solo cancelar.

## Fuera de alcance

- Precio, suscribirse, volver a suscribirse o renovar desde la app (decisión de producto del
  154).
- Mostrar al dueño sus cobros (spec 163: solo admin).
- Refrescar el Pro del tenant en el contexto con el panel abierto (148, 154).
- Riesgo de tienda a revisar al publicar, no lo decide este spec: la guía 3.1.3(b) de Apple
  (ver 154). Mostrar que existe una suscripción contratada fuera de la app puede llevar a la
  revisión a preguntar por la compra integrada.

## Bugs encontrados al aplicar (13-nov-2026)

- **El comentario de cabecera que pide el spec no pasa el criterio 6.** La sección de
  `TarjetaPro.tsx` pide sumar «sigue sin precio ni Mercado Pago (Decisión 2)», pero el grep
  del criterio 6 busca `mercado ?pago` en todo el archivo, comentarios incluidos. Se aplicó
  con «sigue sin precio ni nombre del medio de pago externo (Decisión 2)»: mismo sentido, y
  el grep queda como prueba sin excepciones.
- **«Listo. Tienes Pro hasta el…» casi no se ve.** `onCancelada` recarga la suscripción; al
  pasar a `cancelada` la tarjeta deja de dibujar el botón (solo va en `activa`/`pausada`), y
  con él el texto de éxito. La persona igual ve la fecha: la tarjeta pasa a «Cancelaste tu
  suscripción. Puedes seguir usando Sonópolis Pro hasta el {fecha}». No se cambió el diseño.
- `MiSuscripcionPro.proHasta` y `proximoCobroAt` pueden ser `null` en el tipo del 168 y
  `fechaLargaPro` pide `string`: sin fecha en la suscripción, la tarjeta usa la del tenant
  (`fechaHastaPro`), la misma que mostraba antes.
