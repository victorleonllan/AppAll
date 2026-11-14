# Spec 183 — La app sabe quitar los teléfonos de la lista de contactos de quien no tiene Pro

> Estado: aplicado (14-nov-2026) — `npx tsc --noEmit` sin errores fuera de `supabase/functions` (criterio 1); el commit toca solo el hook y el cierre (criterio 2); `ocultarWhatsapp` devuelve objetos nuevos con `telefono: null` (criterio 3, por lectura)
> Capa: LÓGICA. `src/hooks/useContactosCrm.ts`.
> Depende de: spec 149 (`useContactosCrm`, `ContactoCrm`). Sin migración ni Edge Functions.
> Alimenta: spec 184 (FRONTEND).
> Hermano en la web: `libs/privacidad.js` → `ocultarWhatsapp` (W-276).

> **En una frase:** una función pura, `ocultarWhatsapp`, devuelve la lista de contactos sin
> números de teléfono, para que la pantalla de quien no tiene Sonópolis Pro no los muestre.

## Motivo

Pedido de Victor (14-nov-2026): «necesito que el crm se divida, la parte para crear correos
deberia ser free, osea que cualquiera pueda tener acceso al crm y poder mandar correos. lo de
gestion de mensajes de whatsapp deberia ser con pro, lo de redes sociales tambien.»

La lista de contactos pasa a verla cualquier local o banda (spec 184). Ver el número de
WhatsApp es parte de WhatsApp, y WhatsApp sigue siendo Pro: sin Pro se muestra que la persona
dejó su WhatsApp, no el número.

## Decisión

En `src/hooks/useContactosCrm.ts`, exportada junto a `resumirContactos`:

```ts
/**
 * Spec 183 — sin Sonópolis Pro la pantalla no muestra el número de WhatsApp. Se conserva
 * `aceptaWhatsapp` para decir «dejó su WhatsApp» y para el filtro y el conteo.
 * Port de `ocultarWhatsapp` (`sonopolisWeb/libs/privacidad.js`, W-276).
 */
export function ocultarWhatsapp(contactos: ContactoCrm[]): ContactoCrm[] {
  return contactos.map((c) => ({ ...c, telefono: null }));
}
```

Pura: no decide quién tiene Pro (lo decide la pantalla con `esPro`, spec 184) ni modifica el
arreglo que recibe. `resumirContactos`, `filtrarContactos` y `agruparContactos` no cambian:
usan `aceptaWhatsapp` y `origenes`.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio fuera de `supabase/functions` (igual que los specs 164-182).
2. `git diff --stat` del commit toca solo `src/hooks/useContactosCrm.ts` y los archivos del
   cierre del spec.
3. Lectura del código: la función devuelve objetos nuevos con `telefono: null` y el resto de
   los campos iguales.

## Abierto

- El teléfono llega igual al dispositivo: la app lee `crm_contactos` con la sesión del dueño.
  Esto lo saca de la pantalla, no de la respuesta. Cerrarlo de verdad exige cambiar la vista
  (DATOS). Es el mismo nivel de gate que tenía la lista completa hasta hoy (spec 155: «el gate
  es de producto»).
