# Spec 106 — Todo perfil tiene país desde que nace

> Estado: **aplicado en producción** (05-oct-2026) — `20261005210000_spec_106_pais_del_perfil.sql` (`supabase db push --linked`, única migración pendiente), con `DEFAULT 'CL'` por la addenda. Antes del push, criterios 1-5 y el `upsert` de la addenda en un Postgres 17 local con stub. Después del push, contra producción: 40 perfiles, 0 nulos, todos `CL` (1); dentro de un bloque revertido, cuenta nueva con `pais: MX` → `musician/MX`, sin país → `CL`, con `AR` → `CL` (2); `pais = 'AR'` falla por FK (23503) y `NULL` por `NOT NULL` (23502) (3); como `anon`, los 7 músicos con país y ningún fan ni local visible (4); `set_my_role('musician')` deja el país en `CL` (5); el `upsert` de la app nativa (`mapProfileToDB` siempre manda `role: 'musician'`) sobre un perfil en `MX` guarda y conserva `MX` (addenda). Ningún dato de prueba quedó.
> Capa: DATOS. `supabase/migrations/20261005210000_spec_106_pais_del_perfil.sql`.
> Depende de: spec 100 (`paises_cobro`, el catálogo de países donde Sonópolis opera), spec 046
> (`handle_new_user` con los roles `fan`/`musician`/`local`).
> Alimenta: los specs web que filtran músicos por país, piden el país en el perfil y crean el
> evento en el país del músico (por escribir).

> **En una frase:** `profiles.pais`, obligatorio, con Chile para todas las cuentas que ya
> existen, y `handle_new_user` lo llena al crear cada cuenta con el país del entorno donde se
> registró.

## Motivo

Decisión de Victor (5-oct-2026): los músicos dicen de qué país son. Ese país sirve para
filtrar músicos por país y para crear el evento en ese país con sus medios de pago. Es
obligatorio y es público.

Hoy `profiles` tiene `ciudad` (texto libre: «Santiago», «santiago») y ningún país. Los
locales sí lo tienen (`venues.pais`), y el evento lo hereda del local (W-114). Un músico no
tiene cómo decirlo.

## Decisión 1 — la columna es de todo perfil, no solo de los músicos

```sql
ALTER TABLE public.profiles ADD COLUMN pais char(2) REFERENCES public.paises_cobro(pais);
UPDATE public.profiles SET pais = 'CL';
ALTER TABLE public.profiles ALTER COLUMN pais SET NOT NULL;
```

**Por qué todo perfil y no un `CHECK` solo para `role = 'musician'`:** el rol no está fijo al
nacer la cuenta. Quien entra con Google llega sin rol, `handle_new_user` crea el perfil como
`fan` y recién después elige en `/quien-eres`, y `set_my_role` cambia `fan` a `musician`. Con
una regla atada al rol, ese cambio fallaría o habría que parchar `set_my_role`. Con el país
desde el nacimiento, elegir o cambiar el rol no toca el país.

- **Backfill `CL` para todos (40 perfiles: 30 fans, 7 músicos, 3 locales).** Victor confirmó
  que todas las cuentas se crearon en el entorno de Chile. Incluye a Cadência do Sul, Santiago
  Samba Club, Criacuervos IX y los 4 perfiles de músico sin nombre.
- **FK a `paises_cobro`**, no un `CHECK` con una lista: es el único catálogo de países en la
  base, y el país del músico decide con qué medios de pago se crea su evento. Un país que no
  está ahí no tiene cómo cobrar. Agregar un país es una fila en `paises_cobro`, no tocar esta
  columna.
- **Sin `DEFAULT`**, igual que `tickets.pais_cobro` (spec 100): la única vía de alta de
  perfiles es `handle_new_user`, que lo escribe explícito (Decisión 2).

## Decisión 2 — `handle_new_user` escribe el país al crear la cuenta

Parte de la definición vigente en producción (`pg_get_functiondef`). Un cambio: lee `pais` de
`raw_user_meta_data`, y si no viene o no está en `paises_cobro`, usa `'CL'`.

