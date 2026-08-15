# Spec 046 — Rol `fan`, rename `cafe`→`local`, guest checkout y claim por email

> Estado: **aplicado en producción (2026-08-15)**. Dos migraciones:
> `20260815232514_spec_046_rol_fan_guest_checkout.sql` (el diseño completo) y
> `20260815232700_spec_046_revoke_anon_execute_grants.sql` (corrección de grants, ver
> "Bugs encontrados al aplicar" abajo). Diseño original del agente de Base de Datos del
> vault, en `Hermes/Agentes/Base de Datos/plan-datos-fan-guest-checkout-20260815.md`.
>
> **Bugs encontrados al aplicar (no estaban en el diseño original, corregidos en el
> momento antes de dar el spec por cerrado):**
> 1. **Orden de la sección 1 invertido.** El plan original hacía los `UPDATE` de
>    `profiles.role` a `'fan'`/`'local'` *antes* de tocar el CHECK — pero el CHECK viejo
>    (`{public,musician,cafe}`) rechaza esos valores nuevos, así que la migración
>    completa abortaba en la primera sentencia (transaccional, sin dejar nada a medias).
>    Corregido: `DROP CONSTRAINT` va antes del backfill, `ADD CONSTRAINT` después.
> 2. **`_reservar_ticket_shared`, `claim_guest_tickets` y `set_my_role` quedaron
>    ejecutables por `anon`/`authenticated` vía REST** pese al `REVOKE ALL ... FROM
>    PUBLIC` del archivo original — Supabase otorga `EXECUTE` a esos dos roles por
>    defecto en funciones nuevas del schema `public`, y ese grant es directo por rol, no
>    vía `PUBLIC`, así que el `REVOKE` no lo tocaba. Confirmado con `get_advisors`
>    (`anon_security_definer_function_executable`) segundos después de aplicar. El caso
>    real: cualquiera sin sesión podía llamar `_reservar_ticket_shared` con un
>    `p_user_id` arbitrario y crear tickets a nombre de cualquier usuario, saltándose el
>    `auth.uid()` que `reservar_ticket_pending` exige — vulnerabilidad real, cerrada por
>    la segunda migración antes de que nadie más que yo la hubiera usado.
>
> Verificado tras aplicar: conteo de `profiles.role` (`fan:3, musician:2, local:1`,
> mismas filas que antes, sin pérdida), las 6 funciones nuevas existen,
> `follows_musicians`/`follows_venues` existen, `proacl` de las 3 funciones corregidas
> ya no incluye `anon`/`authenticated` de más, y un guest checkout de punta a punta
> (`reservar_ticket_pending_guest` → ticket con `guest_email`, `user_id NULL` →
> `comprador_de` devuelve el email) — ticket de prueba borrado después, mismo criterio
> que el spec 040.

**Capa: DATOS · `supabase/migrations/` · Depende de: nada** (independiente del spec 047)

## Pedido de Victor (traducido)

> "público es quien entra sin login y puede comprar entrada. Al comprar entrada se recibe
> el webhook y se arma un placeholder para luego, al volver a la página, sin tener su
> cuenta, reclamarlo con la cuenta fan. La cuenta fan es un comprador de ticket y debería
> tener un dashboard para seguir bandas, locales y ver tickets comprados."

`public` deja de ser un rol de cuenta (pasa a significar "sin sesión"); guest checkout con
email; claim automático al crear cuenta con el mismo email; rol `fan` nuevo. En la misma
migración se renombra `cafe`→`local` en `profiles.role`/`auth.users.raw_user_meta_data` —
cierra el drift que el spec W-013 (sonopolisWeb) documentó y la deuda que el spec 032 dejó
abierta a propósito ("profiles.role sigue usando 'cafe', migrar es un spec aparte").

## Estado real verificado antes de diseñar (2026-08-15)

- `profiles.role` CHECK: `{public, musician, cafe}` (3 filas en `public`, 2 en `musician`,
  1 en `cafe`).
- `handle_new_user()` (trigger `on_auth_user_created`): default `'public'`,
  `ON CONFLICT DO NOTHING`, hardening del spec 019.
- `tickets.user_id` NOT NULL, única vía de escritura es `reservar_ticket_pending`
  (spec 022, `SECURITY DEFINER`) — sin policy de INSERT.
- `set_my_role` **no existe** en producción — el spec W-013 de sonopolisWeb lo especificó,
  nunca se implementó del lado de datos. `sonopolisWeb`'s `app/(auth)/quien-eres/` ya lo
  llama (commit `6a88256`, W-014) y hoy falla porque el RPC no existe.
