# Spec 091 — El opt-in de WhatsApp deja de aceptar inserts directos del cliente

> Estado: **propuesto** (16-sep-2026)
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_091_optin_sin_insert_directo.sql`
> Depende de: spec 089 (entorno local). Toca una policy nacida en W-049 y el RPC de W-103,
> ninguno de los dos se modifica.
> Origen: Security Advisor de Supabase, 16-sep-2026 — regla `RLS Policy Always True` sobre
> `public.whatsapp_opt_ins`.

> **En una frase:** la tabla de consentimientos de WhatsApp acepta `INSERT` de cualquiera con
> la anon key —que es pública por definición— y esa puerta no la usa nadie desde que W-049
> movió el alta al RPC, así que se cierra.

## El problema

W-049 creó la tabla con esta policy, y el comentario del archivo explica por qué en su
momento tenía sentido:

```sql
-- El público opta sin cuenta: insert abierto a anon y authenticated.
create policy whatsapp_opt_ins_insert on whatsapp_opt_ins
  for insert
  to anon, authenticated
  with check (true);
```

Lo que cambió después: el **addendum de W-049** (29-ago-2026) movió el alta a
`crear_optin_whatsapp()`, porque un insert plano no puede reactivar un opt-in revocado
(`revoked_at` es columna que solo `service_role` escribe) y reoptar necesita un upsert. W-103
extendió ese RPC con `user_id` y `email`. La función es `SECURITY DEFINER`: **salta RLS**, así
que no depende de esta policy para insertar.

El resultado es que la policy quedó huérfana. Verificado contra los dos clientes:

- `sonopolisWeb/libs/data/whatsapp.js` — `crearOptIn()` llama `supabase.rpc("crear_optin_whatsapp", …)`.
  Los otros tres accesos a la tabla son un `select` y dos `update`.
- `grep -rn "whatsapp_opt_ins" ~/projects/AppAll/src` — cero resultados. La app móvil no
  conoce la tabla.

**No hay un solo `.insert()` contra `whatsapp_opt_ins` en ninguno de los dos repos.**

Qué habilita mientras siga abierta. `whatsapp_opt_ins` es la tabla donde vive la prueba de que
alguien aceptó recibir mensajes, y `opted_in_at` es la fecha de esa aceptación. Con la anon
key —que viaja en el bundle del navegador, es pública y no se puede rotar sin desplegar— se
puede escribir esa tabla directamente:

1. **Consentimiento fabricado.** Dar de alta el teléfono de un tercero en cualquier local.
   Sonópolis manda desde **un único número de Kapso para toda la plataforma** (W-049), así que
   un mensaje a alguien que nunca aceptó no perjudica a un local: perjudica al número de
   todos. Es exactamente lo que Meta penaliza, el mismo riesgo que W-105 trata desde el otro
   lado (el opt-out global).
2. **`opted_in_at` arbitrario.** El insert directo elige la fecha; el RPC la estampa con
   `now()`. Una fecha de consentimiento que el cliente puede elegir no es evidencia de nada.
3. **Relleno sin techo.** El `unique (tenant_type, tenant_id, phone_e164)` frena el duplicado
   exacto, no un millón de teléfonos distintos. El CRM (`crm_contactos`, W-099) cuenta esas
   filas, así que la basura no se queda quieta en la tabla: sale en el panel del local.

## Decisión 1 — se borra la policy, no se le pone una condición

La alternativa sería dejar el `insert` abierto con un `with check` más estricto. No hay
condición que escribir: el caso legítimo —alguien sin cuenta deja su teléfono— no tiene nada
que validar a nivel de fila, y por eso W-049 puso `true` en primer lugar. Una policy con una
condición inventada sería una policy que igual acepta todo, con más código.

```sql
-- El alta pasa por crear_optin_whatsapp() desde el addendum de W-049: es
-- SECURITY DEFINER, salta RLS y no necesita esta policy. Sin insert directo en
-- ninguno de los dos clientes, lo único que queda abierto es la escritura
-- arbitraria con la anon key.
drop policy if exists whatsapp_opt_ins_insert on public.whatsapp_opt_ins;
```

Con esto, `anon` y `authenticated` quedan sin ninguna policy de `insert`, y **RLS deniega por
defecto**: la tabla solo se escribe por el RPC o por `service_role`. Es el mismo criterio que
W-049 ya aplicó a `update`/`delete` y a `whatsapp_broadcasts` entero.

## Decisión 2 — el RPC no se toca, y sigue abierto a `anon`

`crear_optin_whatsapp` conserva su `grant execute … to anon, authenticated`. Es deliberado: el
opt-in desde el perfil público (W-053) funciona sin cuenta, y pedir un email para recibir un
WhatsApp es fricción sin motivo (W-103 lo argumenta).

**Lo que este spec no cierra, y conviene decirlo sin adornos:** quien pueda llamar al RPC
sigue pudiendo dar de alta un teléfono ajeno. Lo que se gana es que ese alta pase por un
punto único y controlado —valida `tenant_type` y `source`, estampa `opted_in_at` con `now()`,
y es el lugar donde mañana entra un rate limit o una verificación por código— en vez de por
una escritura libre a la tabla. El agujero de fondo es **que nadie comprueba que quien deja un
teléfono sea su dueño**, y eso es un spec aparte: va a PENDIENTES, no acá.

## Lo que este spec no toca

- **`crear_optin_whatsapp()`.** Ni su cuerpo, ni sus grants, ni su firma.
- **Las policies de `select`/`update`/`delete`** de `whatsapp_opt_ins`, que W-049 ya dejó
  cerradas correctamente.
- **`whatsapp_broadcasts`.** Todas sus escrituras ya son solo `service_role`.
- **El frontend.** Cero cambios: no hay código que dependa de la policy que se borra.

## Criterios de cierre

1. Contra la base local del spec 089: `select * from pg_policies where tablename =
   'whatsapp_opt_ins'` ya no lista `whatsapp_opt_ins_insert`, y sí lista las demás.
2. Con la **anon key local**, un `INSERT` directo por PostgREST contra `whatsapp_opt_ins`
   devuelve `42501` (violación de RLS). Antes de la migración, devolvía 201.
3. Con la misma anon key, `POST /rest/v1/rpc/crear_optin_whatsapp` **sigue funcionando** y la
   fila aparece en la tabla — el camino legítimo no se rompió. Es el criterio que importa.
4. Reoptar funciona: llamar el RPC dos veces con el mismo teléfono deja una sola fila, con
   `revoked_at` en null y `opted_in_at` actualizado.
5. `supabase db lint --level warning` local: el warning `RLS Policy Always True` sobre
   `whatsapp_opt_ins` desaparece.
6. En producción, después de aplicar: el flujo de opt-in del perfil público
   (`sonopolisWeb`, W-053) da de alta un teléfono real de prueba sin error en consola.

---

## Addendum — verificado contra la base local (16-sep-2026)

Splinter contra la base del spec 089 devuelve **un solo `rls_policy_always_true`**, y apunta a
esta policy con el mismo diagnóstico del spec:

> Table `public.whatsapp_opt_ins` has an RLS policy `whatsapp_opt_ins_insert` for `INSERT` that
> allows unrestricted access (WITH CHECK clause is always true). This effectively bypasses
> row-level security for anon, authenticated.

Ninguna otra tabla del esquema tiene una policy permisiva sin condición: es un caso aislado, no
un patrón repetido en el repo.

Corrección de procedimiento en el criterio 5: `supabase db lint` no corre splinter sino
`plpgsql_check`. El procedimiento correcto está en el addendum del spec 089.
