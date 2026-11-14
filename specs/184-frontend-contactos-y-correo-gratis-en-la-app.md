# Spec 184 — Contactos y correo gratis en la app; WhatsApp sigue con Pro

> Estado: diseñado (14-nov-2026)
> Capa: FRONTEND. `src/screens/ContactosScreen.tsx`, `src/components/TarjetaPro.tsx`, `src/components/RedactarCorreo.tsx` (solo un comentario), `src/screens/AdminTenantScreen.tsx`.
> Depende de: spec 183 (`ocultarWhatsapp`), spec 155, spec 169, spec 173 (`useEstilos`, `useTema`). En la web: `sonopolisWeb` W-276 (sin él, `/api/crm/correo` responde 402 a quien no tiene Pro).
> Hermano en la web: `app/(private)/local/contactos/page.js`, `musico/contactos/page.js`, `components/TablaContactos.js` (W-277) y `components/CardSonopolisPro.js`, `admin/crm/[tipo]/[id]/page.js` (W-278).

> **En una frase:** la pantalla Contactos de la app muestra a todos el redactor de correo y la
> lista; sin Pro, en vez del número de WhatsApp dice «con Sonópolis Pro» y aparece la tarjeta
> de Pro, que ahora habla de WhatsApp y ya no de «ver a tu público».

## Motivo

Pedido de Victor (14-nov-2026): «la parte para crear correos deberia ser free, osea que
cualquiera pueda tener acceso al crm y poder mandar correos. lo de gestion de mensajes de
whatsapp deberia ser con pro, lo de redes sociales tambien.»

Hoy `ContactosScreen` corta en el paso «4. Sin Pro» y solo muestra «Tienes N personas en tu
público» y la tarjeta.

## Decisión

### `src/screens/ContactosScreen.tsx`

1. Se elimina el retorno temprano «4. Sin Pro» (el bloque `if (!esPro(tenant)) { … }`). La
   pantalla sigue para todos por la rama que hoy es «5. Con Pro».
2. `const pro = esPro(tenant);` y la lista que se muestra es
   `pro ? contactos : ocultarWhatsapp(contactos)` (importada de `../hooks/useContactosCrm`).
   El resumen (`resumirContactos`) se calcula de `contactos` original, para que «Con WhatsApp»
   cuente bien.
3. Encabezado de la lista, en este orden:
   - con `suscripcion`: la `TarjetaPro` de estado, como hoy (spec 169);
   - siempre: `<RedactarCorreo … />`;
   - **sin Pro**: `<TarjetaPro tenant={tenant} etiqueta={etiqueta} />` (la misma llamada que
     hoy está en la rama sin Pro), dentro de `styles.tarjetaPro`;
   - el resumen, el aviso, el buscador y los filtros, como hoy.
4. `TarjetaContacto` recibe `verWhatsapp: boolean` (= `pro`):

| Lugar | Hoy | Con `verWhatsapp = false` |
|---|---|---|
| Línea de WhatsApp | «WhatsApp: +569…» / «Sin WhatsApp» | `c.aceptaWhatsapp` → «WhatsApp: con Sonópolis Pro»; si no, «Sin WhatsApp» |
| Sin correo ni teléfono | «Seguidor sin datos de contacto» | si `c.aceptaWhatsapp` → «Dejó su WhatsApp» (mismo estilo `sinDatos`); si no, como hoy |

5. Placeholder del buscador: con Pro «Buscar por email o teléfono» (como hoy); sin Pro
   «Buscar por email».
6. El comentario de cabecera del archivo se actualiza citando este spec. Estilos nuevos, si
   hacen falta, con `useEstilos`/tokens de la paleta (spec 173): nada de hex.

### `src/components/TarjetaPro.tsx` — texto sin Pro

| Hoy | Nuevo |
|---|---|
| «Con Sonópolis Pro ves en un solo lugar a tu público: quienes compran entradas para {etiqueta}, quienes te siguen y quienes dejan su WhatsApp.» | «Tus contactos y los correos a tu público son gratis. Con Sonópolis Pro avisas a tu público por WhatsApp desde la ficha de cada evento y ves el número de quienes lo dejaron.» |

No se mencionan las redes: la app no sabe si están encendidas sin llamar a la web. Sigue sin
precio, sin botón de compra y sin mandar a pagar por fuera (spec 154/169). La línea «Tu cuenta
no tiene Sonópolis Pro activo.» y la rama con Pro no cambian. Si `etiqueta` queda sin uso en el
componente, la prop se conserva en `Props` (la pasan las pantallas).

### `src/components/RedactarCorreo.tsx`

Solo el comentario «Solo se monta con Pro: sin Pro `/api/crm/correo` responde 402.» → «Se monta
para cualquier tenant: `/api/crm/correo` ya no exige Pro (W-276 de la web).» Sin cambio de
código.

### `src/screens/AdminTenantScreen.tsx` — dos textos

| Hoy | Nuevo |
|---|---|
| con Pro: «{etiqueta} ve esta misma lista en su panel de contactos.» | «{etiqueta} ve esta misma lista en su panel de contactos y le escribe a su público por correo. Con Pro, además ve los números de WhatsApp, avisa por WhatsApp y publica en redes.» |
| sin Pro: «Sin Pro: {etiqueta} solo ve el conteo (N personas) y la invitación a Pro.» | «{etiqueta} ve esta misma lista en su panel de contactos y le escribe a su público por correo. Sin Pro no ve los números de WhatsApp (aquí sí se muestran), no avisa por WhatsApp ni publica en redes.» |
| «**Vista de admin:** así ve {nombre} su CRM con Pro. Desde aquí no se envía nada.» | «**Vista de admin:** así ve {nombre} su CRM. Desde aquí no se envía nada.» |

Si `n` (el conteo) queda sin uso, se quita su cálculo.

### Lo que NO cambia

- `RedesScreen`, `PublicarRedesScreen` y `DetalleEventoScreen`: redes y el aviso por WhatsApp
  siguen exigiendo `esPro`.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions`.
2. `npx expo export --platform web` termina sin errores (como el criterio 2 del spec 169).
3. `grep -rn "en tu público\.\|solo ve el conteo\|su CRM con Pro\|ves en un solo lugar a tu público" src`
   no devuelve nada.
4. `grep -n "esPro" src/screens/RedesScreen.tsx src/screens/PublicarRedesScreen.tsx src/screens/DetalleEventoScreen.tsx`
   devuelve las mismas líneas que antes del spec (no se tocaron).
5. Ningún hex nuevo en los archivos tocados (`git diff` sin `#[0-9a-fA-F]{3,6}` agregado).

## Pendiente en dispositivo (V-candidatas, anotar en `PENDIENTES.md`)

- Cuenta **sin Pro**: se ve el redactor, la lista con «WhatsApp: con Sonópolis Pro» y la
  tarjeta; un envío de correo real llega (requiere W-276 desplegado en la web).
- Cuenta **con Pro**: la pantalla se ve igual que antes de este spec.
