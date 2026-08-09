# Pendientes — specs propuestos

> Inventario de todo lo detectado y **no** corregido, al 2026-08-08.
> Cada sección es un spec candidato. Se trabajan de a uno; el orden importa.
>
> Los specs 018, 019 y 020 ya están aplicados y desplegados.
> El **021** está escrito y aplicado en disco, pendiente de desplegar y verificar.
> El **028** está escrito y bloqueado por la API key de Resend.

## Orden sugerido

```
028 (Resend) ──▶ 021 (compra) ──▶ 022 (webhook + cupo) ──▶ 026 (tests)
     │                │                     ▲                   ▲
     │                └──▶ 029 (correo)     │                   │
     │                                      │                   │
     └──▶ DOMINIO PROPIO ──▶ terceros       │                   │
                                            │                   │
023 (borrado) ──▶ 024 (entorno local) ──────┼───────────────────┘
       │                                    │
       └──▶ 025 (respaldo)                  │
                                            │
030 (dashboard banda)   ─┐                  │
031 (dashboard local)   ─┴── aforo ─────────┘
```

**028 pasó a ser el primero.** El magic link es el único camino de compra, y el mailer de
Supabase tope en **2 correos por hora** ya bloqueó una sesión de pruebas real
(`429 over_email_send_rate_limit`, 8-ago). Con ese techo no se puede verificar el 021:
cada intento de compra desde cero gasta un correo. Arreglar el correo no es una mejora
paralela, es el prerequisito para poder probar cualquier otra cosa.

**021 sigue siendo el corazón del producto**, y ya está implementado — le falta deploy y
la prueba de punta a punta, que depende del 028.

**023 antes de vender**, porque hoy borrar un local destruye ventas en silencio.

### El bloqueo que no es un spec: el dominio

Resend sin dominio propio solo entrega correo **a la dirección dueña de la cuenta**. Eso
desbloquea el desarrollo, pero deja intacto el bloqueo de negocio: **ningún tercero puede
recibir un magic link, y por lo tanto nadie más que Victor puede comprar una entrada.**

Comprar y verificar un dominio (SPF, DKIM, DMARC en Resend) es **requisito duro del Demo
Day del 23-sep-2026**. No tiene número de spec porque es una compra, no código — pero es
la dependencia de mayor plazo de todo este inventario y la única que no se puede resolver
en una sesión de trabajo. **Es lo que conviene arrancar primero en el calendario.**

---

## Spec 028 — Correo transaccional por Resend 🔴 escrito, bloqueado

**Estado:** spec completo en `028-smtp-resend.md`. **Bloqueado por la API key de Resend.**

**Por qué va primero:** el mailer integrado de Supabase tope en 2 correos/hora y no se puede
subir sin SMTP propio. Ese límite ya rompió una sesión de pruebas
(`429 over_email_send_rate_limit`, 8-ago 05:00 UTC). Las plantillas están detrás del mismo
gate, así que los correos además salen en inglés con el texto por defecto.

Resend es parte del stack recomendado de All In Mexico. Plan gratis: 3.000/mes, 100/día.
Se configura por SMTP plano vía Management API — **no toca código de la app** y no lleva
migración, porque la config de Auth no vive en `supabase/migrations/`.

| Lo que desbloquea | Lo que **no** desbloquea |
|---|---|
| Probar el 021 sin racionar correos | Que un tercero reciba el magic link |
| Correo en español y con la marca | La venta real de entradas |

La segunda columna necesita dominio propio — ver la nota del encabezado.

---

## Spec 029 — Correo de confirmación de compra 🟡

**Por qué:** hoy quien compra una entrada **no recibe ningún comprobante**. La única señal
de que el pago salió bien es la pantalla de confirmación, que se cierra al recargar. No hay
nada que mostrar en la puerta del local.

Es el spec que el 028 aparta explícitamente de su alcance: aquél arregla el correo *de
Auth*, éste agrega el correo *de negocio*.

- Disparo desde `webhook-mp`, cuando el ticket pasa a `completed` — es el único punto que
  sabe con certeza que Mercado Pago confirmó el pago