```sql
v_pais := NEW.raw_user_meta_data->>'pais';
IF v_pais IS NULL OR NOT EXISTS (SELECT 1 FROM public.paises_cobro WHERE pais = v_pais) THEN
  v_pais := 'CL';
END IF;
```

**Por qué `'CL'` y no fallar:** si `handle_new_user` lanza error, Supabase rechaza la creación
de la cuenta entera con un error genérico ("Database error saving new user"). Un país mal
escrito no puede impedir registrarse. Y hoy tres caminos no mandan país:

- **La app nativa:** solo opera en Chile. `'CL'` es lo correcto ahí.
- **Google:** OAuth no deja mandar `data` al crear la cuenta. Desde el entorno de México
  quedaría `'CL'`. Lo corrige el spec web que agregue el país a `/quien-eres` (fuera de este).
- **La compra sin sesión** (`signInWithOtp`) y el registro con correo de la web: hoy mandan
  `{ role, nombre }`. El spec web les suma `pais` del entorno (`getPaisActivo`).

## Decisión 3 — público para los músicos, sin policy nueva

La policy «Perfiles de músicos son públicos» (`SELECT … USING (role = 'musician')`) ya expone
la fila entera del músico a `anon`. `pais` viaja con ella. Fans y locales siguen privados, como
hoy. No se crea ninguna policy.

El dueño lo puede cambiar con la policy «Users can update own profile», pero solo a un país de
`paises_cobro` (la FK lo impide) y nunca a `NULL`.

## Trabajo

`supabase/migrations/20261005210000_spec_106_pais_del_perfil.sql`, en una sola transacción:

1. `profiles.pais`: columna con FK, backfill `'CL'`, `NOT NULL`.
2. `CREATE OR REPLACE FUNCTION public.handle_new_user()` con la Decisión 2. Misma firma: no
   hay sobrecarga posible.

## Criterios de aceptación

1. `select count(*) from profiles where pais is null` = 0, y `select distinct pais from
   profiles` = `CL`.
2. Dentro de una transacción revertida, un `INSERT` en `auth.users` con
   `raw_user_meta_data = {"role":"musician","pais":"MX"}` crea el perfil con `role = 'musician'`
   y `pais = 'MX'`. Sin `pais`, `'CL'`. Con `"pais":"AR"` (fuera del catálogo), `'CL'`.
3. `update profiles set pais = 'AR'` falla por la FK. `set pais = null` falla por `NOT NULL`.
4. Como `anon`, `select nombre, pais from profiles where role = 'musician'` devuelve el país.
   Un perfil de fan sigue sin verse.
5. `set_my_role('musician')` sobre un fan no cambia su `pais`.

## Fuera de alcance

- Pedir y mostrar el país en el perfil del músico (FRONTEND web).
- Mandar el país del entorno al registrarse y en `/quien-eres` (LÓGICA web).
- Filtrar `/musicos` por país, y crear el evento en el país del músico (web).
- Esconder los perfiles de músico sin nombre de los listados (web, pedido de Victor del
  5-oct-2026).
- `events.pais` sigue heredándose del local (W-114): este spec no lo toca.
- Que la base deje de crear el perfil como `fan` provisional al entrar con Google.

## Bugs encontrados al aplicar (05-oct-2026)

- **"Sin `DEFAULT`" (Decisión 1) rompía la app nativa.** `EditarPerfilBandaScreen` y
  `PerfilMusicoScreen` guardan el perfil con `supabase.from('profiles').upsert(...)` sin `pais`.
  En un `INSERT … ON CONFLICT DO UPDATE`, Postgres revisa el `NOT NULL` de la fila propuesta
  antes de resolver el conflicto (verificado en un Postgres 17 local: `null value in column
  "pais"` aunque la fila ya exista). Sin default, ningún músico podría volver a guardar su perfil
  desde la app, y las versiones instaladas no se pueden corregir a tiempo. La migración agrega
  `DEFAULT 'CL'` (la app nativa solo opera en Chile). El `UPDATE` del upsert no toca `pais`
  porque no viaja en el payload, así que no pisa el país de nadie. `handle_new_user` lo sigue
  escribiendo explícito. Criterio agregado: un `upsert` sin `pais` sobre un perfil existente
  guarda y conserva su país.

