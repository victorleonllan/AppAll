# Spec 100 — Cada evento se cobra en la moneda de su país

> Estado: **aplicado en producción** (22-sep-2026) — `20260922120000_spec_100_moneda_por_pais_de_cobro.sql` (`supabase db push --linked`, sin otra migración pendiente). Los 6 criterios verificables por SQL (3, 4, 6, 7) corridos dentro de una transacción revertida contra producción: evento `MX` nace con `moneda = 'MXN'`; `_reservar_ticket_shared` sobre un evento `MX` falla con `pais_sin_cobro`; sobre uno `CL` crea el ticket con `moneda = 'CLP', pais_cobro = 'CL'`; cambiar el país de un evento con un ticket `completed` falla con `pais_con_ventas`, sin ventas sí cambia (y su moneda con él); `precio_vigente_de` de un evento mexicano da `moneda = 'MXN', se_vende = false`. Backfill real: 4 eventos y 54 tickets existentes, todos `CL`/`CLP`. Grants verificados: `precio_vigente_de` ejecutable por `anon`/`authenticated`, `_reservar_ticket_shared` y `events_set_moneda` no. Criterios 1, 2, 5 y 8 verificados por lectura directa (`paises_cobro` con `CL` activo y `MX` inactivo; sin evento fuera de `CL`/`CLP` hoy).
> Capa: DATOS. `supabase/migrations/20260922120000_spec_100_moneda_por_pais_de_cobro.sql`.
> Depende de: spec 080 (`events.pais`), spec 083 (última versión de `precio_vigente_de`),
> spec 088 (última versión de `_reservar_ticket_shared`).
> Habilita: spec 101 (las Edge Functions eligen cuenta y moneda),
> `sonopolisWeb/specs/w167-logica-monto-con-moneda.md`.

> **En una frase:** hoy la base guarda montos sin decir en qué moneda están y el cobro los
> manda siempre como pesos chilenos; este spec le da a cada evento su moneda —derivada de su
> país— y hace que la reserva de una entrada se niegue cuando ese país todavía no tiene una
> cuenta de Mercado Pago que pueda cobrarla.

## El problema

Un evento creado en México con precio `"$500"` recorre hoy este camino:

1. La web deriva `events.monto = 550` (precio + 10% de recargo). El número no dice moneda.
2. `precio_vigente_de` devuelve `monto = 550`, sin moneda.
3. `create-preference` lo manda a Mercado Pago con `currency_id: 'CLP'` fijo en el código.
4. MP cobra **550 pesos chilenos** en la cuenta chilena de producción.

Ningún paso falla: el comprador paga unos 11 pesos mexicanos por una entrada de 500 y nadie
se entera hasta el pago al músico. La causa de fondo es que `monto` es un entero sin unidad:
la moneda vive en el código de la Edge Function, no en el dato.

Además, MP es por país: **una cuenta chilena no puede cobrar en MXN**. Para cobrar en pesos
mexicanos hace falta una segunda cuenta —mexicana— con sus propias credenciales. Eso cambia
la decisión del 2-sep-2026 (nota `problema-cuenta-mp-chile-vs-mexico` del vault), que dejaba
una sola cuenta chilena para toda la tiquetera: sigue valiendo para Chile, pero no alcanza
para México. La cuenta mexicana **todavía no existe**, así que el diseño tiene que poder
aplicarse antes de que exista, sin abrir la venta en México por accidente.

## Decisión 1 — una tabla `paises_cobro`: qué países pueden cobrar y en qué moneda

```sql
CREATE TABLE public.paises_cobro (
  pais    char(2) PRIMARY KEY,
  moneda  char(3) NOT NULL,
  activo  boolean NOT NULL DEFAULT false
);

INSERT INTO public.paises_cobro (pais, moneda, activo) VALUES
  ('CL', 'CLP', true),
  ('MX', 'MXN', false);
```

- **`pais`**: el país donde ocurre el evento (`events.pais`) y, a la vez, el país de la
  cuenta de Mercado Pago que lo cobra. Una cuenta por país porque MP funciona así, no por
  preferencia de diseño.
- **`moneda`**: código ISO 4217, el mismo que MP espera en `currency_id`.
- **`activo`**: si ese país puede vender **hoy**. México entra `false`: la moneda ya se
  conoce (los eventos mexicanos muestran MXN desde ya), pero la venta queda cerrada hasta
  que exista la cuenta mexicana. Encenderla es otra migración (ver "Cómo se enciende México").

Por qué tabla y no una función `CASE pais WHEN 'CL' THEN 'CLP'`: el dato tiene un estado
(`activo`) que cambia con el negocio, y la web necesita leerlo para decirle al músico, antes
de guardar, si su evento se va a poder vender. Una tabla se consulta; una función hay que
llamarla por RPC para cada país.

Por qué no un campo `moneda` elegido por el músico: la moneda no es una preferencia, la
decide la cuenta que cobra. Un músico mexicano que eligiera CLP rompería el cobro igual que
hoy.

Un país que no está en la tabla (Argentina, Perú…) no tiene moneda ni venta. Se puede crear
el evento —la cartelera es difusión— pero no vender entradas.

