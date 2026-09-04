# Spec 078 — El admin de Sonópolis entra a cualquier evento sin que lo inviten

> Estado: aplicado (4-sep-2026) — `supabase db push` verde; **falta verificarlo con la sesión real del admin** (ver Verificación)
> Capa: DATOS. Modifica dos funciones del spec 033, ya aplicado.
> **Depende del spec 077** (`es_admin()` → `es_admin_sonopolis()`): usa el nombre nuevo, así
> que se aplica después. Los dos son DATOS contra la misma base: van uno detrás del otro,
> nunca en terminales paralelas.
>
> **En una frase:** hoy el dueño de la plataforma no puede ver ni tocar un evento salvo que
> alguien lo sume al equipo de ese evento, una fila a la vez.

## Motivo

`platform_admins` (spec 074) nació para una sola cosa: marcar un pago como transferido. Todo
lo demás del evento —ver el borrador, corregir un dato mal cargado, mirar las entradas
vendidas— sigue exigiendo una fila en `event_collaborators`.

Eso significa que para arreglar el nombre mal escrito de un evento, Victor tiene que pedirle
al organizador que lo invite. Es soporte que no escala y, cuando el organizador es
justamente quien no responde, es soporte imposible.

**El acceso del operador de la plataforma es una propiedad de la plataforma, no un favor del
organizador.**

## Qué cambia

Dos funciones del spec 033, una línea cada una:

```sql
-- Cualquier miembro del equipo edita — y el admin de Sonópolis, sin ser miembro.
CREATE OR REPLACE FUNCTION public.can_edit_event(p_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.es_admin_sonopolis() OR public.event_role_of(p_event) IS NOT NULL;
$$;

-- owner y admin gestionan el equipo — y el admin de Sonópolis.
CREATE OR REPLACE FUNCTION public.can_manage_team(p_event uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.es_admin_sonopolis() OR public.event_role_of(p_event) IN ('owner','admin');
$$;
```

**Se toca la función y no las policies.** Las dos son el cuello por el que ya pasan **13
policies** (verificado por grep sobre las migraciones): `events` (ver borradores, UPDATE),
`tickets` (spec 038), `event_collaborators`, `event_collaborator_invites` (spec 052) y las
preventas (spec 064). Agregar `OR es_admin_sonopolis()` policy por policy sería trece
lugares donde el próximo spec puede olvidarse de uno — que es exactamente cómo `'cafe'`
sobrevivió al spec 046.

**El frontend no cambia.** `getPermisosEvento` (`libs/data/colaboradores.js:33`) resuelve
`puedeEditar` llamando `can_edit_event` por RPC, así que las cinco pantallas privadas del
evento —editar, entradas, equipo, escáner y la ficha de gestión— dejan pasar al admin en
cuanto la función cambia, sin tocar una línea de JS.

## Lo que deliberadamente NO hereda

### `event_role_of()` no se toca

Sigue devolviendo `NULL` para un admin que no es colaborador. **Es el punto entero del
diseño:** `event_role_of(evento) = 'owner'` es lo que gatea la cuenta bancaria (spec 073) y
el reclamo de pago (spec 075). Si el admin heredara `'owner'`, Victor podría reclamar el
pago *en nombre del organizador* y después marcárselo como hecho él mismo — las dos mitades
del control que el spec 075 fue a separar, en la misma persona.

El admin ya ve los datos de liquidación por la puerta correcta: las policies
`event_payouts_select_admin` / `_update_admin` del spec 074.

**Ser admin da acceso operativo al evento; no convierte a nadie en su organizador.**

### `can_delete_event()` no se toca

Borrar y cancelar quedan fuera. Cancelar un evento no es editarlo: es un estado público que
ve todo el que compró una entrada, y arrastra reembolsos. Que el operador de la plataforma
pueda cancelar el show de otro sin que nadie se lo pida es una decisión aparte de esta, y
Victor pidió ver y modificar, no borrar. Si algún día hace falta, es un spec propio.

Consecuencia concreta y buscada: el admin entra a `/eventos/<id>/editar` y corrige los
datos, pero el botón de cancelar no le aparece (`AccionesEvento.js:88` lo condiciona a
`rol === "owner"`) y la RLS tampoco lo dejaría.

### Nadie más entra

`es_admin_sonopolis()` lee `platform_admins`, una tabla sin ninguna policy de escritura
(spec 074): no se puede entrar ahí desde una sesión de usuario, solo por el editor SQL o la
service role. El alcance de este spec es exactamente el de esa tabla.

## Hueco conocido que este spec deja abierto

Con `rol = NULL`, el admin entra a `/eventos/<id>/equipo` pero **la pantalla se le muestra
vacía de acciones**: `PanelEquipo.js` condiciona invitar, quitar y ver invitaciones
pendientes a `soyOwner = miRol === "owner"` (líneas 210, 245, 336). Postgres ya lo autoriza
—`can_manage_team()` devuelve `true`—, pero la UI no le ofrece el botón.

Es la asimetría que ya existía entre esa pantalla y la RLS (la UI pide `owner`, la base pide
`can_manage_team`, que incluye `admin`); este spec solo la hace visible. **Se arregla en un
spec FRONTEND aparte**, no acá: es otra capa.

## Verificación

Con la sesión de un admin de Sonópolis que **no** sea colaborador del evento de prueba:

1. `SELECT public.can_edit_event('<evento>')` → `true`.
2. `SELECT public.event_role_of('<evento>')` → `NULL`. Si devuelve `'owner'`, algo se tocó
   de más y el reclamo de pago quedó comprometido.
3. `SELECT public.can_delete_event('<evento>')` → `false`.
4. Un `SELECT` sobre `events` devuelve también los `draft` ajenos.
5. `/eventos/<id>/editar` carga y guarda un cambio.
6. Con la sesión de un usuario **no** admin y no colaborador: los cinco pasos siguen dando
   `false` / vacío. El bypass es de `platform_admins`, no de todos.
