# Spec 025 — Respaldo y recuperación de la base de producción

> Estado: **propuesto** (10-sep-2026)
> Capa: OPERACIÓN — no toca esquema, no genera migración. El único spec de la serie que no
> escribe en la base: solo la lee.
> Depende de: nada. Lo único que necesita es la credencial de producción y la PC `victorwin`.
> Relacionado: el hueco que `PENDIENTES.md` reservó en agosto con este mismo nombre.
> Diseño completo y verificación del estado actual en el vault:
> `02-PROJECTS/Sonópolis/Producto/Datos/plan-respaldo-diversificado-20260908.md`.

> **En una frase:** hoy no existe ninguna copia de los datos de producción — ni una — y el
> plan Free de Supabase no ofrece restauración, así que un `DROP` accidental es definitivo.

## El problema

Medido contra el proyecto remoto el 8-sep-2026 (Management API, solo lectura):

- `pitr_enabled: false` y la lista de backups del proyecto devuelve `[]`. No están escondidos:
  no existen. En Free no hay restore self-service.
- La base pesa **14 MB**: 622 `external_events`, 23 `tickets` con pagos reales, 14 `profiles`,
  14 usuarios en `auth.users`, y un bucket `media` con 14 objetos (4 MB).
- Lo que sí está respaldado es **el esquema**: 53 migraciones en `origin/main`, con el baseline
  reconstruido por introspección (7-ago) y la verificación 18/18 contra producción (15-ago).

**Esa asimetría es el problema.** Con las migraciones se reconstruye la forma de la base —
tablas vacías. Los tickets vendidos, los usuarios registrados y las imágenes subidas no están
en ninguna parte fuera de us-west-2.

Riesgos concretos, no hipotéticos:

1. Un `db push` mal apuntado o un `DROP` desde el SQL Editor no tiene deshacer.
2. El plan Free **pausa el proyecto tras ~1 semana de inactividad** — con el Demo Day del
   23-sep-2026 encima.
3. Todo depende de una sola cuenta, en un solo proveedor, en una sola región.

## Qué se pidió (Victor, 8-sep-2026)

Tres objetivos, y son distintos entre sí:

1. **Recuperar de un desastre** — poder volver al estado de ayer.
2. **Poder irse de Supabase** — que los datos no queden atados al proveedor.
3. **Backup exacto en local, en la PC Windows.**

Más dos condiciones: **automático, sin tocar nada**, y sin definir todavía cuánta pérdida es
tolerable (por eso: diario, y ajustable con una línea del cron).

## Decisión 1 — el respaldo se restaura todas las noches, no solo se archiva

El corazón del spec. En vez de guardar un archivo y confiar, el proceso nocturno **restaura el
dump en un Postgres local en `victorwin`**.

**Por qué:** un dump que nunca se restauró no es un respaldo, es un archivo con extensión
`.sql`. Los modos de falla clásicos —un dump truncado, una versión de `pg_dump` incompatible,
una tabla que quedó fuera por un flag mal puesto— no se ven mirando el archivo: se ven al
intentar cargarlo, que es justo lo que uno hace el peor día posible.

Restaurar cada noche resuelve los tres objetivos con un solo mecanismo:

| Objetivo | Cómo lo cubre |
|---|---|
| Recuperar de un desastre | Copias fechadas hacia atrás, no una que se sobrescribe |
| Irse de Supabase | Si los datos corren en un Postgres puro todas las noches, la portabilidad está **demostrada**, no supuesta |
| Copia exacta en local | La réplica *es* la copia, y se verifica contra producción (Decisión 8) |

## Decisión 2 — corre en el cron de WSL de `victorwin`, con un script bash

No en el Mac: se apaga y se mueve. No como job de Hermes: los jobs de Hermes ejecutan un
prompt interpretado por un modelo, y eso sirve para tareas que requieren criterio —como el
vigía de drift de esquema— pero un respaldo no requiere criterio, requiere correr idéntico
todas las noches. **Un script determinista no puede decidir saltarse un paso.**

Hermes queda como canal de aviso: si el script deja un archivo de error, avisa por WhatsApp.
Es el mismo molde de su backup diario, que ya corre a las 6:05 desde ese cron.

```
02:30  pg_dump (public + auth + storage) → C:\Backups\Sonopolis\YYYY-MM-DD\
02:35  descarga de los objetos del bucket media
02:40  restauración en la base de respaldo local
02:45  verificación de conteos contra producción
02:50  copia cifrada fuera de la PC + limpieza de retención
```

**Silencio = todo bien.** Solo avisa cuando hay algo que hacer; si no, los avisos se vuelven
ruido que se ignora, y un aviso ignorado es peor que ninguno.

## Decisión 3 — Postgres 17 nativo desde PGDG, no Docker

Ubuntu trae Postgres 16 por defecto y **el servidor es 17.6**: un `pg_dump` de 16 falla con
*server version mismatch*. Se instala 17 desde `apt.postgresql.org`, que además deja
`pg_restore` y `psql`.

**Por qué nativo y no Docker:** esto tiene que arrancar solo cada noche durante meses. Docker
Desktop en Windows agrega una capa que puede no estar levantada cuando el cron dispara. El
entorno de desarrollo de `supabase-local-windows.md` sí quiere Docker; este spec no lo
necesita y no debe depender de él.

