# Spec 156 — «Avisar por WhatsApp» en el detalle del evento y opt-in de WhatsApp en la app

> Estado: propuesto (19-oct-2026)
> Capa: FRONTEND. `src/components/OptInWhatsApp.tsx` (nuevo), `src/components/AvisarWhatsApp.tsx` (nuevo), `src/screens/DetalleEventoScreen.tsx`, `src/screens/DetalleLocalScreen.tsx`, `src/screens/VerMusicoScreen.tsx`.
> Depende de: spec 148, spec 149, spec 155
> Hermano en la web: `components/OptInWhatsApp.js` (W-053, W-104), `app/(marketing)/cartelera/[id]/BotonAvisarWhatsApp.js` (W-054, W-108), `app/(marketing)/cartelera/[id]/BotonComprar.js:80-133`.

> **En una frase:** el owner de un evento con Pro avisa por WhatsApp a su público desde el
> panel de gestión del detalle, eligiendo el segmento con su conteo; y cualquiera puede
> pedir los avisos de un local o un músico desde su ficha pública y al comprar una entrada,
> como en la web.

## Contexto

**El aviso.** En la ficha web, el owner de un evento no cancelado con tenant identificable
ve «Avisar por WhatsApp» si el tenant tiene Pro, y un enlace al panel si no lo tiene
(`cartelera/[id]/page.js:431-450`). El botón abre un modal con los tres segmentos y su
conteo, porque el envío se cobra por mensaje y hay que ver a cuántos le llega antes de
confirmar (W-108); ya avisado, queda «Avisado el …» deshabilitado, porque la idempotencia
es por evento (W-107). Mientras Kapso espera la aprobación de Meta, la ruta responde `503`
con un texto que lo explica (W-185).

**El opt-in.** La web lo ofrece en tres lugares:

- ficha pública del local, debajo del nombre (`locales/[id]/page.js:50-52`);
- ficha pública del músico (`musicos/[id]/page.js:54-56`);
- bloque de compra, como casilla dentro de la compra (`BotonComprar.js:80-107`), que se
  dispara sin `await` al comprar (`:118-133`): la compra no puede depender del opt-in.

Se muestra aunque el tenant no tenga Pro: el gate de Pro decide quién puede *mandar*, no
quién puede *recibir*; así el día que un local activa Pro ya tiene a quién avisarle
(W-053).

**Qué pantallas de la app son esas.** La ficha pública del local es `DetalleLocalScreen`
(spec 127; montada en `CarteleraStack` y `LocalesStack`). La del músico es `VerMusicoScreen`
(spec 122; en `LocalesStack` y `MiLocalStack`). La compra está en `DetalleEventoScreen`
(`handleComprarLogueado`, `:214-270`), y el panel «Gestión del evento» en el mismo archivo
(`:439-495`).

Toda la lógica está en el spec 149 (`useTenantDelEvento`, `useAvisoWhatsApp`,
`useOptInWhatsApp`, `useTelefonoPropio`, `dispararOptInDeCompra`).

**Orden con otros specs:** el 157 (Redes) y el 160 (Flow) editan `DetalleEventoScreen`
después de este y dependen de él. Por eso los cambios en ese archivo se limitan a lo que
se describe abajo y lo visual va en dos componentes nuevos.

## Diseño

### `src/components/OptInWhatsApp.tsx` (nuevo)

Un solo componente con dos modos, como la web: dos componentes que dibujan lo mismo
terminan con la normalización o el texto divergiendo.

```ts
interface Props {
  tenantTipo: TipoTenant;
  tenantId: string;
  telefonoInicial?: string;
  etiqueta?: string;                                   // por defecto «Avísame por WhatsApp de sus próximos eventos»
  valor?: { acepta: boolean; telefono: string };       // modo controlado (compra)
  onCambiar?: (v: { acepta: boolean; telefono: string }) => void;
}
```

- Fila con un `Switch` (apagado por defecto: encendido por defecto es un opt-out
  disfrazado y Meta lo trata como spam, W-104) y la etiqueta.
- `TextInput` de teléfono con `keyboardType="phone-pad"` y placeholder «+56 9 1234 5678».
- **Controlado** (`onCambiar` presente): el teléfono solo aparece con el `Switch`
  encendido (en la compra, un campo de más es un motivo más para no comprar); no hay
  botón ni llamada propia.
