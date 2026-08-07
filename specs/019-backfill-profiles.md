# Spec 019 — Perfiles huérfanos: backfill, hardening del trigger y fix del upsert

## Contexto

Revisando la base con el MCP de Supabase apareció una inconsistencia grave:

```
users: 4    profiles: 0    usuarios_sin_perfil: 4
```

**Los 4 usuarios reales de `auth.users` no tienen fila en `public.profiles`.**

Esto no es cosmético. `AuthContext` lee `profiles.role` para decidir qué tercer tab mostrar (Cartelera / Mi Perfil / Mi Local). Sin perfil no hay rol, y la navegación por rol está rota para todos los usuarios existentes.

### Por qué pasó — el trigger NO es el culpable

La sospecha inicial era un trigger roto. Se verificó y es falso:

```sql
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user()
```

El trigger existe, está habilitado (`tgenabled = 'O'`) y la función es correcta. El punto es que es **`AFTER INSERT`**: solo dispara para usuarios nuevos. Los 4 usuarios existentes son anteriores al trigger (o sus perfiles se borraron después), y un `AFTER INSERT` no hace backfill retroactivo.

Conclusión: **el arreglo no es tocar el trigger, es rellenar lo que quedó atrás.**

## Cambios

### 1. Backfill de los usuarios sin perfil

```sql
INSERT INTO public.profiles (id, role, nombre)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'role', 'public'),
  COALESCE(u.raw_user_meta_data->>'nombre', '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;
```

Replica exactamente la lógica de `handle_new_user()`, así que los usuarios recuperados quedan idénticos a como habrían quedado si el trigger hubiera corrido. Roles resultantes: dos `musician`, un `public` y un `public` por defecto (`vod4747@gmail.com` no trae `role` en su metadata).

Es idempotente: se puede correr de nuevo sin efecto.

### 2. Hardening de `handle_new_user()`

Dos problemas que el linter de Supabase ya señalaba:

**`search_path` mutable** (`function_search_path_mutable`) — una función `SECURITY DEFINER` sin `search_path` fijo puede ser desviada a otro esquema por quien controle el `search_path` de la sesión.

**Sin `ON CONFLICT`** — si por cualquier razón ya existe el perfil, el `INSERT` lanza excepción. Y como el trigger corre dentro de la transacción del `INSERT` en `auth.users`, esa excepción **haría fallar el registro completo del usuario**. Un perfil duplicado no debería impedir que alguien se registre.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, nombre)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'public'),
    COALESCE(NEW.raw_user_meta_data->>'nombre', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
```

El `REVOKE` cierra los otros dos avisos del linter (`anon_security_definer_function_executable` y su equivalente para `authenticated`): hoy la función es invocable por cualquiera vía `/rest/v1/rpc/handle_new_user`.

⚠️ **Revocar a `anon, authenticated` no basta.** Postgres concede `EXECUTE` a `PUBLIC` por defecto al crear una función, y esos roles heredan de ahí; tras el primer `REVOKE`, `has_function_privilege('anon', …)` seguía devolviendo `true`. Hace falta `REVOKE … FROM PUBLIC`.

**Verificación de que no rompe el registro.** Tras el revoke, ni siquiera `supabase_auth_admin` (el rol que inserta en `auth.users` al registrarse) conserva `EXECUTE`. Se comprobó con una sonda transaccional revertida — un `INSERT` en `auth.users` dentro de un bloque `DO` terminado en `RAISE EXCEPTION`, que aborta y no persiste nada:

```
RESULTADO_SONDA: perfiles creados por el trigger = 1
```

El trigger dispara igual. PostgreSQL comprueba el privilegio `EXECUTE` al **crear** el trigger, no al dispararlo (`ExecCallTriggerFunc` no hace chequeo de ACL).

### 3. `PerfilMusicoScreen.tsx` — dos bugs en el upsert

```typescript
const { error } = await supabase.from('profiles').upsert({
  id: user.id,
  nombre,
  genero,      // ← columna inexistente
  bio, instagram, spotify, youtube,
});           // ← falta role
```

**Bug A — `genero` no existe en `profiles`.** Las columnas reales son `id, role, nombre, created_at, tipo_proyecto, bio, instagram, spotify, youtube, foto`. El campo correcto es `tipo_proyecto`. El upsert falla con error de columna desconocida. La lectura tiene el mismo error (`data.genero` → siempre `undefined`).

**El origen es una migración a medias.** El historial de Supabase tiene `20260612192127_rename_genero_to_tipo_proyecto`: la columna se renombró en junio y el código TypeScript nunca se actualizó. Por eso `main` arrastraba **8 errores de `tsc --noEmit`** — `PerfilMusico` ya declaraba `tipoProyecto`, pero `musicos.ts`, `CafesScreen`, `DashboardCafeScreen`, `VerMusicoScreen` y `PerfilMusicoScreen` seguían leyendo `.genero`. Se alinean los tres niveles: `tipo_proyecto` en la base, `tipoProyecto` en los tipos y objetos, `genero` solo como nombre de estado local de formulario.

**Bug B — el upsert omite `role`, que es `NOT NULL`.** Con `profiles` vacía, un `upsert` es un `INSERT`, y sin `role` viola la restricción. O sea: **hoy ningún músico puede guardar su perfil.** El backfill del punto 1 lo enmascara (ya habrá fila, así que el upsert será UPDATE), pero el bug sigue latente para cualquier usuario cuyo perfil falte. Se corrige preservando el rol existente en vez de asumirlo.

### 4. `TicketStatus` desalineado con la base

```typescript
export type TicketStatus = 'pending' | 'completed' | 'refunded';
```

El CHECK real de `tickets.status` es `('pending','completed','refunded','cancelled')`. Falta `'cancelled'` en TypeScript. Un ticket cancelado en la base se castea a un tipo que no lo contempla. Se agrega.

## Criterios de aceptación

- [ ] `usuarios_sin_perfil = 0`
- [ ] `handle_new_user()` tiene `search_path` fijo y `ON CONFLICT DO NOTHING`
- [ ] `anon` y `authenticated` ya no pueden ejecutar `handle_new_user()` vía RPC
- [ ] Los tres avisos del linter sobre `handle_new_user` desaparecen
- [ ] `PerfilMusicoScreen` lee y escribe `tipo_proyecto`, no `genero`
- [ ] Guardar perfil de músico funciona sin violar `NOT NULL` en `role`
- [ ] `TicketStatus` incluye `'cancelled'`

## Deuda que deja abierta

`musico@prueba.appall` (spec 013) sigue vivo en la base de producción. No se borra en este spec porque `Da Gota` podría estar referenciado por eventos de prueba; requiere revisar dependencias antes de eliminar.