- No existe tabla de "seguir"/favoritos (eso es el spec 047).
- Precedente reutilizado: `peek_ticket_item(token)` / `redeem_ticket_item(token)`
  (spec 040) ya usan "uuid/token desconocido como capability, sin `auth.uid()`" — mismo
  patrón para `guest_ticket_status`/`guest_ticket_items`.
- `event_collaborators` (spec 033) **no** es precedente de asociación polimórfica (sus dos
  FKs son siempre del mismo tipo) — por eso "seguir" (spec 047) usa dos tablas, no una.
- `search_collaborator_candidates(q)` (spec 033,
  `20260810080442_spec_033_propiedad_colaboradores_evento.sql:270-278`) tiene
  `WHERE p.role IN ('musician','cafe')` — único lugar además de `profiles.role` donde vive
  `'cafe'` como valor de rol (no `venues.type`). Se reemplaza con `CREATE OR REPLACE`
  porque los specs aplicados no se editan retroactivamente (spec 032).

## Decisiones

| Punto | Decisión |
|---|---|
| Rol `fan`, rename `cafe`→`local` | `profiles.role` → `{fan, musician, local}`. Backfill en `profiles` y `auth.users.raw_user_meta_data`. `handle_new_user()`: `musician` se respeta, `cafe`/`local` colapsan a `'local'` (acepta el valor viejo como alias — ver "Nota sobre resiliencia" abajo), cualquier otra cosa cae a `'fan'`. `set_my_role(p_role)` sin alias para `'cafe'` — RPC nuevo, sin caller legado. |
| Guest checkout | `tickets.user_id` nullable + `tickets.guest_email`, CHECK XOR. Se descartó crear una cuenta placeholder real en `auth.users` vía Admin API: aun así el `auth.users.id` sería nuevo y el claim seguiría siendo un `UPDATE tickets` — la cuenta placeholder solo agrega superficie de ataque (email sin confirmar, recuperable por "olvidé mi contraseña") sin eliminar el paso que se quería evitar. |
| Claim | Trigger `on_auth_user_created_claim_guest_tickets` en `auth.users`, hermano de `on_auth_user_created`. Match por email **sin verificar** — riesgo aceptado explícitamente (ver "Riesgos aceptados"). |
| RLS tickets invitado | Nadie por RLS de tabla (no hay policy `SELECT` para `anon`). El invitado lee vía `guest_ticket_status`/`guest_ticket_items` (`SECURITY DEFINER`, gateadas por conocer el uuid del ticket y `user_id IS NULL`). Tras el claim, `tickets_select_own` (spec 020) empieza a funcionar sola. |

## Nota sobre la resiliencia de `handle_new_user()` frente a AppAll

**AppAll (esta app, React Native) todavía tiene `role === 'cafe'` sin actualizar** en
`src/navigation/index.tsx:14,21`, `src/context/AuthContext.tsx:7`,
`src/screens/AuthScreen.tsx:9,72` y `src/screens/RegisterScreen.tsx:9,88-89,92` — deuda
señalada por el spec 032 y explícitamente no resuelta ahí. Si `handle_new_user()` solo
reconociera `'local'`, un signup real hecho desde AppAll (que manda `role:'cafe'`) caería a
`'fan'` — un dueño de local que se registra desde la app quedaría clasificado como fan. El
`CASE` acepta `'cafe'` como alias de `'local'` por eso, igual que acepta cualquier valor no
reconocido como alias de `'fan'` para el caso viejo de `'public'`.

Esto **no reemplaza** actualizar esos cuatro archivos — es la razón por la que esta
migración no rompe nada mientras no se actualicen. El rename real del frontend es el
**spec 048** (capa lógica/frontend), spec aparte. El alias no hace daño dejarlo puesto una
vez que AppAll también migre a `'local'`/`'fan'`: simplemente deja de activarse.

## Refactor incluido, no pedido explícitamente

`reservar_ticket_pending` (spec 022) se reescribe como wrapper delgado sobre una función
compartida nueva `_reservar_ticket_shared`, para que la lógica de aforo/estado no viva
duplicada entre el flujo con sesión y el de invitado. Comportamiento externo sin cambios.
Alternativa si se prefiere cero riesgo sobre la función ya probada en producción: no tocar
`reservar_ticket_pending` y duplicar el cuerpo completo dentro de
`reservar_ticket_pending_guest`.

## Riesgos aceptados (marcados en la entrega, no resueltos acá)

