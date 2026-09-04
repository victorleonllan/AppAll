# Spec 074 — Admin de plataforma: quién es, y que Postgres lo haga cumplir

> Estado: escrito (4-sep-2026), sin aplicar
> Capa: DATOS. Extiende el spec 073, ya aplicado.
> Decisión de Victor (4-sep-2026), tras revisar el diseño original: el permiso de admin
> vive en la base, no en una variable de entorno, y no hay clave ni login aparte.

> **En una frase:** guardar en la base de datos quién es admin de Sonópolis, para que
> Postgres mismo pueda decidir quién ve las cuentas bancarias y quién puede marcar un pago
> — en vez de que eso dependa solo del código de la app.

## Contexto

El diseño original (W-085) resolvía "quién es admin" con una variable de entorno
`ADMIN_EMAILS` comparada contra el email de la sesión. Funcionaba, pero dejaba dos cosas
mal:

1. **La autorización quedaba solo en el código.** `/admin/pagos` tenía que leer con la
   service role, porque por RLS un admin no es owner de nada y vería cero filas. O sea: una
   pantalla que se salta RLS por completo, con una comparación de strings como única
   guarda. Si esa comparación falla, se filtran todas las cuentas bancarias de la
   plataforma.
2. **Agregar o sacar un admin exigía redeploy.**

Con el permiso en la base, RLS puede autorizar sola y la pantalla lee con la sesión normal
del usuario. La guarda pasa a estar dentro de Postgres, que es donde están todas las demás
de este proyecto.

**Lo que NO cambia:** no hay login nuevo, ni clave, ni segundo sistema de autenticación. Se
entra con la cuenta de siempre (Google o magic link); la base solo decide qué ve esa cuenta
una vez adentro. Autenticación sigue siendo de Supabase Auth; esto es autorización.

## Tabla, no columna en `profiles`

```sql
CREATE TABLE public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Cada quien ve si él mismo es admin, y nada más: nadie puede listar quiénes
-- son los admins de la plataforma. Alcanza para que el layout de /admin decida
-- si deja pasar o redirige (spec W-083).
CREATE POLICY platform_admins_select_self ON public.platform_admins FOR SELECT
  USING (user_id = auth.uid());
```

**Sin policies de INSERT, UPDATE ni DELETE. A propósito.** Con RLS activada y ninguna
policy de escritura, la tabla es inescribible desde cualquier sesión de usuario: solo entra
por el SQL editor o la service role. No hace falta ningún trigger de guarda porque no hay
puerta que cerrar.

**Por qué no `profiles.is_admin`:** `profiles` ya tiene policy de UPDATE para su propio
dueño. Una columna ahí sería una columna que cualquier usuario puede escribir en su propia
fila con un request armado a mano — se haría admin solo. El spec W-048 ya se topó con esto
exacto y tuvo que agregar un trigger para proteger `sonopolis_pro_hasta`. Una tabla aparte
evita el problema en vez de parcharlo.

## `es_admin()`

```sql
CREATE OR REPLACE FUNCTION public.es_admin(p_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = p_user);
$$;
```

`SECURITY DEFINER` acá es necesario y seguro, al revés que en W-048: la función solo
**lee** una tabla que ninguna sesión puede escribir, y no toma ninguna decisión a partir de
`auth.role()` — el mismo molde que `event_role_of` del spec 033.

## El monto vive en SQL, no en JS

```sql
CREATE OR REPLACE FUNCTION public.monto_a_transferir(p_event uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- `tickets.monto` es el total de la compra con el 10% de recargo adentro
  -- (RECARGO_PLATAFORMA, sonopolisWeb/libs/mappers.js). Se le quita compra por
  -- compra y no a la suma: redondear una sola vez al final arrastra el error de
  -- todas las compras a un solo número.
  SELECT COALESCE(SUM(ROUND(monto / 1.10)), 0)::integer
    FROM public.tickets
   WHERE evento_id = p_event AND status = 'completed';
$$;
```

