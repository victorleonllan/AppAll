# Spec 035 — Fix: login roto por columnas de token NULL en `auth.users`

## Contexto

Victor reportó: no podía entrar al dashboard de músico con `musico@prueba.appall` /
`Test123!`. La app mostraba el error tal cual lo devolvía Supabase, sin más detalle.

## Diagnóstico

El login no fallaba por credenciales — la contraseña era correcta. Fallaba porque
la fila del usuario en `auth.users` está corrupta a nivel de tipos para GoTrue (el
servicio de Auth de Supabase).

Reproducido pegándole directo a la API de Auth con la anon key:

```
POST /auth/v1/token?grant_type=password  {email: musico@prueba.appall, password: Test123!}
→ 500 {"error_code":"unexpected_failure","msg":"Database error querying schema"}
```

Una contraseña incorrecta o un email inexistente devuelven `400 invalid_credentials`
— eso se confirmó aparte con un email al azar. El `500` genérico es la firma de un
error interno, no de una validación fallida.

Con la `service_role` key (obtenida vía `supabase projects api-keys`, sin necesitar
password de la base) se aisló el alcance:

| Operación | Resultado |
|---|---|
| `admin.getUserById` sobre otras 4 cuentas | ✅ funciona |
| `admin.getUserById` sobre `musico@prueba.appall` | ❌ `500 Database error loading user` |
| `admin.listUsers` (sin filtro, la tabla completa) | ❌ `500 Database error finding users` |
| `admin.listUsers?email=musico@prueba.appall` | ❌ `500 Database error querying schema` |

Que **cualquier** lectura de esa fila específica falle —no solo el login, no solo el
filtro por email— apunta a un problema en los datos de la fila, no en la query ni en
las credenciales.

Consultando la base directo (Management API, `POST /v1/projects/{ref}/database/query`,
con el token ya autenticado de `supabase login` — tampoco requirió password de DB):

```sql
SELECT email, confirmation_token IS NULL, recovery_token IS NULL,
       email_change_token_new IS NULL, email_change IS NULL
FROM auth.users WHERE email = 'musico@prueba.appall';
-- true, true, true, true
```

Comparado con `local@prueba.appall` (misma clase de cuenta de prueba, creada el
mismo día, pero que sí loguea): las cuatro columnas están en `''`, no en `NULL`.

**Causa raíz:** GoTrue (el Auth de Supabase, escrito en Go) escanea esas columnas de
`auth.users` como `string`, no como tipo nullable. Un `NULL` en cualquiera de ellas
hace que el `Scan` de Go falle al leer la fila completa, y GoTrue lo devuelve como
`500 unexpected_failure` — sin importar qué operación se pidió. Es un bug conocido
del ecosistema Supabase/GoTrue, no algo específico de este proyecto.

`musico@prueba.appall` quedó así porque se creó con un `INSERT` directo en
`auth.users` (probablemente al sembrar datos de prueba) en vez de vía
`supabase.auth.signUp()`. El default real de esas columnas en la tabla es `NULL`;
la API de Auth las inicializa en `''` al crear el usuario, un INSERT manual no.
`local@prueba.appall` se libró porque se creó por otra vía (o se sembró después,
ya con el valor correcto).

## Solución

Un `UPDATE` que reemplaza `NULL` por `''` en las ocho columnas de token que GoTrue
trata como no-nullable (las cuatro encontradas rotas más las cuatro equivalentes que
no habían dado problema pero comparten el mismo defecto potencial:
`email_change_token_current`, `phone_change`, `phone_change_token`,
`reauthentication_token`).

Aplicado primero a mano en producción sobre la fila puntual
(`id = 3e8bbba0-e2d8-4d06-a723-fdf7bac23d27`) para desbloquear a Victor de
inmediato, y formalizado después en
`supabase/migrations/20260810230333_spec_035_fix_login_tokens_null.sql` — mismo
`UPDATE`, pero con `WHERE ... IS NULL` sobre toda la tabla, para que cualquier otra
cuenta con el mismo defecto (ya sembrada o futura) quede cubierta. Es idempotente:
`COALESCE` no toca una columna que ya es `''`, así que reaplicar la migración no
tiene efecto en las filas sanas.

## Verificación

```
POST /auth/v1/token?grant_type=password  {email: musico@prueba.appall, password: Test123!}
→ 200 {"access_token": "..."}
```

## Criterios de aceptación

- [x] `musico@prueba.appall` / `Test123!` inicia sesión y devuelve `access_token`
- [x] La migración es un no-op sobre las 4 cuentas que ya estaban sanas
- [ ] Ninguna otra cuenta sembrada a mano en el futuro repite el problema (mitigado
      por la migración, pero la prevención real es sembrar siempre vía `signUp()`
      o Admin API, nunca `INSERT` directo en `auth.users`)

## Fuera de alcance

- **Por qué se sembró `musico@prueba.appall` con `INSERT` directo** — no se encontró
  el script que la creó; no está en el repo. Si aparece un script de seed a futuro,
  debe usar `supabase.auth.admin.createUser()` (Admin API) en vez de SQL crudo,
  precisamente para no repetir este defecto.
- **Un test automatizado que detecte cuentas con estas columnas en NULL** — útil
  como chequeo de salud, pero no bloqueaba nada más que este login puntual; queda
  anotado para cuando haya CI.