1. **Claim sin verificación de email.** Alguien puede comprar con el email de otra persona
   y esa persona, al registrarse legítimamente, hereda el ticket. Mitigación (confirmación
   por correo) fuera de alcance a propósito — ni sonopolisWeb ni AppAll tienen hoy un flujo
   de verificación de email previo al claim.
2. Comprar entradas no queda restringido a rol `fan` — cualquier cuenta puede comprar.
3. Se agregó lectura de QR (`guest_ticket_items`) para invitados sin cuenta antes del
   claim, no pedida explícitamente pero necesaria si el show ocurre antes de que la
   persona cree su cuenta fan.

## Trabajo

Migración `20260815232514_spec_046_rol_fan_guest_checkout.sql` — SQL completo en el
archivo, pasos numerados en el propio archivo (no reordenar; el paso 1 corrige el orden
del plan original, ver "Bugs encontrados al aplicar"). Resumen: backfill de rol + CHECK
nuevo, backfill de `auth.users`, `handle_new_user()` con alias `cafe`→`local`,
`set_my_role()` nuevo, `search_collaborator_candidates()` actualizado, `tickets` con
`guest_email`, `_reservar_ticket_shared()` + dos wrappers (`reservar_ticket_pending` y
`reservar_ticket_pending_guest`), trigger de claim, lectura de invitado, `comprador_de()`
con `LEFT JOIN`. Segunda migración,
`20260815232700_spec_046_revoke_anon_execute_grants.sql`: cierra el agujero de grants.

## Fuera de alcance

Confirmación por email del guest checkout (spec propio, necesita Resend); contadores
públicos de seguidores (spec 047 los deja fuera también); actualizar
`role === 'cafe'`/`'public'` en el frontend de AppAll y el wiring de guest checkout /
seguir en pantalla — eso es el **spec 048**, que deja de ser opcional una vez aplicada
esta migración: la razón que el spec 032 dio para no tocar esos archivos ("el tipo debe
mentir lo mismo que miente la base") desaparece en cuanto la base deja de decir `'cafe'`.

## Criterios de aceptación

- [x] `profiles.role` CHECK acepta `{fan, musician, local}` y rechaza `public`/`cafe` —
      verificado con `pg_get_constraintdef` (2026-08-15)
- [x] Las filas existentes de `profiles` quedan backfilleadas (`public`→`fan`,
      `cafe`→`local`) — verificado: `fan:3, musician:2, local:1`, mismo total de filas
      que antes de aplicar (`auth.users.raw_user_meta_data` corre el mismo `UPDATE`, no
      verificado por separado)
- [ ] `handle_new_user()` nuevo: signup con `role:'cafe'` (AppAll actual) sigue cayendo en
      `'local'`; signup sin rol reconocido cae en `'fan'` — no probado con un signup real
- [ ] `set_my_role('local')` desde una sesión autenticada actualiza `profiles.role` y
      `auth.users.raw_user_meta_data` a la vez — no probado con una sesión real
- [x] `reservar_ticket_pending_guest(evento_id, cantidad, preference_id, email)` crea un
      ticket con `user_id NULL` y `guest_email` seteado — verificado de punta a punta
      (ticket de prueba, borrado después)
- [ ] `reservar_ticket_pending` (con sesión) sigue funcionando idéntico al spec 022 — no
      re-probado, el cuerpo de `_reservar_ticket_shared` es el mismo que tenía
      `reservar_ticket_pending` antes del refactor (sin cambios de lógica, solo de dónde
      vive el código)
- [ ] Crear una cuenta con el mismo email de un `guest_email` existente dispara el
      trigger — no probado con un signup real
- [ ] `guest_ticket_status`/`guest_ticket_items` devuelven datos solo si `user_id IS NULL`
      — no probado
- [x] `comprador_de(ticket)` devuelve `guest_email` cuando no hay `user_id` — verificado
      con el ticket de prueba de punta a punta

## Relacionado

- [[Hermes/Agentes/Base de Datos/plan-datos-fan-guest-checkout-20260815]] (vault) — diseño
  original completo, con las dos migraciones
- Spec 019 (backfill de profiles), spec 020 (RLS), spec 022 (`reservar_ticket_pending`),
  spec 032 (rename cafe→local, frontend), spec 033 (`search_collaborator_candidates`),
  spec 040 (patrón de token como capability)
- Spec 047 — seguir músicos y locales (independiente, mismo pedido de Victor)
- Spec 048 — cambios de lógica/frontend en AppAll que esta migración deja pendientes
