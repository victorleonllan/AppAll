# Spec 104 — Cada país cobra con una o más pasarelas, y cada ticket recuerda con cuál se pagó

> Estado: **propuesto**.
> Capa: DATOS. `supabase/migrations/20261003120000_spec_104_pasarelas_por_pais.sql`.
> Depende de: spec 100 (`paises_cobro`, `tickets.pais_cobro`, `_reservar_ticket_shared` con la
> guarda de país), spec 088 (reserva que caduca), spec 046 (wrappers con sesión e invitado).
> Alimenta: spec 105 (Flow en las Edge Functions), `sonopolisWeb/specs/w189-logica-pagar-con-flow.md`,
> `w190-frontend-elegir-pasarela-al-comprar.md`.

> **En una frase:** hoy "el país cobra" significa "el país cobra con Mercado Pago"; este spec
> separa las dos cosas con una tabla `pasarelas_cobro` (qué pasarelas tiene activas cada
> país), y estampa en cada ticket la pasarela con la que se pagó, para que la confirmación y
> la reconciliación le pregunten a la pasarela correcta.

## Motivo

Decisión de Victor: integrar **Flow** (pasarela chilena que también opera en México) con
esta regla:

- **Chile:** Mercado Pago y Flow **a la vez**. El comprador elige con cuál paga.
- **México:** solo Flow. La cuenta mexicana de Mercado Pago no existe.

El esquema no tiene dónde decir eso. `paises_cobro` (spec 100) responde una sola pregunta:
¿este país vende? La pasarela está implícita: es Mercado Pago, porque no había otra. Y un
ticket no dice con qué se pagó, así que `confirm-payment` y la reconciliación no sabrían a
qué API preguntarle por un ticket de Flow.

## Decisión 1 — tabla `pasarelas_cobro`: qué pasarelas tiene cada país

```sql
CREATE TABLE public.pasarelas_cobro (
  pais      char(2)  NOT NULL REFERENCES public.paises_cobro(pais),
  pasarela  text     NOT NULL CHECK (pasarela IN ('mercadopago', 'flow')),
  activo    boolean  NOT NULL DEFAULT false,
  orden     smallint NOT NULL,
  PRIMARY KEY (pais, pasarela)
);
```

Semilla:

| pais | pasarela | activo | orden |
|---|---|---|---|
| CL | mercadopago | **true** | 1 |
| CL | flow | false | 2 |
| MX | flow | false | 1 |

- `orden` es el orden en que la web muestra las opciones. Mercado Pago va primero en Chile
  porque es la que ya cobró de verdad.