**Por qué en SQL y no en JS**, que era el diseño original de W-085: el mismo número lo
necesitan la pantalla (para mostrarlo) y la escritura (para congelarlo en `monto_pagado`).
Dos implementaciones de la misma fórmula es la manera de que un día devuelvan distinto. En
SQL hay una sola, y la escritura no puede desviarse de lo que se mostró.

## Leer y marcar, con la sesión del admin

```sql
-- Lectura: el admin ve todas las filas; el owner sigue viendo la suya (spec 073).
CREATE POLICY event_payouts_select_admin ON public.event_payouts FOR SELECT
  USING (public.es_admin());

CREATE POLICY event_payouts_update_admin ON public.event_payouts FOR UPDATE
  USING (public.es_admin()) WITH CHECK (public.es_admin());
```

### El trigger del spec 073 tiene que aflojar

`event_payouts_guard_estado` (spec 073, **ya aplicado**) hoy dice: si `current_user` no es
`service_role`, nadie toca las columnas de estado. Con este spec el admin escribe con su
propia sesión, que entra como `authenticated` — o sea, el trigger lo bloquearía.

Esto **supera esa decisión puntual del spec 073**, que no se edita: la condición pasa a ser
"service role **o** admin de plataforma".

```sql
CREATE OR REPLACE FUNCTION public.event_payouts_guard_estado()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user <> 'service_role' AND NOT public.es_admin() THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.pagado_at IS DISTINCT FROM OLD.pagado_at
       OR NEW.pagado_por IS DISTINCT FROM OLD.pagado_por
       OR NEW.monto_pagado IS DISTINCT FROM OLD.monto_pagado THEN
      RAISE EXCEPTION 'El estado de pago lo marca Sonópolis, no el organizador';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
```

El organizador sigue bloqueado exactamente igual: lo que se abre es el admin, no el dueño.

### `marcar_pago_evento(p_event)`

```sql
CREATE OR REPLACE FUNCTION public.marcar_pago_evento(p_event uuid)
RETURNS public.event_payouts LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public AS $$
DECLARE fila public.event_payouts;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo un admin de Sonópolis marca un pago';
  END IF;

  -- Idempotente: dos clicks seguidos en un botón que tarda no pueden pisar
  -- `monto_pagado` con un número recalculado más tarde.
  SELECT * INTO fila FROM public.event_payouts WHERE event_id = p_event;
  IF fila.status = 'pagado' THEN RETURN fila; END IF;

  UPDATE public.event_payouts
     SET status       = 'pagado',
         pagado_at    = now(),
         pagado_por   = auth.uid(),
         monto_pagado = public.monto_a_transferir(p_event)
   WHERE event_id = p_event
  RETURNING * INTO fila;
  RETURN fila;
END $$;
```

**El monto no se recibe como parámetro**: es el registro de lo que se transfirió, y un
valor que viaja desde el cliente es un valor que se puede editar. Lo calcula la misma
función que lo mostró.

## Cómo se concede el acceso

Una vez, en el SQL editor de Supabase:

```sql
insert into platform_admins (user_id)
select id from auth.users where email = 'victor.leon.llanten@gmail.com';
```

Se guarda el `user_id` y no el correo porque el correo puede cambiar y el id no; se concede
buscando por correo porque es lo que uno tiene a mano.

## Criterios de cierre

1. `supabase db push` aplica sin error.
2. Un usuario cualquiera hace `select * from platform_admins` → 0 filas (ni la suya, si no
   es admin). Un `insert` sobre esa tabla → rechazado por RLS.
3. Antes del `insert` de arriba, `select es_admin()` → `false`. Después → `true`.
4. Siendo admin, `select * from event_payouts` trae las filas de eventos ajenos.
5. Siendo admin, `select marcar_pago_evento('<id>')` marca y congela el monto; llamarla de
   nuevo devuelve la misma fila sin cambiar `pagado_at`.
6. Siendo owner no-admin, un `update` sobre las columnas de estado sigue reventando con la
   excepción del trigger.

## Lo que este spec NO hace

- No agrega login, clave ni segundo sistema de autenticación.
- No modela más de un tipo de admin. Hay admin o no hay; si algún día hace falta "puede ver
  pero no marcar", eso es una columna de rol en esta tabla y otro spec.
