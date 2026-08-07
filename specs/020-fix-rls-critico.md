# Spec 020 — Dos agujeros críticos de RLS

## Contexto

Auditando `pg_policies` con el MCP de Supabase aparecieron dos policies que anulan el modelo de seguridad. Ambas son explotables **hoy**, desde el cliente, con la `anon key` que viaja en el bundle de la app.

Este spec es prerequisito para pasar Mercado Pago a producción: el agujero 2 permite emitir entradas sin pagar.

---

## Agujero 1 — `profiles` está abierta a todo el mundo

```
tablename | policyname                          | roles    | cmd | qual | with_check
profiles  | Service role can manage all profiles | {public} | ALL | true | true
```

El nombre dice "Service role", pero **`roles` es `{public}`**, que en Postgres significa *todos los roles*, incluido `anon`. Con `cmd = ALL` y `qual = true` sin ninguna condición, la policy concede lectura, inserción, modificación y borrado de **cualquier perfil a cualquiera**.

Como las policies `PERMISSIVE` se combinan con `OR`, esta anula por completo a las otras tres:

| Policy | Intención | Efecto real |
|---|---|---|
| `Users can read own profile` | `auth.uid() = id` | irrelevante |
| `Users can insert own profile` | `auth.uid() = id` | irrelevante |
| `Users can update own profile` | `auth.uid() = id` | irrelevante |

Con la anon key, cualquiera puede volcar todos los perfiles (nombres, bios, redes sociales), **cambiarle el `role` a otro usuario** o borrar filas.

Nota: esto también es una explicación plausible de por qué `profiles` apareció vacía en el spec 019 — con esta policy, un `DELETE` sin filtro desde el cliente basta.

**El service role no necesita esta policy: bypassa RLS por definición.** Es una policy escrita por error.

### Solución

```sql
DROP POLICY "Service role can manage all profiles" ON public.profiles;
```

Las tres policies `own` quedan como único acceso, que es lo correcto. Las Edge Functions siguen operando con `SUPABASE_SERVICE_ROLE_KEY`, que ignora RLS.

**Falta una policy de lectura pública.** Hoy `VerMusicoScreen` deja que un local vea el perfil de un músico, y con solo `Users can read own profile` eso se rompe. Se agrega una policy acotada a lo que ya es público en la app:

```sql
CREATE POLICY "Perfiles de músicos son públicos"
  ON public.profiles FOR SELECT
  USING (role = 'musician');
```

Los perfiles `public` y `cafe` quedan visibles solo para su dueño.

---

## Agujero 2 — un usuario puede regalarse entradas

```
tablename | policyname         | cmd    | qual                    | with_check
tickets   | tickets_update_own | UPDATE | (auth.uid() = user_id)  | null
```

Cuando `with_check` es `null` en un `UPDATE`, Postgres usa `qual` como check. Resultado: un usuario autenticado puede modificar **cualquier campo** de sus propios tickets, incluido `status`.

```js
// Desde el cliente, con la anon key y sesión iniciada:
await supabase.from('tickets')
  .update({ status: 'completed' })
  .eq('id', miTicketPendiente);
```

Eso convierte un ticket `pending` en `completed` **sin pasar por Mercado Pago**. Con MP en credenciales de prueba el daño es nulo; en producción es fraude directo. También permite alterar `monto`, `cantidad` y `payment_id`.

### Solución

```sql
DROP POLICY tickets_update_own ON public.tickets;
```

Se elimina sin reemplazo. Verificado con grep: **el cliente nunca actualiza tickets**, solo los lee —

- `ConfirmacionCompraScreen.tsx:51` → `.select('status')`
- `VentasMusicoScreen.tsx:54` → `.select('*')`

El único componente que escribe `status` es la Edge Function `webhook-mp`, que usa `SUPABASE_SERVICE_ROLE_KEY` y bypassa RLS. Quitar la policy no rompe ningún flujo.

---

## Lo que se revisó y está correcto

| Tabla | Policy | Veredicto |
|---|---|---|
| `venues` | `select: true` | ✅ el catálogo es público a propósito |
| `venues` | `insert/update: auth.uid() = owner_id` | ✅ |
| `events` | `select: true` | ✅ la cartelera es pública |
| `events` | `insert/update/delete: auth.uid() = created_by` | ✅ |
| `tickets` | `insert: auth.uid() = user_id` | ✅ |
| `tickets` | `select_own` + `select_event_owner` | ✅ dueño del evento ve sus ventas |
| `tickets` | sin policy `DELETE` | ✅ correcto, nadie borra tickets |

## Criterios de aceptación

- [ ] `Service role can manage all profiles` ya no existe
- [ ] Existe policy de SELECT público solo para `role = 'musician'`
- [ ] Un usuario no puede leer el perfil de otro que no sea músico
- [ ] `tickets_update_own` ya no existe
- [ ] Un usuario autenticado no puede cambiar el `status` de su ticket desde el cliente
- [ ] El webhook (service role) sigue marcando tickets como `completed`
- [ ] `VerMusicoScreen` sigue mostrando perfiles de músicos

## Fuera de alcance

El aviso `auth_leaked_password_protection` del linter (protección contra contraseñas filtradas, deshabilitada) se activa desde el dashboard de Supabase, no por migración. Queda anotado para cuando se prepare producción.