- Envío por **API de Resend**, no por SMTP: el SMTP del 028 es para Auth, que lo gestiona
  Supabase. Acá el que envía es código nuestro y necesita el error de vuelta
- La plantilla se versiona en `supabase/email-templates/`, igual que el magic link
- Contenido mínimo: artista, local, fecha, hora, cantidad, monto e id del ticket
- Un identificador visible que sirva para validar en la puerta. **Un QR es un spec aparte**:
  exige decidir cómo se valida (¿quién escanea?, ¿con qué?), y eso es producto, no correo
- Idempotencia: el webhook puede recibir la misma notificación más de una vez. Sin guarda,
  el comprador recibe el correo repetido. Se resuelve junto con la idempotencia del **022**

**Depende del 028** (necesita la cuenta de Resend) y del **021** (sin compra que confirmar,
no hay nada que enviar).

---

## Spec 021 — Cerrar el flujo de compra en web 🔴 implementado, sin desplegar

**Estado:** spec completo en `021-cerrar-flujo-compra-web.md`, código aplicado en disco.
Edge Functions desplegadas; **falta el deploy web, el commit y la prueba end-to-end.**

**Por qué:** el flujo nunca se completó una sola vez. Hay 0 tickets en la base, lo que confirma que `create-preference` jamás terminó bien.

⚠️ Al implementarlo aparecieron **tres causas raíz que este inventario no tenía**, cualquiera
de ellas suficiente para romper todo: el cliente se autenticaba con la anon key (401 antes de
llamar a MP), `create-preference` no respondía CORS (el navegador bloqueaba la llamada), y
`monto` quedaba NULL en todo evento creado desde la app (*"Sin precio"*). Detalle en el spec.

| # | Problema | Dónde |
|---|---|---|
| 1 | `back_urls` apuntan a `appall://`, un scheme nativo. En web el navegador no lo resuelve: el usuario paga y queda varado. Además es la marca vieja. | `create-preference/index.ts:44-48` |
| 2 | `auto_return: 'approved'` con una back_url no-HTTP puede hacer que MP **rechace la preferencia al crearla**. | `create-preference/index.ts:49` |
| 3 | El webhook solo escucha `topic=merchant_order`. MP también notifica con `payment`, y en webhooks v2 suele ser el principal. Si llega solo ése, el ticket **nunca** pasa a `completed`. | `webhook-mp/index.ts:15` |
| 4 | El `catch` devuelve **200 incluso cuando falla**. MP lo lee como entregado y **no reintenta**: pago cobrado, ticket en `pending` para siempre. | `webhook-mp/index.ts:47-50` |
| 5 | No hay manejo de pagos rechazados. Solo se actúa si `order_status === 'paid'`; un rechazo deja el ticket colgado sin feedback. | `webhook-mp/index.ts:38` |
| 6 | El polling se rinde a los 30s sin avisar nada. El usuario queda mirando "Verificando pago…". | `ConfirmacionCompraScreen.tsx:62` |

**Criterio de cierre:** una compra completa con tarjeta de prueba, ticket en `completed`, verificado en la base.

---

## Spec 022 — Endurecer webhook y creación de preferencias 🔴

**Por qué:** son los agujeros que importan cuando entre dinero real. Hoy el token es de prueba (cuenta `TESTUSER5133118553056665163`), así que no hay urgencia — pero esto debe estar cerrado **antes** de pasar a producción.

| # | Problema |
|---|---|
| 1 | El webhook no valida la firma `x-signature` de MP. Mitigante: no confía en el payload, vuelve a consultar la orden a la API de MP. Riesgo bajo, pero es buena práctica. |
| 2 | Sin guarda de idempotencia. MP reenvía notificaciones; hoy el `update` es idempotente por casualidad, no por diseño. **Deja de ser inocuo con el 029**: sin guarda, cada reenvío manda otro correo de confirmación al comprador. |
| 3 | `cantidad` llega del body **sin validar**. No hay control de cupo: un `cantidad: 500` crea una preferencia por 500 entradas en un local de 40 lugares. |
| 4 | No hay límite de aforo por evento en ninguna parte del modelo. |

---

## Spec 023 — Ciclo de vida de datos: borrado, soft delete y rol admin 🔴

