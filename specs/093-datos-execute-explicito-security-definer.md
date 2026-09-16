# Spec 093 — `PUBLIC` deja de ejecutar las funciones `SECURITY DEFINER`

> Estado: **propuesto** (16-sep-2026)
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_093_execute_explicito.sql`
> Depende de: spec 089 (entorno local — **este spec no se aplica a producción sin haberlo
> corrido antes en local**), y de los specs 090, 091 y 092 aplicados y cerrados, para que un
> fallo tenga una sola causa posible.
> Origen: Security Advisor de Supabase, 16-sep-2026 — regla `Public Can Execute SECURITY
> DEFINER Function`.

> **En una frase:** Postgres le da `EXECUTE` a `PUBLIC` sobre toda función nueva, así que 16
> funciones que corren con los privilegios de su dueño quedaron llamables por cualquiera con
> la anon key; este spec revoca ese permiso implícito y lo reemplaza por grants escritos uno
> por uno — y es el único de los cuatro que puede tumbar la app si se equivoca.

## El problema

`SECURITY DEFINER` significa que la función corre con los privilegios de quien la creó
(`postgres`), **saltándose RLS**. Es la herramienta correcta para las guardas de permiso: por
eso `can_edit_event()` puede consultar `event_collaborators` sin que el usuario tenga acceso
directo a esa tabla.

Postgres, al crear una función, otorga `EXECUTE` a `PUBLIC` — el pseudo-rol que contiene a
todos, `anon` incluido. Hay que revocarlo a mano, función por función. El repo lo viene
haciendo desde el spec 046, que descubrió el problema al aplicar:

> 046 — 2 bugs encontrados y corregidos al aplicar: […] `_reservar_ticket_shared`,
> `claim_guest_tickets` y `set_my_role` ejecutables por `anon`/`authenticated` de más (grant
> por defecto de Supabase, no por el `REVOKE FROM PUBLIC` del archivo).

Ese arreglo se aplicó de ahí en adelante, no hacia atrás. Hoy, contra
`supabase/migrations/`: **31 funciones `SECURITY DEFINER`, de las cuales 15 tienen su
`REVOKE … FROM PUBLIC` y 16 no**. Las 16:

| Grupo | Funciones | Qué debería poder llamarlas |
|---|---|---|
| **A. Cuerpos de trigger** | `events_claim_owner`, `events_guard_protected_columns`, `tickets_track_preventa_vendidos`, `claim_event_collaborator_invites` | Nadie. Las invoca el trigger, no un cliente |
| **B. Guardas de policy** | `can_edit_event`, `can_delete_event`, `can_manage_team`, `event_role_of`, `es_admin`, `es_admin_sonopolis`, `is_booking_party`, `is_booking_recipient` | `anon` y `authenticated` — ver decisión 2, es contraintuitivo |
| **C. RPC de usuario** | `transfer_event_ownership`, `monto_a_transferir`, `search_collaborator_candidates` | Solo `authenticated` |
| (D) `crear_optin_whatsapp` | ya tiene `grant … to anon, authenticated` explícito | sin cambios |

El grupo C es el que duele hoy. **`transfer_event_ownership(p_event, p_new_owner)` es
llamable por `anon`**: una función `SECURITY DEFINER` que cambia el dueño de un evento,
alcanzable por cualquiera con la anon key del bundle. Valida por dentro —por eso no hay un
incidente— pero la única barrera es su propio `BEGIN`, y esa no es una barrera de permisos:
es la ausencia de una.

## Decisión 1 — revocar solo sobre `prosecdef`, y de forma dinámica

Dos preguntas: sobre qué funciones, y con qué lista.

**Sobre qué funciones:** solo las `SECURITY DEFINER` (`pg_proc.prosecdef = true`). Revocar
`PUBLIC` de *todas* las funciones de `public` sería más prolijo y es tentador, pero arrastra
a `marcar_pago_evento`, `reclamar_pago_evento`, `activar_direccion_venue` y al resto de las
`invoker`, que no son el problema —una función `invoker` no puede hacer nada que quien la
llama no pudiera hacer solo— y multiplicaría por tres lo que puede romperse en una migración
que ya es la más riesgosa de las cuatro.

**Con qué lista:** un bloque dinámico sobre el catálogo, no los 16 nombres escritos a mano.
La razón no es la comodidad: mi inventario salió de leer `supabase/migrations/`, y lo que
manda es el estado real de la base. Si producción tiene una función que el repo no registra
—drift como el que ya aparecieron en los specs 045 y 086— el listado a mano la deja abierta y
nadie se entera. El catálogo no se equivoca.

```sql
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.sig);
  END LOOP;
END $$;
```

**`REVOKE … FROM PUBLIC` no toca los grants directos a un rol.** Es la propiedad que hace
segura a esta migración: las 15 funciones que specs anteriores ya arreglaron conservan su
`GRANT … TO anon, authenticated`, y este bloque no las afecta. Solo desaparece el permiso
implícito.

## Decisión 2 — las guardas de policy necesitan `EXECUTE` para `anon`, y eso no es una fuga

Acá está el hallazgo que decide si la cartelera sigue en pie. **27 policies** llaman a las
funciones del grupo B, y ninguna declara `to`, así que aplican a `PUBLIC` — `anon` incluido.
La que importa:

```sql
create policy events_select on public.events for select
  using ( … or public.can_edit_event(id) );   -- sin `to`
