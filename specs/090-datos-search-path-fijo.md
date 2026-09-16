# Spec 090 — `search_path` fijo en las 7 funciones que quedaron sin él

> Estado: **propuesto** (16-sep-2026)
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_090_search_path_fijo.sql`
> Depende de: spec 089 (entorno local para verificar antes de aplicar).
> Origen: Security Advisor de Supabase, 16-sep-2026 — regla `function_search_path_mutable`.

> **En una frase:** siete funciones se crearon sin `SET search_path`, así que resuelven los
> nombres de tabla con el `search_path` que traiga quien las llame; este spec se lo fija en la
> definición, sin tocar una sola línea de sus cuerpos.

## El problema

`search_path` es la lista de esquemas donde Postgres busca un nombre sin calificar: si una
función dice `FROM tickets` y el `search_path` es `mi_esquema, public`, gana
`mi_esquema.tickets` si existe. Quien controle el `search_path` de la sesión —o pueda crear
objetos en un esquema que aparezca antes que `public`— decide qué tabla lee realmente la
función.

El Advisor marca siete, y son exactamente estas (verificadas contra `supabase/migrations/`,
no contra el panel):

| Función | Tipo | Nació en |
|---|---|---|
| `public.activar_direccion_venue(uuid)` | RPC, `security invoker` | `20260901140000_spec_w062_venue_addresses.sql` |
| `public.limitar_direcciones_venue()` | trigger | ídem |
| `public.sync_venue_address_activa()` | trigger | ídem |
| `public.booking_requests_set_responded_at()` | trigger | `20260820183953_spec_051_...` |
| `public.events_block_delete_with_tickets()` | trigger | `20260810080442_spec_033_...` |
| `public.ticket_items_guard()` | trigger | `20260811013847_spec_036_...` |
| `public.ticket_reserva_ttl()` | `sql immutable` | `20260916203000_spec_088_...` |

**Ninguna de las siete es `SECURITY DEFINER`** — todas corren con los privilegios de quien las
llama. Eso baja el riesgo real bastante por debajo de lo que sugiere un renglón rojo en el
panel: secuestrar el `search_path` de una función `invoker` le da al atacante los permisos que
ya tenía. Para que fuera explotable de verdad haría falta además poder crear objetos en un
esquema del `search_path`, y en Postgres 15+ el `CREATE` sobre `public` está revocado a
`PUBLIC` por defecto, que es lo que corre en producción (17.6.1.127).

Entonces por qué arreglarlo igual, y de primero:

1. **Es gratis y es definitivo.** Siete `ALTER FUNCTION`, sin tocar cuerpos ni firmas, sin
   ventana de riesgo. Nada puede romperse: fijar el `search_path` al esquema donde ya viven
   todas las tablas no cambia ninguna resolución de nombre que hoy funcione.
2. **Desatasca la lectura del panel.** Siete de los 57 warnings son estos. Mientras estén, el
   Advisor es una lista larga que nadie lee, y los dos hallazgos que sí importan —el bucket
   listable (092) y el `PUBLIC` que ejecuta funciones `SECURITY DEFINER` (093)— quedan
   sepultados entre ruido.
3. **Es la red que atrapa el error del futuro.** Hoy son `invoker`. Si mañana un spec necesita
   que `ticket_items_guard()` pase a `SECURITY DEFINER` —tentador en un trigger que valida—
   el agujero nace ese día y nadie lo relaciona con esto. Fijar el `search_path` ahora hace
   que ese cambio futuro sea seguro por construcción.

## Decisión 1 — `ALTER FUNCTION`, no `CREATE OR REPLACE`

Un `CREATE OR REPLACE` obliga a copiar el cuerpo entero de las siete funciones al archivo de
migración, y ahí es donde se cuela un error de transcripción en código que hoy funciona:
`ticket_items_guard()` y `events_block_delete_with_tickets()` son guardas de integridad —
reescribirlas para cambiar una cláusula de cabecera es riesgo puro sin beneficio.

`ALTER FUNCTION ... SET search_path` cambia **solo** el atributo de configuración y deja el
cuerpo intacto:

```sql
ALTER FUNCTION public.activar_direccion_venue(uuid)        SET search_path = public, pg_temp;
ALTER FUNCTION public.limitar_direcciones_venue()          SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_venue_address_activa()          SET search_path = public, pg_temp;
ALTER FUNCTION public.booking_requests_set_responded_at()  SET search_path = public, pg_temp;
ALTER FUNCTION public.events_block_delete_with_tickets()   SET search_path = public, pg_temp;
ALTER FUNCTION public.ticket_items_guard()                 SET search_path = public, pg_temp;
ALTER FUNCTION public.ticket_reserva_ttl()                 SET search_path = public, pg_temp;
```

El costo de esta decisión: el archivo de la migración ya no muestra el cuerpo, así que quien
lea la cadena dentro de un año no ve qué hacen estas funciones mirando este spec. Aceptable —
cada una tiene su spec de origen listado en la tabla de arriba.

## Decisión 2 — `public, pg_temp`, y `pg_temp` va al final

`pg_temp` es el esquema de tablas temporales de cada sesión, y Postgres lo busca **primero**
si no se lo nombra explícitamente. Nombrarlo al final lo empuja al último lugar: una tabla
temporal llamada `tickets`, que cualquier sesión puede crear, deja de poder interponerse.

Se usa `public, pg_temp` y no `''` (el `search_path` vacío, que obliga a calificar todo)
porque los cuerpos existentes escriben `tickets`, `venues`, `events` sin prefijo: con
`search_path = ''` las siete funciones dejarían de resolver y el `ALTER` de la decisión 1
—que no toca cuerpos— pasaría de ser inofensivo a romper la app entera.

`public, pg_temp` es además lo que ya usa el resto del repo: `crear_optin_whatsapp` (W-103)
lo fija así, y las funciones del spec 033 usan `public` a secas. Este spec no unifica las que
ya tienen algo puesto — cambiar un `search_path = public` que funciona por `public, pg_temp`
es una mejora marginal que ensucia el diff sin cerrar ningún warning.

## Lo que este spec no toca

- **Las 31 funciones `SECURITY DEFINER`** que sí tienen `search_path` fijo. Ya están bien.
- **Quién puede ejecutar qué.** Ese es el spec 093, y es el que puede romper cosas.
- **Los cuerpos de las funciones.** Cero cambios de comportamiento; si algo cambia de
  comportamiento al aplicar esto, es un bug del spec, no un efecto esperado.

## Criterios de cierre

1. Contra la base local del spec 089, después de `db reset` + esta migración:
   ```sql
   SELECT p.proname, p.proconfig
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proconfig IS NULL;
   ```
   no devuelve ninguna de las siete.
2. `supabase db lint --level warning` local: los siete `function_search_path_mutable`
   desaparecen, y **ningún otro warning aparece o cambia** (el conteo baja exactamente en 7).
3. `pg_get_functiondef()` de las siete muestra el mismo cuerpo que antes de la migración —
   comparado byte a byte contra el dump previo.
4. Con la base local: crear una dirección de venue, activarla, y borrar un evento con tickets
   (debe seguir fallando por la guarda). Los triggers siguen disparando igual.
5. En producción, después de aplicar: el Security Advisor baja de 57 a 50 warnings.
