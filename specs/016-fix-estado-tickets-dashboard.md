# Spec 016 — Fix: estado de tickets en el dashboard de ventas

## Problema

El dashboard de ventas del músico (spec 010) mostraba **siempre 0** — entradas vendidas, monto total y todos los badges por evento — incluso con pagos confirmados por Mercado Pago.

`VentasMusicoScreen.tsx` filtraba los tickets así:

```typescript
const ticketsPaid = todosTickets.filter((t) => t.status === 'paid');
```

Ningún ticket alcanza nunca el estado `'paid'`:

| Momento | Estado real |
|---------|-------------|
| `create-preference/index.ts:80` crea el ticket | `'pending'` |
| `webhook-mp/index.ts:38` confirma el pago | `'completed'` |

El filtro no hacía match nunca → los `reduce()` operaban sobre un array vacío → 0 en todo.

Solo el contador de "Eventos" era correcto, porque no depende del estado.

## Causa raíz

El spec 010 documentaba mal los estados de la tabla:

```
- `status` (text: paid, pending, cancelled)   ← incorrecto
```

Eso contradice el esquema definido en el spec 009 y el tipo `TicketStatus` en `src/types/index.ts`. La implementación siguió el spec en vez del código, y el error se propagó.

De dónde salió el `'paid'`: en `webhook-mp/index.ts:32` existe

```typescript
if (order.order_status === 'paid') {
```

pero `order_status` es un campo **de la API de Mercado Pago**, no el estado del ticket en nuestra base. Confundir ambos es lo que rompió el dashboard.

## Convención de estados de ticket

**Fuente de verdad:** `TicketStatus` en `src/types/index.ts`. No improvisar valores.

| Estado | Quién lo escribe | Cuándo |
|--------|------------------|--------|
| `pending` | `create-preference` | al crear el ticket, antes de pagar |
| `completed` | `webhook-mp` | cuando MP confirma el pago |
| `refunded` | — | reservado, sin uso todavía |

> ⚠️ `'paid'` **no es un estado de ticket.** Es de Mercado Pago.

## Cambios aplicados

| Archivo | Cambio |
|---------|--------|
| `src/screens/VentasMusicoScreen.tsx` | `'paid'` → `'completed'` en los dos filtros (totales generales y por evento). Variables renombradas a `ticketsPagados` / `evPagados` |
| `src/screens/VentasMusicoScreen.tsx` | `Ticket.status` pasa de `string` a `TicketStatus` importado de `src/types` — para que TypeScript rechace estados inventados a futuro |
| `specs/010-dashboard-ventas.md` | Estados corregidos, criterios de aceptación tildados, historial del fix, estado → Completado |
| `specs/README.md` | Sección de convención de estados. Restaurados los nombres de archivo del spec 013, que se habían perdido al generar el doc desde shell (los backticks se comieron el contenido) |

## Prevención

Tipar `status` con `TicketStatus` en vez de `string` es lo que evita la recaída: cualquier comparación contra un literal que no pertenezca a la unión ahora falla en compilación.

**Regla general:** los estados de dominio se importan de `src/types/index.ts`. Si un spec documenta valores que no coinciden con el tipo, gana el tipo — y se corrige el spec.

## Verificación

`npx tsc --noEmit` no reporta errores en `VentasMusicoScreen.tsx`.

### Prueba manual (sin Mercado Pago)

Sembrar dos tickets con estados distintos sobre un evento propio:

```sql
insert into tickets (evento_id, user_id, status, monto, cantidad) values
  ('EVENTO-ID', 'USER-ID', 'completed', 5000, 2),
  ('EVENTO-ID', 'USER-ID', 'pending',   3000, 1);
```

Entrar como músico → Perfil → "📊 Mis Ventas":

| Indicador | Esperado |
|-----------|----------|
| Entradas vendidas | 2 |
| Monto total | $5.000 |
| Badge del evento | 2 vendidas / $5.000 |
| Lista expandida | 2 tickets — el `pending` aparece pero **no suma** |

Contraste: pasar el `completed` a `pending` y refrescar → todo debe caer a 0.

### Prueba end-to-end

Flujo completo de compra con tarjeta de prueba de MP. Tras la confirmación, el ticket debe quedar en `completed` y sumar en "Mis Ventas". Si sigue en 0, el problema está en `webhook-mp`, no en la pantalla — revisar Supabase → Edge Functions → Logs.

## Deuda técnica detectada (fuera de alcance de este spec)

Encontrada al correr el typecheck, **no** introducida por este cambio:

1. **`genero` no existe en `PerfilMusico`** — 10 errores de TS. El campo se usa en `CafesScreen`, `DashboardCafeScreen`, `PerfilMusicoScreen`, `VerMusicoScreen` y en los mocks, pero no está declarado en el tipo. O falta en el tipo, o sobra en el código.
2. **El tsconfig typechequea las Edge Functions de Deno** — 12 errores (`Cannot find name 'Deno'`, imports por URL). Se resuelve excluyendo `supabase/functions/` del tsconfig de la app.
3. **`cancelled` falta en `TicketStatus`** — el `CHECK` de la tabla acepta `pending, completed, refunded, cancelled`, pero el tipo declara solo los tres primeros. Misma clase de desalineación que causó este bug.
4. **Estados en inglés en la UI** — la pantalla muestra `t.status` crudo, así que el músico lee "completed" / "pending" en una app enteramente en español. Falta un mapa de traducción.

## Estado: Completado