```

`public.events` es lo que lee la cartelera **sin sesión**. Si `anon` pierde `EXECUTE` sobre
`can_edit_event`, evaluar esa policy lanza `permission denied for function can_edit_event` y
la cartelera deja de cargar para todo visitante. No alcanza con confiar en que el `OR`
cortocircuite: el orden de evaluación de un `OR` lo elige el planner, no el texto de la
policy.

Por eso el grupo B se otorga a **`anon` y `authenticated`**, explícito:

```sql
GRANT EXECUTE ON FUNCTION
  public.can_edit_event(uuid), public.can_delete_event(uuid),
  public.can_manage_team(uuid), public.event_role_of(uuid),
  public.es_admin(), public.es_admin_sonopolis(),
  public.is_booking_party(uuid), public.is_booking_recipient(uuid)
TO anon, authenticated;
```

Que eso no reabra el agujero se sostiene en una propiedad de las ocho: **todas deciden a
partir de `auth.uid()`**, que para `anon` es `NULL`. Un `anon` que las llame recibe siempre
`false` (o `NULL` en `event_role_of`). No devuelven datos, devuelven un permiso que ese rol
nunca tiene. Llamarlas no le dice nada que no supiera.

La alternativa —agregar `to authenticated` a las 27 policies— cambia qué ve el público en
`events`, o sea cambia el producto para arreglar un permiso. Es un spec distinto y
probablemente innecesario.

## Decisión 3 — los cuerpos de trigger no se otorgan a nadie

El grupo A se queda sin ningún `GRANT`. Los triggers siguen disparando: Postgres ejecuta la
función del trigger con los privilegios del **dueño de la tabla**, no con los del rol que hizo
el `INSERT`, así que el permiso del cliente no interviene. Crear un evento seguirá reclamando
su `owner` vía `events_claim_owner()` con `EXECUTE` revocado a todos.

Es la parte del spec con más ganancia y menos riesgo: cuatro funciones `SECURITY DEFINER` que
escriben `event_collaborators` y `event_preventas.vendidos` dejan de ser alcanzables desde
afuera, y nada legítimo las llamaba.

## Decisión 4 — el grupo C, solo `authenticated`

```sql
GRANT EXECUTE ON FUNCTION
  public.transfer_event_ownership(uuid, uuid),
  public.monto_a_transferir(uuid),
  public.search_collaborator_candidates(text)
TO authenticated;
```

Las tres las llama `sonopolisWeb` (y la app llama `transfer_event_ownership` y
`search_collaborator_candidates`) desde pantallas que exigen sesión. Ninguna aparece en una
policy, así que sacarle el permiso a `anon` no puede afectar una lectura pública.

**Efecto colateral que conviene anticipar:** un `anon` que hoy llama a una de estas y recibe un
rechazo del propio cuerpo de la función, a partir de ahora recibe `permission denied for
function`. En `sonopolisWeb/libs/storage.js` el traductor de errores filtra por
`/row-level security|policy|permission/i` — el nuevo mensaje contiene "permission", así que
sigue cayendo en la rama correcta y el usuario ve el mismo texto que antes.

## Lo que este spec no toca

- **Las 15 funciones ya resueltas** por los specs 046 y posteriores.
- **Las funciones `SECURITY INVOKER`**, incluidas `marcar_pago_evento`, `reclamar_pago_evento`
  y `activar_direccion_venue`. Corren con los privilegios de quien llama: RLS las contiene.
- **Las policies.** Ni una sola se modifica. Este spec cambia `EXECUTE`, nada más.
- **El frontend.** Cero cambios esperados — y si hiciera falta uno, es señal de que la lista
  blanca quedó corta y hay que corregirla acá, no allá.

## El cuadro de los 57 warnings, y lo que falta saber

Contra el repo, los cuatro specs cubren: 7 (`search_path`, spec 090) + 1 (`RLS Policy Always
True`, spec 091) + 1 (`Public Bucket Allows Listing`, spec 092) + 16 (este) = **25 de los 57**
que muestra el panel. Los 32 restantes no se ven en la captura del 16-sep y no se pueden
deducir del repo.

Se resuelve en el spec 089, criterio 4: `supabase db lint --level warning --linked` imprime la
lista completa. Si aparece un tipo de warning que estos cuatro specs no contemplan, **es un
spec nuevo**, no un agregado a este. Anotarlo en PENDIENTES al correr el lint.

## Criterios de cierre

Los primeros cinco se verifican **en la base local del spec 089**, antes de tocar producción.

1. `SELECT p.oid::regprocedure, p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid =
   p.pronamespace WHERE n.nspname='public' AND p.prosecdef;` — ninguna fila incluye
   `=X/postgres` (el grant a `PUBLIC`) en su `proacl`.
2. **La cartelera pública carga.** Con la anon key local, `GET /rest/v1/events?select=*` sobre
   un evento publicado devuelve 200 y la fila. Es el criterio que decide si este spec sale o
   se revierte: si falla, la lista blanca del grupo B está incompleta.
3. Con la anon key, `POST /rest/v1/rpc/transfer_event_ownership` devuelve `permission denied
   for function` (`42501`). Antes de la migración, entraba al cuerpo de la función.
4. Con un JWT de `authenticated` local: crear un evento (dispara `events_claim_owner` y deja
   la fila en `event_collaborators`), buscar colaboradores con
   `search_collaborator_candidates`, y editar el evento propio. Los tres funcionan.
5. `supabase db lint --level warning` local: los `Public Can Execute SECURITY DEFINER
   Function` desaparecen y **no aparece ningún warning nuevo**.
6. Recién con 1-5 en verde, aplicar a producción y repetir 2 y 3 contra
   `xluinfihjjtxkglihxqz` con la anon key real.
7. Después de aplicar: recorrer a mano, con sesión, crear evento → subir flyer → publicar →
   comprar una entrada → canjear el QR. Es el camino que cruza la mayor cantidad de funciones
   tocadas, y ninguna prueba de catálogo lo reemplaza.
