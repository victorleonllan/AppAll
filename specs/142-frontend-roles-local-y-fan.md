# Spec 142 — La app usa los roles `local` y `fan` de la base

> Estado: aplicado (17-oct-2026) — `npx tsc --noEmit` sin errores nuevos en `src/` (los 69 que quedan son de `supabase/functions/`, Deno, ya estaban en la base); greps de criterios 2-3 limpios salvo comentarios de otros specs (§5). Criterios 4-6 pendientes de prueba en dispositivo.
> Capa: FRONTEND. `src/context/AuthContext.tsx`, `src/navigation/index.tsx`, `src/screens/AuthScreen.tsx`, `src/screens/RegisterScreen.tsx`, `src/screens/CrearEventoScreen.tsx`.
> Depende de: ninguno pendiente (spec 046, aplicado en producción).
> Alimenta: spec 128 (elegir rol), spec 114 (comparte `navigation/index.tsx`; el orquestador los serializa).
> Supera: sección 1 del spec 048.

> **En una frase:** la base renombró los roles a `fan`/`musician`/`local` en agosto (spec 046),
> pero la app sigue comparando contra `'cafe'`/`'public'`; por eso hoy un dueño de local
> existente entra a la app y cae en la pestaña de fan, sin «Mi Local».

## Contexto

- La migración `20260815232514_spec_046_rol_fan_guest_checkout.sql:25-38` hizo backfill de
  `profiles.role` y de `auth.users.raw_user_meta_data.role`: `'public'`→`'fan'` y
  `'cafe'`→`'local'`. El `CHECK` nuevo solo acepta `fan`, `musician` y `local`.
- La app lee el rol de `session.user.user_metadata.role` (`AuthContext`), y
  `src/navigation/index.tsx:21` elige la tercera pestaña con `if (role === 'cafe')`. Un dueño
  de local con metadata `'local'` no entra en esa rama y cae en la rama por defecto
  (`PerfilScreen`, la del fan). **Es una rotura viva**: afecta a todo dueño de local cuya
  cuenta existía antes del 15-ago-2026.
- La app sigue escribiendo los valores viejos al registrar: `AuthScreen.tsx:72` y
  `RegisterScreen.tsx:88-92` mandan `'cafe'`; `AuthContext.tsx:69` (`signInOtp`) manda
  `'public'`. `handle_new_user()` los acepta como alias (spec 046, paso 3), pero la metadata
  queda con el valor viejo y la app tiene que seguir entendiendo los dos.
- El spec 048 (propuesto en agosto) cubría esto en su sección 1, junto con compra sin cuenta
  (§2) y seguir/panel de fan (§4). §2 contradice lo que hizo la web (sigue con enlace mágico;
  `confirm-payment` responde `guest_no_soportado_aun`) y choca con los specs 117/118; §4 lo
  cubren los specs 123/124. Por eso este spec toma solo §1 y el 048 queda superado.

## Diseño

1. **`AuthContext.tsx`**
   - `type UserRole = 'fan' | 'musician' | 'local' | null` (exportado, para que `navigation`
     lo importe en vez de redeclararlo).
   - Función pura `normalizarRol(valor: unknown): UserRole` en el mismo archivo:
     `'local'` o `'cafe'` → `'local'`; `'fan'` o `'public'` → `'fan'`; `'musician'` →
     `'musician'`; cualquier otra cosa → `null`. El alias existe porque hay cuentas creadas
     después del 046 con metadata `'cafe'`/`'public'` (las escribió esta misma app); el
     alias no se quita en este spec.
   - Donde hoy se lee `user_metadata.role`, pasar por `normalizarRol`.
   - `signInOtp` escribe `role: 'fan'` en vez de `'public'`.
2. **`navigation/index.tsx`**: borrar el `type UserRole` local e importar el de
   `AuthContext`; `if (role === 'local')` → `MiLocalStack`. No tocar nada más del archivo
   (el spec 114 lo reestructura).
3. **`AuthScreen.tsx` y `RegisterScreen.tsx`**: `type RoleOption = "musician" | "local"`;
   cada `"cafe"` que se refiere al rol pasa a `"local"`. Ojo: `VenueType` también tiene
   `"cafe"` como **tipo de local** (`src/types/index.ts:1`, `EditarLocalScreen.tsx:14`):
   eso no es un rol y no se toca.
4. **`CrearEventoScreen.tsx:81`**: `role === 'cafe'` → `role === 'local'`.
5. Comentarios que mencionan `role='cafe'`/`'public'` (`EventosContext.tsx:81,292`,
   `useEntradasEvento.ts:56`) quedan fuera: son de otros specs y no cambian conducta.

## Criterios de aceptación

1. `npx tsc --noEmit` limpio.
2. `grep -rn "'cafe'\|\"cafe\"" src` solo devuelve usos de **tipo de local** (`VenueType`,
   `EditarLocalScreen`, mocks si aún existen) y la rama de alias de `normalizarRol`.
3. `grep -rn "'public'" src` solo devuelve la rama de alias de `normalizarRol`.
4. Con una cuenta cuya metadata es `role: 'local'`, la tercera pestaña es «Mi Local».
5. Con metadata `role: 'cafe'` (cuenta vieja no migrada), también es «Mi Local».
6. Registrarse como dueño de local desde `RegisterScreen` deja `profiles.role = 'local'` y
   la metadata en `'local'`.

## Fuera de alcance

- Pantalla para elegir rol (spec 128) y cambio de rol desde el perfil (W-013/W-014, sin
  decisión de producto).
- Compra sin cuenta (§2 del 048): descartada por ahora, la web tampoco la tiene.
- Seguir y panel del fan (§4 del 048): specs 123 y 124.
- Quitar el alias `'cafe'` de `handle_new_user()` (sería un spec DATOS cuando no queden
  cuentas con metadata vieja).

## Verificación manual

- V-candidata: entrar en la app nativa con la cuenta de un dueño de local real creada antes
  del 15-ago-2026 y confirmar que ve «Mi Local».