**Por qué:** hoy no se pueden borrar usuarios, y borrar un local destruye ventas sin avisar.

### El bloqueo

Cuatro FKs contra `auth.users` con `NO ACTION`. Todas las tablas propias de Supabase usan `CASCADE`; estas cuatro no siguieron la convención:

```
profiles.id       → auth.users.id    NO ACTION   ← el que bloquea primero
venues.owner_id   → auth.users.id    NO ACTION
events.created_by → auth.users.id    NO ACTION
tickets.user_id   → auth.users.id    NO ACTION
```

Error real reproducido: `violates foreign key constraint "profiles_id_fkey"`.

**No es una limitación de Supabase.** Es diseño del esquema.

### El peligro silencioso

```
venues ──CASCADE──▶ events ──CASCADE──▶ tickets
```

**Borrar un local elimina sus eventos y todas las entradas vendidas.** Sin advertencia. Hoy no duele (0 tickets), pero es la operación que se pidió como caso de uso.

### La decisión de fondo

Un `DELETE` es irreversible: el plan es **Free**, sin PITR ni restore self-service. Y aunque se restaurara, **la identidad del usuario es su UUID**: si se vuelve a registrar recibe uno nuevo, y el histórico no se reconecta solo.

Por eso, para lo que va a producción: **soft delete + anonimizado**, no borrado físico.

### Lo que falta para el rol admin

- `profiles.role` tiene `CHECK ('public','musician','cafe')` — `'admin'` no es válido todavía
- **No existe ninguna policy `DELETE`** para `venues`, `profiles` ni `tickets`. Hoy nadie puede borrar un local ni una banda vía API, ni siquiera su dueño
- La policy que borramos en el spec 020 se creó con el comentario *"for admin operations"*: la intención era ésta, pero se escribió como acceso universal

### Limpieza asociada

- `musico@prueba.appall` (spec 013) sigue vivo en producción
- Los 3 venues tienen `owner_id = NULL`: nadie puede editarlos, porque `venues_update` exige `auth.uid() = owner_id`

---

## Spec 024 — Entorno local y reproducibilidad 🟡

**Por qué:** hoy todo cambio de esquema va directo a producción sin poder probarse.

- Instalar Docker (Desktop con backend WSL2 si es en `victorwin`)
- `supabase start` y validar la cadena con `supabase db reset`
- ⚠️ **La cadena de migraciones nunca se probó de punta a punta.** El baseline es una reconstrucción razonada, no verificada
- `supabase migration repair --status applied 20260608000000` antes del primer `db push`
- Crear `supabase/seed.sql` (no existe): venues y usuarios de prueba, para que `db reset` deje el entorno usable

Documentación completa en el vault: `Hermes/Agentes/Base de Datos/supabase-local-windows.md`

---

## Spec 025 — Respaldo y recuperación 🟡

**Por qué:** hoy un borrado accidental en producción es irreversible.

- Plan Free: **sin PITR, sin restore self-service**
- Definir dumps periódicos (`supabase db dump`) o evaluar el plan Pro
- Activar `auth_leaked_password_protection` (deshabilitado; se hace desde el dashboard, no por migración)
- Ojo: el plan Free **pausa el proyecto tras ~1 semana de inactividad**. Riesgo concreto de cara al Demo Day del 23-sep-2026

---

## Spec 026 — Tests 🟡

**Por qué:** cero tests en todo el repo. Los specs 016 y 017 fueron bugs encontrados leyendo código, no ejecutándolo — hay más latentes.

Arquitectura ya diseñada por Hermes en el vault: `Hermes/Agentes/Arquitectura Testing/V-Model-Testing.md`

Orden propuesto ahí: unitarios (Jest) → componentes (RNTL) → integración de Edge Functions → E2E (Playwright web / Detox nativo).

**Hacer después del 021**, no antes: escribir tests sobre un flujo roto congela el comportamiento equivocado.

---

## Spec 027 — Verificación en runtime 🟡

**Por qué:** nada de esto se probó ejecutando la app de verdad.

