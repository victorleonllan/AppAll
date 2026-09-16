# Spec 089 — Entorno local: la base reconstruida desde migraciones, antes de tocar producción

> Estado: **propuesto** (16-sep-2026)
> Capa: INFRA (no toca esquema ni código de la app). `supabase/config.toml` si hace falta ajuste.
> Depende de: nada. **Bloquea a los specs 090, 091, 092 y 093** — los cuatro arreglos de
> seguridad que salieron del Security Advisor, que no deben aplicarse a ciegas contra
> producción.

> **En una frase:** hoy no existe forma de probar una migración sin correrla contra la base
> de producción, y los tres specs de endurecimiento que vienen pueden romper la app entera si
> se equivocan — así que primero se levanta un Postgres local con las 88 migraciones
> aplicadas desde cero, y recién ahí se prueban.

## El problema

Todas las migraciones del repo se aplicaron directo contra `xluinfihjjtxkglihxqz`. El propio
README lo registra spec tras spec: "aplicado en producción", "verificado por RPC contra
producción", "verificado con una transacción revertida". Eso funciona mientras el cambio sea
aditivo — una columna nullable, una función nueva. Los specs 090-093 no lo son: **revocan
permisos**. Un `REVOKE` de más y la cartelera deja de leerse, o nadie puede crear un evento,
y el error aparece en el cliente, no en la migración, que corre verde.

El precedente está en el propio repo: el **spec 046** descubrió al aplicar que
`_reservar_ticket_shared`, `claim_guest_tickets` y `set_my_role` eran ejecutables por
`anon`/`authenticated` de más, porque el `REVOKE FROM PUBLIC` del archivo no alcanzaba contra
el grant por defecto de Supabase. Ese hallazgo costó dos bugs en producción. El spec 093 toca
exactamente ese mecanismo, pero sobre 31 funciones a la vez.

Hoy `supabase start` no corre en el Mac: **no hay ningún runtime de contenedores instalado**
(`docker`, `colima`, `podman`, `orbstack` — ninguno responde). El CLI está en 2.115.0 y el
proyecto tiene `config.toml` con `major_version = 17`, que coincide con producción (17.6.1.127):
el entorno local reproduce la misma versión de Postgres, no una aproximada.

## Decisión 1 — OrbStack como runtime, no Docker Desktop

`supabase start` necesita un demonio compatible con Docker. En un Mac, **OrbStack** arranca en
segundos y consume del orden de cientos de MB en reposo; Docker Desktop arranca en decenas de
segundos y reserva GB de RAM de forma permanente. Los dos exponen el mismo socket, así que el
CLI de Supabase no distingue cuál está debajo — no hay lock-in en la elección.

```bash
brew install orbstack     # una vez
open -a OrbStack          # arranca el demonio
docker info               # debe responder sin error
```

Si Victor ya usa Docker Desktop en Windows y prefiere el mismo en Mac, `brew install --cask
docker` sirve igual y el resto del spec no cambia.

## Decisión 2 — la base local se reconstruye desde cero, no se clona producción

`supabase db reset` borra el Postgres local y **corre las 88 migraciones en orden desde la
primera**. Es la diferencia que importa: clonar producción con un dump probaría contra el
estado actual, que ya trae el drift que los specs 045 y 086 tuvieron que corregir a mano.
Reconstruir desde migraciones prueba **la cadena**, que es lo que el próximo entorno (una
base nueva, un colaborador, un restore) va a ejecutar.

```bash
cd ~/projects/AppAll
supabase start            # postgres 17 en :54322, API en :54321, Studio en :54323
supabase db reset         # aplica supabase/migrations/*.sql en orden, desde vacío
```

Que `db reset` termine sin error ya es un criterio de valor propio: verifica que la cadena de
migraciones reconstruye, algo que hoy nadie comprueba salvo cuando algo se rompe.

**Sin `seed.sql`, a propósito.** La carpeta `supabase/` no tiene uno y este spec no lo crea:
sembrar datos de prueba es un problema aparte (el spec 011 ya lo trató) y los criterios de
090-093 se verifican con permisos y catálogos del sistema, no con filas. Cuando un spec
necesite datos, los inserta en una transacción que revierte, como ya hizo el 088.

## Decisión 3 — el linter corre local, y es el mismo que el del Advisor

El panel de Supabase dice al pie que sus sugerencias las genera **splinter** (Supabase
Postgres LINTER). El CLI trae el mismo linter:

```bash
supabase db lint --level warning          # contra la base local
supabase db lint --level warning --linked # contra producción, para comparar
```

Esto es lo que convierte a los cuatro specs en verificables sin abrir el navegador: se cuenta
el warning antes, se aplica la migración, se cuenta después. Si la cuenta local no coincide
con la de producción (57 warnings al 16-sep-2026), la diferencia es drift entre la cadena de
migraciones y la base real — y eso es un hallazgo, no un estorbo: anotarlo en este spec.

## Decisión 4 — probar con las tres llaves, no solo con `postgres`

`supabase start` imprime al arrancar una `anon key` y una `service_role key` locales, y el
Postgres local acepta conexión directa como superusuario. **Los tres caminos ven permisos
distintos**, y esa diferencia es justamente lo que los specs 090-093 modifican:

| Camino | Cómo se prueba | Qué revela |
|---|---|---|
| `postgres` por `psql` | `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres` | El catálogo: `pg_proc`, `proacl`, `pg_policies`. Salta RLS — nunca prueba un permiso por sí solo |
| `anon` por PostgREST | `curl -H "apikey: <anon>" http://127.0.0.1:54321/rest/v1/...` | Lo que ve el público sin sesión. Es el rol que importa en 091, 092 y 093 |
| `authenticated` | Un JWT firmado con el secret local, o un usuario creado en Studio | Lo que ve un usuario con sesión. El rol que 093 puede romper |

Un criterio de cierre que solo se verificó como `postgres` no verificó nada: ese rol atraviesa
RLS y tiene todos los grants. El spec 046 falló exactamente por ahí.

## Lo que este spec no toca

- **Las Edge Functions.** `create-preference`, `webhook-mp`, `confirm-payment` y
  `reconciliar-pagos` hablan con Mercado Pago, que no tiene equivalente local. `supabase
  functions serve` las levanta, pero probar el cobro sigue siendo contra el sandbox de MP.
  Ninguno de los specs 090-093 las toca.
- **Producción.** Nada de este spec corre contra `xluinfihjjtxkglihxqz`, salvo el
  `db lint --linked` de la decisión 3, que es de solo lectura.
- **El flujo de trabajo de specs.** Sigue vigente: DATOS de a uno. Este spec habilita una
  prueba previa, no un atajo para aplicar dos migraciones a la vez.

## Criterios de cierre

1. `docker info` responde sin error en el Mac.
2. `supabase start` levanta y devuelve las URLs y llaves locales.
3. `supabase db reset` aplica las 88 migraciones desde cero **sin un solo error** — o, si
   falla, el error queda anotado acá como hallazgo (sería la primera evidencia de que la
   cadena no reconstruye).
4. `supabase db lint --level warning` contra local devuelve un listado comparable al de
   producción. La diferencia entre ambas cuentas queda anotada en este spec.
5. Una consulta como `anon` contra la API local devuelve la cartelera pública (prueba de que
   PostgREST y RLS locales funcionan como en producción, antes de tocar ningún permiso).