**RLS:** habilitado. `SELECT` para `anon` y `authenticated` (la web la lee sin sesión para
el formulario y la ficha). Sin policies de escritura: la tabla se cambia solo por migración,
como `event_sources` (spec 081, D1).

## Decisión 2 — `events.moneda`, copia de la tabla puesta por trigger

```sql
ALTER TABLE public.events ADD COLUMN moneda char(3);
```

**Nullable**: `NULL` significa "este país no cobra" (un evento argentino).

La pone un trigger `BEFORE INSERT OR UPDATE OF pais`:

```sql
NEW.moneda := (SELECT moneda FROM public.paises_cobro WHERE pais = NEW.pais);
```

Mismo patrón que `events.pais` respecto del local (spec 080): copia denormalizada. La razón
es práctica: toda la web lee eventos con `select("*")`, así que la moneda llega a cada
tarjeta, ficha y panel sin tocar una sola consulta. Sin la columna, cada lugar que muestra
un precio tendría que cruzar con `paises_cobro`.

`event_preventas` **no** lleva moneda: una preventa se cobra en la moneda de su evento.

**Backfill** en la misma migración: `UPDATE public.events e SET moneda = pc.moneda FROM
public.paises_cobro pc WHERE pc.pais = e.pais;` — los eventos chilenos quedan `CLP`, los
mexicanos que existan quedan `MXN`, el resto `NULL`.

## Decisión 3 — un evento con entradas no cambia de país

El W-114 (D5) permite editar `events.pais`. Con este spec eso cambiaría también la moneda, y
el `monto` de las entradas ya cobradas pasaría a leerse en otra moneda: 5.000 CLP
reinterpretados como 5.000 MXN en el panel de ventas y en el pago al músico.

El mismo trigger, en `UPDATE`, lanza:

```sql
RAISE EXCEPTION 'pais_con_ventas: el evento % ya tiene entradas y no puede cambiar de país', NEW.id;
```

cuando `NEW.pais IS DISTINCT FROM OLD.pais` y existe algún ticket del evento en `pending` o
`completed`. Un evento sin ventas sigue pudiendo corregirse, que es el caso para el que el
W-114 abrió la edición (el músico que cargó mal el país de su gira).

## Decisión 4 — `tickets.moneda` y `tickets.pais_cobro`: la foto del cobro

```sql
ALTER TABLE public.tickets ADD COLUMN moneda char(3);
ALTER TABLE public.tickets ADD COLUMN pais_cobro char(2);
UPDATE public.tickets SET moneda = 'CLP', pais_cobro = 'CL';
ALTER TABLE public.tickets ALTER COLUMN moneda SET NOT NULL;
ALTER TABLE public.tickets ALTER COLUMN pais_cobro SET NOT NULL;
```

Backfill `CLP`/`CL` porque es verdad: todo ticket existente se cobró con la cuenta chilena
en pesos chilenos. Sin default a propósito, como `events.pais` (spec 080): la única vía de
escritura es `_reservar_ticket_shared`, y si un día alguien inserta sin pasar por ella tiene
que fallar, no inventar Chile.

- **`moneda`**: en qué se cobró. Es lo que muestran la entrada, el correo y el panel de
  ventas. Se copia y no se lee del evento porque el evento puede cambiar; lo cobrado, no.
- **`pais_cobro`**: **qué cuenta de MP** creó la preferencia. `confirm-payment` y
  `reconciliar-pagos` tienen que consultar el pago con el token de esa cuenta: un pago de la
  cuenta mexicana no existe para el token chileno, y viceversa (spec 101).

Parecen redundantes y hoy lo son (`CL`↔`CLP`, `MX`↔`MXN`). Se guardan las dos porque
responden preguntas distintas —"¿en qué moneda?" y "¿a qué cuenta le pregunto?"— y la
correspondencia uno a uno se rompe el primer día que dos países compartan moneda (Ecuador y
El Salvador cobran en USD).

## Decisión 5 — `precio_vigente_de` devuelve moneda y si se vende

Nueva firma de retorno:

```sql
RETURNS TABLE (precio text, monto integer, preventa_id uuid, preventa_nombre text,
               restantes integer, cierra_at timestamptz,
               moneda char(3), se_vende boolean)
```

- `moneda` = `v_evento.moneda`.
- `se_vende` = existe fila en `paises_cobro` con `pais = v_evento.pais AND activo`.

Cambia el tipo de retorno, así que va `DROP FUNCTION public.precio_vigente_de(uuid);` +
`CREATE FUNCTION`, y se repiten `REVOKE ALL … FROM PUBLIC` y `GRANT EXECUTE … TO anon,
authenticated` exactamente como en el spec 083. El cuerpo, igual al del 083 más las dos
columnas nuevas en los dos `RETURN QUERY`.

Los dos que la llaman (`create-preference` y `sonopolisWeb/libs/data/preventas.js`) leen
columnas por nombre: dos columnas extra no los rompen, así que esta migración puede
aplicarse antes de desplegar el spec 101 y el W-167.

