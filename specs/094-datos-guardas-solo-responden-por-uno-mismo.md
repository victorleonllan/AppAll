# Spec 094 — Las guardas de permiso solo responden por uno mismo

> Estado: **propuesto** (17-sep-2026)
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_094_guardas_solo_por_uno_mismo.sql`
> Depende de: spec 089 (entorno local). **Bloquea al spec 093** — su decisión 2 otorga estas
> funciones a `anon` explícitamente, y no debe aplicarse antes que esto.
> Supera: la decisión 2 del spec 093 en la parte que justifica el grant a `anon` diciendo que
> las guardas "devuelven un permiso, no datos". Para cuatro de ellas eso es falso.

> **En una frase:** cuatro funciones `SECURITY DEFINER` aceptan el usuario como argumento en
> vez de mirar solo quién llama, así que cualquiera puede preguntar por el permiso **de otro** y
> obtener respuesta saltándose RLS; este spec les agrega una condición para que respondan
> únicamente por `auth.uid()`.

## El problema

Las cuatro guardas nacieron con un parámetro de usuario y `auth.uid()` como valor por defecto:

```sql
event_role_of(p_event uuid,   p_user uuid DEFAULT auth.uid())
is_booking_party(p_request uuid, p_user uuid DEFAULT auth.uid())
is_booking_recipient(p_request uuid, p_user uuid DEFAULT auth.uid())
es_admin_sonopolis(p_user uuid DEFAULT auth.uid())
```

Un default es una comodidad, no una restricción: pasando el segundo argumento se pisa. Y como
son `SECURITY DEFINER`, corren con los privilegios del dueño y **saltan RLS**, así que la
respuesta no pasa por ninguna de las policies que protegen `event_collaborators`,
`booking_requests` o `platform_admins`.

No es teórico. Ejecutado contra la base local del spec 089, con el rol `anon` —el de alguien
sin cuenta, con la llave que viaja en el bundle— y preguntando por un usuario ajeno:

```
SET LOCAL role TO anon;
SELECT public.event_role_of('<evento>', '<usuario ajeno>');
 rol_de_otro
-------------
 owner
```

Sin sesión, sin permisos, la base contesta quién es dueño de qué. Con los uuid a mano se
enumera el equipo completo de cualquier evento; `es_admin_sonopolis(<uuid>)` responde quién
administra la plataforma; las dos de `booking` dicen quién negocia con quién.

**Esto ya pasa hoy**, por el `EXECUTE` implícito de `PUBLIC` que el spec 093 viene a revocar.
El problema es que el 093, tal como está escrito, las otorgaría a `anon` **explícitamente** y
con una justificación que para estas cuatro no se sostiene: convertiría un descuido heredado en
una decisión firmada. Por eso este spec va antes.

## Decisión 1 — se filtra por `auth.uid()`, no se elimina el parámetro

Lo correcto de manual sería borrar el parámetro: si no existe, no hay nada que suplantar. Se
descartó por lo que cuesta, medido en la base local y no estimado:

**No se puede crear la versión de un argumento y convivir.** Postgres las trata como sobrecargas
y entonces toda llamada de un argumento —que es como llaman **todas** las policies— queda
ambigua:

```
ERROR: function public.event_role_of(uuid) is not unique
HINT:  Could not choose a best candidate function.
```

Es el mismo error que W-103 documentó al extender `crear_optin_whatsapp`. Acá sería peor: las
policies fallarían, o sea la app entera, en el instante en que la migración crea la función.

**Y no se puede borrar la vieja primero**, porque las policies dependen de ella:

```
ERROR: cannot drop function event_role_of(uuid,uuid) because other objects depend on it
DETAIL: policy ec_insert on table event_collaborators depends on function event_role_of(uuid,uuid)
        ... 7 policies en total
```

Sacar el parámetro obliga entonces a: borrar 7 policies, borrar la función, crearla, y recrear
las 7 idénticas. Multiplicado por las cuatro funciones son más de diez policies transcritas a
mano en una migración, cada una una oportunidad de equivocarse en un `USING` que decide quién
ve las liquidaciones de plata. Todo eso para borrar un argumento que ya nadie usa.

**La condición hace lo mismo sin tocar una sola policy:**

```sql
CREATE OR REPLACE FUNCTION public.event_role_of(p_event uuid, p_user uuid DEFAULT auth.uid())
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.event_collaborators
   WHERE event_id = p_event AND user_id = p_user
     AND p_user = auth.uid();   -- <- el spec entero es esta línea