- **No controlado** (fichas públicas): el teléfono siempre visible y un botón «Confirmar»
  (borde `colors.accent`). Al tocarlo:
  - `Switch` apagado → `Text` rojo «Activa el aviso para recibir los WhatsApp.»;
  - si no, `guardar({ tenantTipo, tenantId, telefono })` de `useOptInWhatsApp`; mientras
    guarda, el botón deshabilitado;
  - `ok` → el bloque se reemplaza por «✓ Listo — te vamos a avisar por WhatsApp de sus
    próximos eventos.» en `colors.success`;
  - error → `Text` rojo con `mensaje` («Ese número no parece válido», o el de la RPC).
    Nada de `Alert.alert` (spec 137).
- `telefonoInicial` llega async (`useTelefonoPropio`): se adopta mientras el campo siga
  vacío; si la persona ya escribió, no se pisa.

### `src/components/AvisarWhatsApp.tsx` (nuevo)

Props `{ eventoId: string; tenant: TenantCrm }`. Llama
`useAvisoWhatsApp({ eventoId, tenant, habilitado: true })`: la pantalla solo lo monta para
el owner con evento no cancelado, así que el componente no repite esa condición.

- **Sin Pro** (`!tienePro`): un `Text` en `colors.secondary`, «Avisar por WhatsApp a tu
  público es parte de Sonópolis Pro.». Sin enlace ni botón: la web enlaza al panel donde se
  vende Pro, y la app no vende Pro (spec 154).
- **Ya avisado** (`ultimoEnvioAt`): botón deshabilitado «💬 Avisado el {fecha}», fecha con
  `formatearFechaEs(separarFechaHora(ultimoEnvioAt).fechaISO)`.
- **Si no:** botón «💬 Avisar por WhatsApp» con el estilo de `botonGestion`, deshabilitado
  mientras `cargando`. Abre un `Modal` de React Native (`transparent`,
  `animationType="fade"`; react-native-web lo dibuja en el build web):
  - Título «Avisar por WhatsApp» y «Se manda un WhatsApp con el aviso del evento. No se
    puede deshacer.».
  - Los tres `SEGMENTOS_BROADCAST` como opciones de radio (círculo lleno el elegido), con
    su etiqueta y su conteo a la derecha; un segmento en 0 se ve atenuado y no se puede
    elegir (ver «los que ya me compraron: 0» es información, W-104). Inicial: `todos`.
  - «Cancelar» y «Enviar a {n} persona(s)» (deshabilitado con `n === 0` o enviando;
    «Enviando…» mientras tanto).
  - Al enviar, según `ResultadoAviso`:
    - `enviado` → cierra el modal; debajo del botón, en `colors.success`, «Aviso mandado a
      {n} persona(s).» o, con 0, «Todavía nadie de ese grupo aceptó recibir WhatsApp.»; el
      botón pasa a «Avisado el …» (el hook ya actualizó `ultimoEnvioAt`).
    - `no_conectado` → cierra el modal y muestra el `mensaje` del servidor debajo del
      botón en `colors.secondary`, no en rojo: no es un error de quien usa la app, y el
      botón sigue disponible para cuando Kapso esté activo.
    - `error` → `Text` rojo dentro del modal; el modal sigue abierto.

### `DetalleEventoScreen.tsx`

Hooks nuevos, **antes del `return` de «Evento no encontrado»** (spec 120: un hook después
de un return cambia el número de hooks entre renders):

```ts
const hayCompra = !!user && (evento?.monto ?? 0) > 0 && !enVivo.cancelado;
const { tenant: tenantEvento } = useTenantDelEvento(
  evento && (permisos.rol === 'owner' || hayCompra) ? evento : null
);
const telefonoPropio = useTelefonoPropio();
const [optIn, setOptIn] = useState({ acepta: false, telefono: '' });
```

- `useTenantDelEvento` recibe `null` si nadie lo necesita, igual que la web solo lo
  resuelve para el owner o cuando hay una compra posible (`page.js:172-179`): se ahorran
  hasta tres consultas en cada detalle que abre un fan sin sesión.
- Un `useEffect` copia `telefonoPropio` a `optIn.telefono` mientras esté vacío.

**Opt-in en la compra:** dentro de la tarjeta principal, entre `<PrecioEvento>` y el botón
«Comprar entrada», si `hayCompra && tenantEvento && !ventaCerrada`:

```tsx
<OptInWhatsApp
  tenantTipo={tenantEvento.tipo}
  tenantId={tenantEvento.id}
  etiqueta={`Avísame por WhatsApp de los próximos eventos de ${tenantEvento.nombre}`}
  valor={optIn}
  onCambiar={setOptIn}
/>
```

