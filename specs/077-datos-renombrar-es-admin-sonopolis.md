# Spec 077 — `es_admin()` pasa a llamarse `es_admin_sonopolis()`

> Estado: escrito (4-sep-2026), sin aplicar
> Capa: DATOS. Renombra una función del spec 074, ya aplicado. No cambia ningún permiso.
>
> **En una frase:** hoy la palabra "admin" nombra dos cosas distintas —el dueño de Sonópolis
> y un co-organizador de un evento cualquiera— y la función que decide la primera se llama
> `es_admin()`, que no dice de qué es admin.

## Motivo

Sonópolis tiene dos jerarquías que no se tocan:

| | Dónde vive | Qué autoriza |
|---|---|---|
| Admin de **la plataforma** | `platform_admins` (spec 074) | Marcar un pago como transferido |
| `owner`/`admin`/`editor` de **un evento** | `event_collaborators` (spec 033) | Editar ese evento, manejar su equipo |

Un `admin` de `event_collaborators` no tiene absolutamente ningún poder de plataforma. Pero
las dos cosas se dicen igual, y **la función que resuelve la primera se llama `es_admin()`
a secas**: quien abra una policy dentro de seis meses tiene que ir a leer la tabla para
saber cuál de los dos ámbitos está mirando.

`event_role_of(evento)` sí lleva su ámbito en el nombre. `es_admin()` no. Esta es la
asimetría que se corrige.

**Por qué se renombra el de plataforma y no el del evento.** El de plataforma se toca en un
solo lugar de SQL y en ningún archivo de la app (`libs/admin.js` de sonopolisWeb consulta la
tabla `platform_admins` directo, nunca por RPC). Renombrar el valor `'admin'` de
`event_collaborators.role` sería tocar una columna con datos, RLS y frontend — y este
proyecto acaba de vivir en el spec 076 lo que cuesta un rename de vocabulario mal barrido
(`'cafe'` → `'local'` sobreviviendo dentro de `search_collaborator_candidates` por seis
semanas). El ruido en el nombre del rol de evento se resuelve en la etiqueta que se muestra
(spec W-090 de sonopolisWeb), sin tocar el dato.

## Qué cambia

`public.es_admin(uuid)` → `public.es_admin_sonopolis(uuid)`. Misma firma, mismo cuerpo,
mismo `SECURITY DEFINER`, mismo default `auth.uid()`.

**No se usa `ALTER FUNCTION … RENAME`.** El rename sigue las referencias de las policies
(guardan el OID de la función, no su nombre) pero **no** las de adentro de un cuerpo
`plpgsql`, que para Postgres es texto y se resuelve por nombre recién al ejecutarse. Un
rename dejaría las dos funciones plpgsql llamando a un nombre inexistente, y el error no
aparecería hasta que alguien intente marcar un pago. Por eso: crear la nueva, reescribir
todo lo que la llama, y recién entonces borrar la vieja.

### La superficie completa de `es_admin()`

Cuatro objetos, ninguno más (verificado por grep sobre las migraciones 074 y 075, y sobre
los dos repos):

| Objeto | Dónde se definió por última vez | Cómo la referencia |
|---|---|---|
| policy `event_payouts_select_admin` | spec 074 | expresión `USING` (por OID) |
| policy `event_payouts_update_admin` | spec 074 | expresión `USING`/`WITH CHECK` (por OID) |
| función `event_payouts_guard_estado()` | spec **075** | cuerpo plpgsql (por nombre) |
| función `marcar_pago_evento(uuid)` | spec **075** | cuerpo plpgsql (por nombre) |

Las dos funciones se recrean **desde su versión del spec 075**, no del 074 — el 075 las
superó y copiar la versión vieja sería revertir el reclamo de pago sin querer.

### Orden de la migración

1. `CREATE OR REPLACE FUNCTION public.es_admin_sonopolis(p_user uuid DEFAULT auth.uid())`
   con el cuerpo idéntico al del spec 074.
2. `DROP POLICY` + `CREATE POLICY` de las dos policies de `event_payouts`, ahora contra
   `public.es_admin_sonopolis()`. Hay que recrearlas aunque el OID las seguiría: mientras
   una policy apunte a la función vieja, el `DROP` del paso 4 no puede ejecutarse.
3. `CREATE OR REPLACE` de `event_payouts_guard_estado()` y `marcar_pago_evento(uuid)`,
   copiadas del spec 075 con la única diferencia del nombre de la función llamada.
4. `DROP FUNCTION public.es_admin(uuid);` **sin `IF EXISTS`.**

## Verificación

**El `DROP` del paso 4 es la mitad de la prueba, no todo.** Postgres registra la dependencia
de una policy sobre una función, así que si el paso 2 se olvidó de una, el `DROP` falla y la
migración entera se revierte — bien. Pero **no registra** la dependencia desde adentro de un
cuerpo plpgsql: si el paso 3 se olvidó de una función, el `DROP` pasa igual y el error
aparece recién cuando alguien intente marcar un pago en producción.

Por eso el paso 3 no se verifica con el `DROP` sino a mano, después de aplicar:

```sql
-- Debe devolver 0 filas. Es el único chequeo que cubre los cuerpos plpgsql.
SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosrc ~ '\mes_admin\s*\(';
```

Y después, con la sesión de un admin real: `SELECT public.es_admin_sonopolis();` devuelve
`true`, y marcar un pago de un evento en estado `reclamado` sigue funcionando.

## Lo que este spec NO hace

- **No toca `event_collaborators.role`.** Sus valores siguen siendo `owner`/`admin`/`editor`
  en la base. Lo que cambia es solo cómo se muestran (spec W-090 de sonopolisWeb).
- **No toca `libs/admin.js`** ni ningún archivo de sonopolisWeb: la función nunca se llamó
  por RPC desde la app.
- **No agrega ni quita a nadie de `platform_admins`**, ni cambia qué puede hacer un admin.