- La app **nunca se abrió en un navegador**. Solo se compiló el bundle, lo cual descarta errores de build pero no de runtime
- **Nativo nunca se probó** — el spec 017 quedó explícitamente con "falta probar en nativo", y la race de doble compra que arregló solo existe ahí
- ~~Hay **0 eventos** en la base~~ → resuelto el 8-ago: se sembró un evento de prueba
  (`b3f2760c`, QuintalClandesta en Quintal Clandesta, $5.000 / monto 5000) para poder
  ejercitar la compra. Sembrarlos de forma reproducible sigue pendiente en el **024**

---

## Spec 030 — Dashboard de banda 🟢 implementado y desplegado, falta verificar en runtime

**Estado:** código aplicado el 2026-08-09. Migración `20260809034408_spec_030_perfil_banda.sql`
**aplicada a producción**. Falta el cierre de punta a punta: los 5 puntos del Criterio de
cierre en `030-dashboard-banda.md` necesitan probar la app con un músico real.

Al aplicar la migración se destapó la brecha que el **024** ya tenía anotada: el baseline
(`20260608000000`) no figuraba como aplicado en el historial remoto de migraciones y
bloqueaba `db push`. Se reparó con `migration repair` (solo metadata, sin tocar DDL) — el
024 sigue abierto como tarea de fondo, esto fue un parche puntual para poder avanzar.

**Por qué:** el perfil del músico son seis campos y no alcanza para que un local decida
contratar. Faltan integrantes, ciudad, duración del show, rider técnico y contacto directo.

Hallazgo de la auditoría: **`tipo_proyecto` es NULL en las 4 filas de `profiles`**. El
formulario nunca se guardó con éxito ni una vez — y no se notó porque las dos ramas del
`try/catch` muestran el mismo `Alert.alert('Guardado', …)`.

Aditivo y de riesgo bajo: no toca el flujo de compra.

### Revisión de código (9-ago-2026), antes de commitear

Corregido:

- **`EditarPerfilBandaScreen`: pérdida de datos si la carga fallaba por causa distinta a
  "sin fila todavía".** El `catch` era único: red caída, RLS o falta de fila caían al mismo
  lugar y dejaban el formulario en blanco, listo para guardar. Guardar sobre eso mandaba un
  upsert con todo en `null` y pisaba el perfil real. Ahora se distingue `PGRST116` (sin fila,
  formulario en blanco es correcto) de cualquier otro error (bloquea el guardado y pide
  reintentar).
- **`integrantes`/`duracionShow` podían mandar `NaN` en silencio.** `parseInt` de un texto no
  numérico da `NaN`, que `?? null` no atrapa (`NaN` no es nullish) y que
  `JSON.stringify` serializa como `null` sin avisar — el dato se perdía sin que nadie lo
  notara. Ahora se valida antes de guardar (rango 1-50 para integrantes, ≥0 para duración) y
  se avisa con `Alert` en vez de guardar en silencio.
- **`VerMusicoScreen` renderizaba un "0" suelto.** `campo && <Text>` deja pasar el 0 (React
  sí lo renderiza); un músico con 0 integrantes o 0 minutos de show mostraría un "0" flotando
  en la tarjeta. Cambiado a `!!campo &&`.
- **`PerfilMusicoScreen`: el efecto de ventas dependía de `misEventos.length`, no del
  contenido.** Borrar un evento y crear otro en la misma sesión deja el mismo largo con IDs
  distintos; el efecto no volvía a correr y la consulta de tickets quedaba pegada a eventos
  viejos. Ahora depende de los IDs concatenados, no del tamaño.

Revisado y dejado para después (no bloquea este commit, cada uno es su propio spec):

- **`VerMusicoScreen` nunca lee `profiles` de Supabase**, solo `musicosMock`. Todo lo que un
  músico guarda en `EditarPerfilBandaScreen` es invisible para el local que lo está viendo —
  la mitad de escritura del spec 030 quedó cableada, la mitad de lectura que importa (con qué
  decide un local) no.
