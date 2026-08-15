# Spec 047 — Seguir músicos y locales

> Estado: **aplicado en producción (2026-08-15)**.
> `supabase/migrations/20260815232523_spec_047_seguir_musicos_locales.sql`. Aplicado sin
> incidentes (a diferencia del spec 046 — ver ahí los dos bugs encontrados al aplicar).
> Diseño original en
> `Hermes/Agentes/Base de Datos/plan-datos-fan-guest-checkout-20260815.md` (vault),
> decisión D.

**Capa: DATOS · `supabase/migrations/` · Depende de: nada** (independiente del spec 046 —
no usa columnas ni funciones que ese spec agrega)

## Pedido de Victor

La cuenta `fan` "debería tener un dashboard para seguir bandas, locales y ver tickets
comprados". Este spec cubre la parte de datos de "seguir"; "ver tickets comprados" ya
funciona con `tickets.user_id` + RLS existente (spec 020), no necesita esquema nuevo.

## Decisión: dos tablas explícitas, no una polimórfica

`follows_musicians` y `follows_venues`, no una tabla `follows` con `followed_id` +
`followed_type`. Un `followed_id` que apunta a veces a `profiles` y a veces a `venues`
pierde el FK real (no se puede tener una FK condicional en Postgres sin trigger de
validación). Dos tablas chicas con FK real es más barato que esa validación.

`event_collaborators` (spec 033) **no es precedente de esto**: sus dos FKs (`event_id`,
`user_id`) son siempre del mismo tipo de entidad — `source` ahí distingue *origen*, no
*tipo destino*. No aplica al problema de "el seguido puede ser un músico o un local".

## Esquema

- `follows_musicians(follower_id → auth.users, musician_id → profiles, created_at)`,
  PK compuesta.
- `follows_venues(follower_id → auth.users, venue_id → venues, created_at)`,
  PK compuesta.
- `ON DELETE CASCADE` en ambos lados: si se borra la cuenta que sigue o el
  músico/local seguido, la fila de "seguir" desaparece sola.
- Índice sobre `musician_id`/`venue_id` — la consulta más común además de "a quién sigo yo"
  es "cuántos/quiénes siguen a este perfil" (para un contador futuro, fuera de este spec).

## RLS

Privado al propio seguidor, igual que el resto de `profiles` desde el spec 020:
`SELECT`/`INSERT`/`DELETE` gateados por `follower_id = auth.uid()`. `follows_musicians`
además valida en el `INSERT` que `musician_id` sea realmente `role = 'musician'` en
`profiles` — evita seguir un `id` que no es músico. `follows_venues` no tiene ese `EXISTS`
porque `venues` no tiene un `role`/tipo que lo amerite (cualquier fila de `venues` es
seguible).

## Trabajo

Migración `20260815232523_spec_047_seguir_musicos_locales.sql` — SQL completo en el
archivo.

## Fuera de alcance

Contadores públicos de seguidores en el perfil de un músico o local — es una función
`SECURITY DEFINER` chica (`COUNT(*) FROM follows_musicians WHERE musician_id = ...`) que
no toca esta tabla, se agrega cuando se pida. UI de seguir/dejar de seguir y el dashboard
que lista lo seguido — eso es el **spec 048**.

## Criterios de aceptación

- [x] `follows_musicians` y `follows_venues` existen con PK compuesta y FKs `ON DELETE
      CASCADE` — verificado (`pg_tables`, `relrowsecurity = true` en ambas)
- [x] Las 6 policies existen (`select`/`insert`/`delete` × 2 tablas) — verificado
      (`pg_policies`)
- [ ] Un usuario autenticado puede insertar una fila con `follower_id = auth.uid()`;
      insertar con otro `follower_id` falla por RLS — no probado con una sesión real
- [ ] Insertar en `follows_musicians` con un `musician_id` que no tiene `role = 'musician'`
      falla por el `EXISTS` del `WITH CHECK` — no probado
- [ ] Un usuario solo ve (`SELECT`) sus propias filas de "seguir", no las de otros — no
      probado
- [ ] Borrar la cuenta seguidora o el perfil/venue seguido borra la fila de "seguir" en
      cascada — no probado (no hay filas de seguir todavía, nada que ejercitar)

## Relacionado

- [[Hermes/Agentes/Base de Datos/plan-datos-fan-guest-checkout-20260815]] (vault) — diseño
  original, decisión D
- Spec 020 (RLS de `profiles`, mismo patrón de "privado al dueño")
- Spec 033 (`event_collaborators` — por qué NO es precedente acá, ver arriba)
- Spec 046 — rol `fan`, independiente pero mismo pedido de Victor
- Spec 048 — UI de seguir y dashboard del fan