En `handleComprarLogueado`, después del chequeo de `monto` y antes de `setStep('comprando')`:

```ts
if (hayCompra && tenantEvento && optIn.acepta) {
  dispararOptInDeCompra({
    tenantTipo: tenantEvento.tipo, tenantId: tenantEvento.id, telefono: optIn.telefono,
    userId: user?.id, email: user?.email ?? undefined,
  });
}
```

Sin `await`, como la web: un número mal escrito o una RPC caída no pueden frenar una venta.
La auto-compra del enlace mágico pasa por la misma función con `optIn.acepta` en `false`,
así que no dispara nada que la persona no haya marcado.

**Aviso del owner:** dentro de la tarjeta «Gestión del evento», debajo de la fila de
botones y antes de `errorGestion`:

```tsx
{permisos.rol === 'owner' && !cancelado && tenantEvento && (
  <AvisarWhatsApp eventoId={evento.id} tenant={tenantEvento} />
)}
```

### `DetalleLocalScreen.tsx`

`const telefonoPropio = useTelefonoPropio();` antes de los `return` de carga y de «No
encontramos este local». Debajo de la `cabecera` (nombre y «Seguir»), antes de «Dónde»:
`<OptInWhatsApp tenantTipo="venue" tenantId={venue.id} telefonoInicial={telefonoPropio} />`.
Para todos, con o sin sesión y con o sin Pro del local, como la web (la RPC está abierta
a `anon`).

### `VerMusicoScreen.tsx`

`useTelefonoPropio()` antes de los `return` tempranos. Dentro de la primera tarjeta,
debajo de la línea de tipo · ciudad · país:
`<OptInWhatsApp tenantTipo="musician" tenantId={musico.id} telefonoInicial={telefonoPropio} />`.
Mismas reglas que el local.

## Criterios de aceptación

1. `npx tsc --noEmit 2>&1 | grep -v "supabase/functions"` sin salida.
2. `npx expo export --platform web --output-dir <carpeta temporal>` sin error.
3. Sin sesión, en la ficha de un local: encender el aviso, escribir `9 1234 5678` y
   «Confirmar» deja en `whatsapp_opt_ins` una fila del local con `+56912345678`,
   `source = 'perfil'` y `revoked_at` nulo, y la ficha muestra «✓ Listo…». Con «123» sale
   «Ese número no parece válido» en rojo y no hay fila nueva.
4. Lo mismo en la ficha de un músico, con `tenant_type = 'musician'`.
5. Con sesión y teléfono en el perfil, el campo aparece prellenado y el `Switch` apagado.
6. Comprar con el aviso encendido deja la fila con `source = 'checkout'`, `user_id` y
   `email` de quien compra, aunque el pago se abandone; con el aviso apagado no se escribe
   nada; con un número inválido la compra sigue igual.
7. El owner de un evento cuyo tenant no tiene Pro ve «Avisar por WhatsApp a tu público es
   parte de Sonópolis Pro.» sin nada que tocar; un `admin` o `editor` del evento no ve
   ninguna de las dos cosas.
8. Con Pro y Kapso sin conectar: el modal muestra los tres segmentos con los mismos
   números que la web; «Enviar» cierra el modal y muestra el aviso de Meta en gris, sin
   fila nueva en `whatsapp_broadcasts`.
9. Con Pro y Kapso conectado (cuando lo esté): enviar a «Todos» muestra «Aviso mandado a N
   personas.» y el botón pasa a «Avisado el {fecha}»; reabrir el detalle lo muestra igual.
10. Un evento cancelado no muestra el aviso ni el opt-in de compra.

## Fuera de alcance

- «Publicar en redes» en el detalle: spec 157 (Redes).
- Pago por Flow u otra pasarela en el detalle: spec 160 (Flow), que también pondrá el
  opt-in junto a su botón si lo necesita.
- Darse de baja de los WhatsApp desde la app (es `STOP` por WhatsApp, W-051).
- El texto del mensaje: es un template aprobado por Meta (W-051), no se redacta.
- Esconder el opt-in en la ficha propia (la web tampoco lo esconde).

## Verificación manual

- **V-candidata 156-a:** en un iPhone y un Android, con un local de prueba: pedir el aviso
  desde su ficha con un número propio, comprar una entrada de prueba con el aviso
  encendido y, como owner con Pro, abrir el modal y confirmar que los conteos coinciden
  con `sonopolis.org/cartelera/<id>`. Con Kapso activo, confirmar que el WhatsApp llega.