## Decisión 4 — dos bases separadas en el mismo servidor

`sonopolis_backup` (la réplica de producción) y, si más adelante se monta el entorno de
desarrollo, su base aparte.

**Por qué no una sola:** si se desarrolla sobre la réplica, deja de ser copia fiel; si se
resetea la réplica para probar una migración, se borra el respaldo. Un solo servidor de
Postgres, dos bases con nombres distintos, cero ambigüedad.

Efecto lateral valioso: con la réplica cargada de datos reales al lado, comparar el resultado
de un `db reset` contra ella es la prueba que le falta a la cadena de migraciones desde agosto
("el baseline es una reconstrucción razonada, no verificada").

## Decisión 5 — dos formatos de dump, no uno

- **`.sql` plano** — legible, restaurable con cualquier `psql`, en cualquier Postgres, sin
  depender de la versión de las herramientas ni de Supabase. Es el que sirve al objetivo
  "irme de Supabase".
- **`.dump` custom** (`pg_dump -Fc`) — comprimido y con restauración selectiva
  (`pg_restore -t tickets`). Es el que sirve el día que hay que recuperar **una** tabla sin
  pisar el resto.

Son dos modos de falla distintos y a 14 MB tener ambos no cuesta nada.

## Decisión 6 — qué entra, y qué no puede entrar

Entra: `public` (el negocio), `auth` (los 14 usuarios), `storage.objects` **y los binarios del
bucket** — las filas y los archivos son dos cosas separadas; sin las dos, quedan imágenes rotas.

Sin `auth`, restaurar `public` deja filas apuntando a `user_id` que ya no existen: vuelven los
tickets, no las cuentas de quienes los compraron.

**No entra en el dump y hay que documentarlo aparte:** secretos de Edge Functions, el provider
de Google, las redirect URLs y las claves de Mercado Pago. Ningún `pg_dump` los toca. Se anota
**qué existe y dónde vive, nunca los valores**.

## Decisión 7 — retención 30 diarias + la primera de cada mes, permanente

Los diarios cubren el error que se detecta rápido. Los mensuales cubren el que se detecta
tarde —"esto se rompió en algún momento de julio"— y cuestan ~15 MB al año.

## Decisión 8 — "exacto" significa verificado, no supuesto

Tras cada restauración el script compara la réplica contra producción: filas por tabla y
usuarios en `auth.users`. Si no coinciden más allá de los minutos de diferencia, el respaldo
se marca sospechoso y avisa.

Sin este paso, "backup exacto" es una creencia. Con él, es un hecho comprobado cada día.

## Decisión 9 — la copia local va en claro; la que sale de la PC, cifrada

El dump contiene emails de compradores y hashes de contraseña de 14 personas reales.

- En el disco de `victorwin`: en claro. Es el objetivo pedido y no sale de la máquina.
- Fuera de la PC (iCloud, por la ruta que Hermes ya usa): cifrada con `age`.

**Por qué sale de la PC igual:** `victorwin` es un punto único de falla conocido — en agosto
2026 casi no arranca. Un respaldo que vive solo ahí muere con la máquina.

La clave privada se guarda fuera del respaldo. Un backup cifrado cuya clave está adentro no es
un backup.

## Criterios de aceptación

- [ ] Postgres 17 (PGDG) instalado en WSL, con `pg_dump`/`pg_restore`/`psql` en el PATH
- [ ] Credencial de producción en WSL con permisos `600`, fuera del vault y fuera de git,
      apuntando al **pooler en modo sesión** (la conexión directa es IPv6-only y en Free no
      hay IPv4)
- [ ] `scripts/backup-sonopolis.sh` versionado (el script va a git; los dumps **nunca**)
- [ ] Una corrida manual completa deja: `.sql`, `.dump`, los 14 objetos del bucket y la base
      `sonopolis_backup` cargada
- [ ] La verificación de conteos coincide con producción tabla por tabla y en `auth.users`
- [ ] El cron dispara solo, dos noches seguidas, sin intervención
- [ ] Un fallo forzado (credencial mal puesta) produce el aviso por WhatsApp
- [ ] La retención borra lo que pasa de 30 días y conserva el mensual
- [ ] La copia que sale de la PC está cifrada y se probó descifrarla
- [ ] **Prueba de fuego:** la app local levanta contra la réplica y Sonópolis funciona. Recién
      ahí el objetivo "poder irse de Supabase" está demostrado

## Fuera de alcance

- **Pérdida cero.** Con respaldo diario el peor caso es perder el día en curso. PITR real es
  plan Pro más add-on; con 23 tickets no se justifica todavía, se revisa cuando el volumen lo
  pida.
- **Self-hosting de producción.** Que `victorwin` reemplace a Supabase es otro proyecto, con
  SMTP, alcance desde internet y fiabilidad de hardware por resolver — evaluado en
  `supabase-local-windows.md`.
- **El entorno de desarrollo local.** Comparte servidor con este spec, pero es otro trabajo.
- **Respaldo de la app, de Vercel o del repo.** Esto es la base y su contenido.
- **`auth_leaked_password_protection`**, que el pendiente original mezclaba acá: es un toggle
  del dashboard, no tiene que ver con respaldo.
