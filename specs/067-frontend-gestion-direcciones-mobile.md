# Spec 067 — `GestionDireccionesLocal`: direcciones múltiples en `EditarLocalScreen` (equivalente móvil de W-064)

**Capa: FRONTEND · `src/components/GestionDireccionesLocal.tsx`, `src/screens/EditarLocalScreen.tsx`
· Depende de: spec 066**

**Solo diseño — no implementar todavía** (pedido explícito de Victor, 2026-09-01). No
toca código ni corre nada.

## Motivo

Cierra de verdad el pendiente #26 de `sonopolisWeb/specs/W-PENDIENTES.md`: hoy
`EditarLocalScreen.tsx` tiene tres `TextInput` (`address`, `ciudad`, `comuna`, líneas
144-153) que van directo a `venues` vía `updateVenue()` — el mismo bug que el pendiente
#21/#25 ya cerró en la web (`FormLocal.js`/`FormEvento.js`): un dueño que edite su
dirección desde el celular deja `venues.address` desincronizado de la fila activa en
`venue_addresses`, y la próxima activación desde la web se lo pisa en silencio.

## Cambio en `EditarLocalScreen.tsx`

Sacar los 3 `TextInput` de dirección **en modo edición** (`miVenue` existe) y montar
`GestionDireccionesLocal` en su lugar — mismo movimiento que W-064 hizo con `FormLocal.js`.

```tsx
{miVenue ? (
  <GestionDireccionesLocal venueId={miVenue.id} />
) : (
  // modo creación: sin venue.id todavía no hay dónde insertar en
  // venue_addresses (mismo motivo documentado en W-062) — se mantienen los
  // 3 campos sueltos, igual que sonopolisWeb/FormLocal.js en modo creación.
  <>
    <TextInput ... value={address} onChangeText={setAddress} />
    <TextInput ... value={ciudad} onChangeText={setCiudad} />
    <TextInput ... value={comuna} onChangeText={setComuna} />
  </>
)}
```

Y en `handleGuardar`, rama de creación: después de `createVenue({ ...campos, ownerId })`
(sin `address`/`ciudad`/`comuna` en `campos` — se sacan del objeto, mismo tratamiento que
`FormLocal.js` le dio a `datos`), si `address.trim()` llamar a
`crearDireccion({ venueId: nuevoVenue.id, address, comuna, ciudad })` — el hook del spec
066 expuesto sin `venueId` fijo, o una función standalone equivalente para este único
uso (a decidir al implementar, según qué tan incómodo sea invocar el hook antes de tener
`venueId`).

## Componente nuevo — `GestionDireccionesLocal.tsx`

Puerto directo de `sonopolisWeb/components/GestionDireccionesLocal.js` a React Native,
usando `useVenueAddresses` (spec 066) en vez de llamar a Supabase directo. Mismo
comportamiento, adaptado a los primitivos de RN:

- Lista de direcciones (`View`/`FlatList` corto, máximo 3 filas — no hace falta
  virtualización): pin + dirección armada con
  `[address, comuna, ciudad].filter(Boolean).join(', ')`.
- Fila activa: fondo distinguible (mismo criterio de color que la web, adaptado a
  `theme.ts` de esta app — no hay `--son-yellow-50` acá, usar el amarillo de acento que ya
  define `colors` en `src/theme`), sin botón de borrar (mismo motivo: `eliminar` del hook
  ya lo rechaza, no tiene sentido ofrecer un botón que solo puede fallar).
- Fila no activa: botón "Usar esta" (`activar(d.id)`) + ícono de borrar (`eliminar(d)`).
- Menos de 3 direcciones: botón "+ Agregar otra dirección" que abre un `View` inline con
  los 3 `TextInput` (mismo patrón que el formulario inline de `GestionDirecciones.js` en
  la web) — no hace falta un `Modal` aparte, la pantalla ya scrollea.
- Exactamente 3: sin botón, línea de ayuda "Llegaste al máximo de 3 direcciones. Borra una
  para agregar otra." — mismo texto que la web.
- Primera dirección del venue (`direcciones.length === 0` mientras se agrega la primera):
  nota "Esta primera dirección queda activa sola. De la segunda en adelante, activar es un
  paso aparte." — mismo texto que la web, mismo comportamiento real de `crearDireccion()`.

## Fuera de alcance

- Cualquier ajuste visual más allá de lo que ya define `src/theme` — este spec no rediseña
  `EditarLocalScreen`, solo reemplaza los 3 campos de dirección.
- Geocodificación — spec W-027, no cambia.
- Ajustar `Venue.address`/`ciudad`/`comuna` en `VenuesContext.tsx` — siguen existiendo como
  caché de la activa, igual que en `venues.js` de la web (el trigger de W-062 los sigue
  sincronizando); `mapVenueFromDB`/`mapVenueToDB` de `VenuesContext.tsx` no cambian.

## Verificación pendiente (mismo patrón que V16/V17 de `sonopolisWeb/specs/W-PENDIENTES.md`)

Agregar al inventario de verificación manual de AppAll cuando se implemente: con sesión
`local` real en el celular, agregar hasta 3 direcciones, confirmar que la 4ta se rechaza
con el mensaje del trigger, activar una distinta y confirmar que `/locales/[id]` en la web
la refleja, borrar la no-activa, confirmar que borrar la activa no se puede intentar.

## Criterios de aceptación

- [ ] Los 3 `TextInput` de dirección salen de `EditarLocalScreen.tsx` en modo edición,
      reemplazados por `GestionDireccionesLocal`.
- [ ] Modo creación conserva los 3 campos sueltos y llama a `crearDireccion()` después de
      `createVenue()` — nunca escribe `address`/`ciudad`/`comuna` directo en el `insert`.
- [ ] `GestionDireccionesLocal` no tiene botón de borrar en la fila activa.
- [ ] `npx tsc --noEmit` sin errores nuevos.

> Estado: diseñado, no implementado (2026-09-01).