- **Tercera implementación del patrón mock-fallback.** `VenuesContext` y `EventosContext` ya
  centralizan "Supabase o cae a mock"; `PerfilMusicoScreen.cargarPerfil` es una tercera copia
  suelta en un componente. El próximo fix a ese patrón hay que aplicarlo tres veces.
  `EditarPerfilBandaScreen` es camino aparte: hoy correcto (no debe caer a mock nunca, mock no
  tiene sentido en un formulario de edición), pero vale la pena migrarlo al mismo patrón el
  día que exista `ProfileContext`.
- **`TIPOS_PROYECTO` (TS, en `src/lib/profiles.ts`) y el `CHECK` de la migración** son dos
  listas mantenidas a mano por separado — agregar un tipo de proyecto nuevo exige tocar los
  dos sin que nada avise si uno queda atrás.
- **`duracion_show` no tiene `CHECK` en la migración** (a diferencia de `integrantes`,
  1-50). Ya está aplicada a producción; ampliarla es una migración nueva, no un cambio de
  código — se valida solo en cliente por ahora (agregado en esta revisión).
- **`AuthContext` dispara `setSession`/`setUser`/`setRole` en cada `TOKEN_REFRESHED`** (cada
  ~hora), con una referencia nueva de `user` aunque el id no cambie. Como
  `PerfilMusicoScreen` engancha su `useFocusEffect` a `cargarPerfil`, que depende de `user`
  por referencia, cada refresh de token dispara un refetch completo y un flash de spinner de
  pantalla completa aunque la sesión no cambió. Se soluciona comparando `user?.id` antes de
  actualizar estado, o memoizando por id en vez de por objeto — cambio a `AuthContext`, que
  usan todas las pantallas, así que va con su propio spec y pruebas.

---

## Spec 031 — Dashboard de local 🔴 escrito, sin implementar

**Estado:** spec completo en `031-dashboard-local.md`. **Más atrasado que el 030.**

**Por qué:** no existe ninguna pantalla donde el dueño de un local pueda escribir los datos de
su local. El dashboard es de solo lectura y la lista de músicos sale de `musicosMock`.

Tres hechos verificados que se encadenan:

1. **Ningún usuario tiene `role = 'cafe'`** → `CafeStack` nunca se montó. El dashboard no está
   poco avanzado: no lo ha abierto nadie
2. **Los 3 venues tienen `owner_id = NULL`** → `find(v => v.ownerId === user.id)` nunca
   encuentra nada, y `venues_update` los deja inmodificables por API
3. **`createVenue` manda `owner_id: null`** → todo local nuevo nace huérfano y el `catch {}` lo
   reporta como éxito

Se solapa con el **023** por el lado de `owner_id`: si el 023 va primero, el punto 1 del 031 se
reduce. Y aporta `venues.aforo`, que es **el dato que le falta al 022** para el control de cupo.

---

## Spec 032 — Renombrar "café" a "local" en archivos, símbolos y contrato de contexto 🟢

**Estado:** implementado el 2026-08-09 (`032-renombrar-cafe-a-local.md`). `tsc` limpio.
Falta verificar en runtime (abrir la app en web y probar las pestañas "Locales"/"Mi Local").

**Por qué:** el spec 018 cambió el lenguaje visible de la UI ("cafés" → "locales") pero dejó
fuera a propósito el renombrado de archivos y símbolos. Victor notó que persiste "café" en
títulos de archivo y pidió revisar si además hay código obsoleto.

No hay archivos obsoletos — `CafeStack`/`CafesStack` son dos stacks activos, no duplicados —
pero sí apareció código muerto puntual: `VenuesContext` calcula `cafes`/`otherVenues` sin que
ningún componente los consuma.

Puramente de nomenclatura frontend: sin migración, sin dependencias del resto del roadmap.
Puede implementarse en cualquier momento.

---

## Cosas menores, anotadas para no perderlas

- Un deploy de Vercel quedó en estado **Error** (2026-08-06, ~23h antes del deploy actual). Nunca se revisaron sus logs
- El dashboard de Vercel tiene `buildCommand: npm run vercel-build` y output `public`, que no coinciden con el proyecto. Es inocuo porque `vercel.json` los sobrescribe, pero confunde a quien edite desde el dashboard
- `create-preference` usa `currency_id: 'CLP'`. Verificado correcto: la cuenta MP es `site_id: MLC` (Chile)