$$;
```

La función sigue aceptando el argumento, pero solo contesta si coincide con quien llama. Para
`anon`, `auth.uid()` es `NULL`, y `NULL = <cualquier cosa>` es `NULL`, o sea falso: no contesta
nunca. Para un usuario con sesión que pregunta por otro, tampoco.

Verificado en local, la misma llamada de arriba:

```
 rol_de_otro
-------------
 (null)
```

Y el uso legítimo —un argumento, como lo hacen las policies y el RPC de
`libs/data/colaboradores.js`— sigue devolviendo `owner` para el dueño real.

**El costo, dicho claro:** queda un parámetro que solo puede tener un valor válido. Es deuda
cosmética y confunde a quien lea la firma dentro de un año, por eso el `AND` lleva comentario.
Eliminarlo de verdad es una limpieza aparte, sin urgencia de seguridad una vez aplicado esto —
va a PENDIENTES.

## Decisión 2 — las cuatro, en la misma migración

Es el mismo cambio de una línea repetido cuatro veces, sobre funciones con el mismo defecto y
el mismo origen. Partirlo en cuatro specs sería ceremonia sin información: ninguna decisión
cambia entre una y otra, y dejar tres oráculos abiertos mientras se cierra el primero no
protege nada.

```sql
-- es_admin_sonopolis: mismo filtro, dentro del EXISTS
SELECT EXISTS (
  SELECT 1 FROM public.platform_admins
   WHERE user_id = p_user AND p_user = auth.uid()
);
```

Las cuatro se reescriben con `CREATE OR REPLACE` **conservando firma, tipo de retorno,
volatilidad y `search_path`**: cualquier cambio ahí convierte esto en otra migración con otros
riesgos. Los cuerpos se copian de `pg_get_functiondef()` de la base local, no de las
migraciones originales, para que lo que se reescribe sea lo que realmente está corriendo.

## Qué pasa con el spec 093 después de esto

Su decisión 2 queda **cierta para las siete guardas**, no solo para tres: una vez que las cuatro
responden únicamente por `auth.uid()`, otorgarlas a `anon` sí devuelve "un permiso que ese rol
nunca tiene" y no datos de terceros. El 093 se aplica después, sin cambios en su SQL más allá
de las firmas que su addendum ya corrigió.

## Lo que este spec no toca

- **Las policies.** Ni una. Es la razón de existir de la decisión 1.
- **Los permisos de ejecución.** Nada de `GRANT` ni `REVOKE` acá — eso es el 093.
- **`can_edit_event`, `can_delete_event`, `can_manage_team`.** No tienen parámetro de usuario:
  ya responden solo por quien llama.
- **El frontend.** `libs/data/colaboradores.js` llama `event_role_of({ p_event })` con un solo
  argumento; sigue funcionando igual. Confirmado que no hay una sola llamada de dos argumentos
  en ninguno de los dos repos.

## Criterios de cierre

Todo contra la base local del spec 089, antes de producción.

1. Como `anon`, `event_role_of('<evento>','<usuario ajeno>')` devuelve `NULL` (antes: `owner`).
2. Como `authenticated` con el JWT del dueño, `event_role_of('<evento>')` sigue devolviendo
   `owner`. El uso legítimo no se rompió.
3. Como `authenticated`, preguntar por un tercero devuelve `NULL`: el filtro no es solo contra
   `anon`.
4. `es_admin_sonopolis('<uuid de un admin real>')` devuelve `false` para quien no es esa persona,
   y sigue devolviendo `true` para el admin preguntando por sí mismo.
5. Las cuatro conservan firma, retorno, `prosecdef` y `proconfig` idénticos a antes — comparado
   contra `pg_proc` antes y después.
6. El recorrido completo con sesión sigue en pie: crear evento, invitar colaborador, ver
   liquidaciones, responder una solicitud de bolo. Son las policies que llaman a estas cuatro.
7. Splinter no cambia: este spec no cierra ningún warning y no debe abrir ninguno. El número se
   mantiene en 49.