- **Flow entra apagado en los dos países.** Encenderlo es una migración de una línea por
  país, después de que el spec 105 esté desplegado y sus secrets cargados (ver "Cómo se
  enciende Flow"). Encendido a mano no: lo que decide cómo se cobra tiene que quedar en el
  historial, igual que `paises_cobro` (spec 100) y `event_sources` (spec 081, D1).
- `paises_cobro.activo` **no cambia de sentido**: sigue siendo el interruptor maestro del
  país. Un país vende si `paises_cobro.activo` **y** tiene al menos una pasarela activa.
  México sigue con `activo = false`: tener Flow no resuelve los datos bancarios del creador
  mexicano (pendiente #30 de la web, CLABE).
- **RLS:** habilitado. `SELECT` para `anon` y `authenticated`: la web lee la tabla sin sesión
  para mostrar las opciones de pago. Sin policies de escritura.

**Por qué tabla aparte y no una columna `pasarelas text[]` en `paises_cobro`:** cada par
país-pasarela tiene su propio estado (`activo`) y su orden. Prender Flow en Chile sin tocar
Mercado Pago es un `UPDATE` de una fila, no reescribir un arreglo.

**Descartado — elegir la pasarela por evento u organizador:** Victor pidió que en Chile
estén las dos a la vez para el comprador. Que la decida el organizador es otro producto. Si
algún día se pide, es una columna nueva en `events` y un spec propio.

## Decisión 2 — `tickets.pasarela`: la foto de con qué se cobró

```sql
ALTER TABLE public.tickets ADD COLUMN pasarela text
  CHECK (pasarela IN ('mercadopago', 'flow'));
UPDATE public.tickets SET pasarela = 'mercadopago';
ALTER TABLE public.tickets ALTER COLUMN pasarela SET NOT NULL;
```

- Backfill `mercadopago`: todo ticket existente se creó con `create-preference`, la única
  vía de venta hasta hoy. Es un hecho, no un default de conveniencia.
- **Sin DEFAULT**, por la misma razón que `tickets.pais_cobro` (spec 100): la única vía de
  escritura es `_reservar_ticket_shared`. Si alguien inserta por otro lado, tiene que
  fallar, no inventar Mercado Pago.
- `tickets.preference_id` y `tickets.payment_id` **no se renombran**. `preference_id` ya
  guarda la referencia propia (`ticket_ref`, UUID generado antes de hablar con la
  pasarela, spec 072) y sirve igual para Flow, como su `commerceOrder`. `payment_id`
  guarda el id del pago en la pasarela: el de MP, o el `flowOrder` de Flow. Renombrarlas
  rompería la app nativa y cuatro Edge Functions sin ganar nada.

## Decisión 3 — la reserva recibe la pasarela, la valida y la estampa

`_reservar_ticket_shared` gana el parámetro `p_pasarela text`:

1. Después de la guarda de país (spec 100), una segunda guarda:
   ```sql
   IF NOT EXISTS (SELECT 1 FROM public.pasarelas_cobro
                   WHERE pais = v_evento.pais AND pasarela = p_pasarela AND activo) THEN
     RAISE EXCEPTION 'pasarela_inactiva: % no cobra en %', p_pasarela, v_evento.pais;
   END IF;
   ```
   Es la guarda que importa: aunque una Edge Function tenga un bug, no nace un ticket de
   Flow en un país donde Flow está apagado.
2. El `INSERT` agrega `pasarela = p_pasarela`.

El resto (aforo, preventa, email, moneda, `pais_cobro`) queda idéntico. El `CREATE` parte
de la definición vigente en producción (`pg_get_functiondef`), no de este texto.

**Cambio de firma = DROP + CREATE, no `CREATE OR REPLACE`.** Agregar un argumento con
`CREATE OR REPLACE` crea una **sobrecarga**: quedan dos funciones con el mismo nombre y
PostgREST no sabe cuál llamar (ya pasó con el RPC de W-103). Por eso:

- `DROP FUNCTION public._reservar_ticket_shared(uuid, integer, text, uuid, text);` y se
  crea con 6 argumentos. El `REVOKE … FROM anon, authenticated` se repite: el DROP se lleva
  los grants.
- Los wrappers públicos se recrean igual, con el argumento nuevo **al final y con DEFAULT**:
  - `reservar_ticket_pending(p_evento_id uuid, p_cantidad integer, p_preference_id text, p_pasarela text DEFAULT 'mercadopago')`
    — `GRANT EXECUTE … TO authenticated`.
  - `reservar_ticket_pending_guest(p_evento_id uuid, p_cantidad integer, p_preference_id text, p_email text, p_pasarela text DEFAULT 'mercadopago')`
    — `GRANT EXECUTE … TO anon, authenticated`.

**Por qué el DEFAULT:** `create-preference` en producción llama a `reservar_ticket_pending`
con tres argumentos con nombre. Entre el `db push` de este spec y el deploy del 105, esa
llamada tiene que seguir funcionando sin tocar la función. Con el DEFAULT sigue vendiendo
con Mercado Pago, que es lo correcto: es la única pasarela activa hasta que se encienda
Flow.

## Decisión 4 — `precio_vigente_de` no cambia

La web lee `pasarelas_cobro` directo, igual que lee `paises_cobro` (W-168). Sumarle las
pasarelas a `precio_vigente_de` obligaría a un `DROP` + `CREATE` de una función que usan la
web, la app nativa y `create-preference`, solo para ahorrar una consulta. `se_vende` sigue
mirando `paises_cobro.activo`.

**Invariante que este spec deja escrito:** un país con `paises_cobro.activo = true` tiene
al menos una fila activa en `pasarelas_cobro`. Si se rompe, `se_vende` dice que sí, pero
toda reserva falla con `pasarela_inactiva`. No se fuerza con un trigger (dos tablas que se
cambian solo por migración y casi nunca): se verifica en los criterios y en cada migración
que toque cualquiera de las dos.

## Cómo se enciende Flow (no es parte de este spec)

**Chile**, cuando el spec 105 esté desplegado y la cuenta chilena de Flow cargada:

1. `supabase secrets set FLOW_API_KEY_CL=… FLOW_SECRET_KEY_CL=…` (spec 105, Decisión 1).
2. Un spec DATOS de una línea:
   `UPDATE public.pasarelas_cobro SET activo = true WHERE pais = 'CL' AND pasarela = 'flow';`

**México** necesita además, y antes:

1. Cuenta de Flow México. Flow pide estar activo en el SAT y una constancia de situación
   fiscal.
2. Los datos bancarios del creador mexicano (CLABE): pendiente #30 de la web.
3. Un spec DATOS que encienda las dos filas: `paises_cobro` MX y `pasarelas_cobro` MX/flow.

## Trabajo

`supabase/migrations/20261003120000_spec_104_pasarelas_por_pais.sql`, en este orden y en
una sola transacción:

1. `CREATE TABLE pasarelas_cobro` + semilla + RLS + policy `SELECT` pública.
2. `tickets.pasarela`: columna, backfill y `NOT NULL`.
3. `DROP` de `reservar_ticket_pending(uuid, integer, text)`,
   `reservar_ticket_pending_guest(uuid, integer, text, text)` y
   `_reservar_ticket_shared(uuid, integer, text, uuid, text)` (primero los wrappers, que
   dependen de la compartida).
4. `CREATE` de `_reservar_ticket_shared` (6 argumentos, Decisión 3) + `REVOKE`.
5. `CREATE` de los dos wrappers con `p_pasarela … DEFAULT 'mercadopago'` + sus
   `REVOKE ALL … FROM PUBLIC` y `GRANT` (los mismos de hoy).

## Criterios de aceptación

1. `select * from pasarelas_cobro order by pais, orden` devuelve las 3 filas de la semilla.
2. `select count(*) from tickets where pasarela is null` = 0, y
   `select distinct pasarela from tickets` = `mercadopago`.
3. `select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname in
   ('_reservar_ticket_shared','reservar_ticket_pending','reservar_ticket_pending_guest')`
   devuelve **una** fila por nombre (sin sobrecargas), con el argumento nuevo.
4. Dentro de una transacción revertida, con la sesión de un usuario: llamar a
   `reservar_ticket_pending` con 3 argumentos sobre un evento chileno crea un ticket con
   `pasarela = 'mercadopago'`; con `p_pasarela => 'flow'` falla con `pasarela_inactiva`.
5. `anon` no puede ejecutar `_reservar_ticket_shared` ni `reservar_ticket_pending`, y sí
   `reservar_ticket_pending_guest`.
6. Invariante: `select pais from paises_cobro pc where activo and not exists (select 1 from
   pasarelas_cobro p where p.pais = pc.pais and p.activo)` devuelve 0 filas.

## Fuera de alcance

- Las Edge Functions de Flow y el reparto por pasarela en `confirm-payment` y la
  reconciliación: spec 105.
- El selector de pasarela en la web: `sonopolisWeb` W-189 (lógica) y W-190 (frontend).
- Encender Flow en cualquier país, y encender México.
- La app nativa: hoy no se agrega Flow ahí. Sigue llamando a los wrappers con 3 argumentos
  y vende con Mercado Pago por el DEFAULT.
