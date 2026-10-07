# Spec 111 — El dueño de un local o banda se suscribe a Pro desde su panel, sin código del admin

> Estado: diseño (06-oct-2026).
> Capa: DATOS. `supabase/migrations/<timestamp>_spec_111_pro_desde_el_panel.sql`.
> Depende de: spec 110 (`pro_suscripciones`, `pro_cuenta_del_tenant`), spec 100
> (`paises_cobro`).
> Alimenta: spec 112 (`crear-suscripcion-pro` en modo propio) y `sonopolisWeb` W-221/W-222.

> **En una frase:** la cuenta dueña de un local o banda puede crear su propio código de
> suscripción, con el precio que fija la base por país, y si ya tiene uno esperando pago lo
> reusa en vez de crear otro plan en Mercado Pago.

## Motivo

Pedido de Victor (06-oct-2026): la suscripción a Pro iniciada desde el perfil de músico o
local tiene que llevar a Mercado Pago. Hasta el 110 solo el admin genera códigos
(`admin_crear_codigo_pro`), y la tarjeta de Pro del panel dice «escríbenos para activarlo».
Activar Pro a mano desde el admin (`admin_dar_pro`, W-211) sigue igual y no pide pago.

## Decisión

### `paises_cobro.pro_precio_mensual`

```sql
alter table public.paises_cobro add column pro_precio_mensual numeric(12,2)
  check (pro_precio_mensual is null or pro_precio_mensual > 0);
update public.paises_cobro set pro_precio_mensual = 20000 where pais = 'CL';
```

**Por qué en la base y no en el body:** el monto que se cobra no puede venir del navegador
del tenant (lo cambiaría a 1 peso). El admin sí elige monto (pilotos), el tenant no.
`null` = Pro no se vende solo en ese país (hoy MX). 20.000 CLP es el precio que fijó Victor
(addenda de W-216). `config.pro.precioMensual` de la web sigue siendo solo el monto
prellenado del admin.

`paises_cobro` ya se lee con `anon` (policy `paises_cobro_select_publico`, spec 100): la
tarjeta del panel muestra el precio leyendo la misma columna con que se cobra.

### `pro_nuevo_codigo()` (interna)

Saca a una función el generador de 8 caracteres del 110 (alfabeto de 32 sin `0 O 1 I`,
`gen_random_bytes`). Sin grant a nadie. `admin_crear_codigo_pro` **no se toca**: ya está en
producción y funciona; la duplicación del bucle se acepta para no reescribirla.

### `pro_crear_mi_codigo(p_tenant_type text, p_tenant_id uuid)`

→ `table(id uuid, codigo text, pais char(2), moneda char(3), monto numeric, nombre text,
correo_cuenta text, init_point text)`. `security definer`, solo `authenticated`. En orden:

1. Tipo válido y tenant existe (banda = `profiles` con `role = 'musician'`).
2. `auth.uid()` es `pro_cuenta_del_tenant(...)` → si no: «solo la cuenta de este local o
   banda puede suscribirlo».
3. Lock del tenant (`for update` sobre `venues`/`profiles`): dos clics seguidos no crean dos
   códigos.
4. Si hay una fila `activa` o `pausada` del tenant → «ya tienes una suscripción a Sonópolis
   Pro activa».
5. **Reusar:** si hay una fila `esperando` del tenant **con** `init_point`, se devuelve la
   más nueva, se marca `link_pedido_at = coalesce(link_pedido_at, now())` y no se crea
   nada. Incluye las que generó el admin: si Victor le pactó un precio de piloto, gana ese.
6. Si no: precio y moneda de `paises_cobro` del país del tenant (`activo` y
   `pro_precio_mensual` no nulo) → si no: «Sonópolis Pro todavía no se vende en tu país».
7. Inserta la fila `esperando` con `cuenta_id = auth.uid()`, su correo,
   `creado_por = auth.uid()`, y la devuelve con `init_point = null`.

**Por qué reusar y no crear siempre:** cada código es un plan en Mercado Pago. Un tenant
que vuelve al panel tres veces sin pagar dejaría tres planes vivos, y cualquiera de ellos
cobraría si lo abre más tarde.

`link_pedido_at` en el caso 7 lo marca la Edge Function al guardar el plan (spec 112): la
fila todavía no tiene link cuando sale de aquí.

## Criterios de aceptación

En la base local, con claims de sesión en una transacción con `rollback`:

1. Como la cuenta dueña de un local `CL` sin códigos → una fila nueva `esperando`, monto
   20000, `CLP`, `init_point` nulo.
2. Con una fila `esperando` con `init_point` → devuelve esa fila, `link_pedido_at` lleno, y
   no hay fila nueva.
3. Con una fila `activa` → «ya tienes una suscripción…».
4. Como otra cuenta → «solo la cuenta de este local o banda…»; como `anon` → permission
   denied.
5. Un local `MX` → «Sonópolis Pro todavía no se vende en tu país».

## Fuera de alcance

- Renovar antes de que venza un Pro manual: la tarjeta solo ofrece suscribirse sin Pro
  vigente (W-222).
- Cancelar desde Sonópolis: se cancela en Mercado Pago.