Es la misma lógica de siempre (spec 065): la base decide cuánto y en qué se cobra, y quien
cobra solo relaya.

## Decisión 6 — la reserva se niega si el país no cobra, y estampa la foto

`CREATE OR REPLACE` de `_reservar_ticket_shared` sobre la versión del **spec 088**
(verificar contra `pg_get_functiondef` en producción antes de escribir, como se hizo en el
083). Dos cambios, nada más:

1. Después de validar el `status` del evento:

   ```sql
   SELECT * INTO v_cobro FROM public.paises_cobro
    WHERE pais = v_evento.pais AND activo;
   IF NOT FOUND THEN
     RAISE EXCEPTION 'pais_sin_cobro: la venta de entradas en % no está habilitada', v_evento.pais;
   END IF;
   ```

2. El `INSERT INTO public.tickets` suma `moneda, pais_cobro` con
   `v_cobro.moneda, v_cobro.pais`.

Esta es la guarda que importa: aunque la Edge Function tuviera un bug, un ticket de un país
sin cuenta activa no puede nacer. Se valida en la base y no solo en `create-preference` por
la misma razón que el aforo (spec 022): es la única vía de escritura.

## Cómo se enciende México (no es parte de este spec)

Cuando exista la cuenta mexicana de Mercado Pago:

1. Cargar en Supabase los secrets de esa cuenta (spec 101, Decisión 1).
2. Un spec DATOS nuevo con una sola línea:
   `UPDATE public.paises_cobro SET activo = true WHERE pais = 'MX';`
3. Antes de ese spec, resolver el pago al creador mexicano: hoy `FormEvento` pide **RUT** y
   **Cuenta RUT** (spec W-082), datos chilenos. Sin CLABE no hay a dónde transferirle al
   músico lo que se cobró. Queda declarado en `PENDIENTES.md`.

Por migración y no a mano por la misma regla de `event_sources` (spec 081, D1): lo que decide
dónde se vende tiene que quedar en el historial del repo.

## Trabajo

Una sola migración, en este orden:

1. `CREATE TABLE paises_cobro` + RLS + policy de `SELECT` + `INSERT` de CL y MX.
2. `events.moneda` + función y trigger (`BEFORE INSERT OR UPDATE OF pais`) con la guarda de
   la Decisión 3 + backfill.
3. `tickets.moneda` y `tickets.pais_cobro` + backfill + `SET NOT NULL`.
4. `DROP` + `CREATE` de `precio_vigente_de` con grants.
5. `CREATE OR REPLACE` de `_reservar_ticket_shared`.

La función del trigger va `SECURITY DEFINER` con `SET search_path = public` (spec 090): la
guarda de la Decisión 3 cuenta tickets del evento, y con los permisos de quien edita la RLS
de `tickets` podría esconderle ventas ajenas (las de un colaborador, spec 038) y dejar
pasar el cambio de país. Como toda `SECURITY DEFINER`, `REVOKE EXECUTE … FROM PUBLIC, anon,
authenticated` **por rol**: revocar solo de `PUBLIC` no alcanza en este proyecto, porque
los grants por defecto de Supabase van a cada rol (lección de los specs 046 y 093).

**Capa DATOS de a una:** antes del `db push`, confirmar que no hay otra migración local sin
pushear (como en el 097: locales = remotas + 1).

## Criterios de aceptación

1. `SELECT * FROM paises_cobro` devuelve `CL/CLP/true` y `MX/MXN/false`.
2. Todo evento con `pais = 'CL'` tiene `moneda = 'CLP'`; con `pais = 'MX'`, `'MXN'`; ningún
   otro país tiene moneda.
3. Insertar un evento con `pais = 'MX'` lo deja con `moneda = 'MXN'` sin mandarla.
4. Cambiar el país de un evento con un ticket `completed` falla con `pais_con_ventas`;
   cambiarlo en uno sin tickets funciona y cambia la moneda.
5. Todo ticket existente queda `CLP`/`CL`; `moneda` y `pais_cobro` son `NOT NULL`.
6. `precio_vigente_de` de un evento chileno devuelve `moneda = 'CLP', se_vende = true`; de
   uno mexicano, `'MXN', false`.
7. `reservar_ticket_pending` sobre un evento mexicano falla con `pais_sin_cobro`; sobre uno
   chileno crea el ticket con `CLP`/`CL`. Probarlo dentro de una transacción revertida, como
   en el 088.
8. Una compra chilena real después del push sigue funcionando igual (la Edge Function vieja
   todavía manda `CLP` fijo, que para Chile es correcto).

## Fuera de alcance

- Las Edge Functions (spec 101) y la web (W-167, W-168).
- Encender México (arriba).
- `montoDesdePrecio` en la app móvil (`src/context/EventosContext.tsx`), que tiene el mismo
  error de 100× que la web: queda en `PENDIENTES.md` para la cadena del 095.
- Sumas que mezclan monedas en consultas SQL (`total_gastado` del CRM): hoy ningún contacto
  compró en dos países. Declarado en `PENDIENTES.md`.
