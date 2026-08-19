# Pendientes — specs propuestos

> Inventario de todo lo detectado y **no** corregido, al 2026-08-08.
> Cada sección es un spec candidato. Se trabajan de a uno; el orden importa.
>
> Los specs 018, 019 y 020 ya están aplicados y desplegados.
> El **021** tiene el código completo y verificado contra el repo (2026-08-11); solo falta
> la prueba end-to-end, que depende del 028.
> El **028** está aplicado (2026-08-11) — falta solo confirmar en la bandeja que el correo llegó bien.
> El **042** (login con Google) tiene el código listo, bloqueado por el Client ID/Secret de Google.
> El **048** (rol fan, guest checkout real, seguir) está bloqueado en el aire: **046 y 047 ya
> están aplicados en producción (2026-08-15)**, pero nada en el código de esta app los usa
> todavía — ver la entrada destacada arriba de todo, justo debajo de este bloque.
> El **049** (eventos externos para `sonopolisWeb`) es al revés del 048: el **código está
> completo en `sonopolisWeb`** (specs W-023/W-024, `yarn build` verde) y lo que falta es
> correr la migración acá — ver la entrada destacada, primera de todas.

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

── flujo de entradas con QR (2026-08-10) ──────────────────────────
036 (ticket_items) ──┬──▶ 037 (emisión en webhook) ──┐
                     └──▶ 040 (canje atómico) ───────┤
038 (RLS ventas) ────────────────────────────────────┴──▶ 039 (dashboard) ──▶ 041 (escáner)
```

**028 pasó a ser el primero.** El magic link es el único camino de compra, y el mailer de
Supabase tope en **2 correos por hora** ya bloqueó una sesión de pruebas real
(`429 over_email_send_rate_limit`, 8-ago). Con ese techo no se puede verificar el 021:
cada intento de compra desde cero gasta un correo. Arreglar el correo no es una mejora
paralela, es el prerequisito para poder probar cualquier otra cosa.

**021 sigue siendo el corazón del producto**, y su código ya está completo y desplegado — le
falta solo la prueba de punta a punta, que depende del 028.

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

## 🚨 Spec 049 — Aplicar la migración de eventos externos 🔴 código listo del otro lado, falta correrla acá

**Es al revés de la mayoría de las entradas de este archivo: acá no falta pensar ni
escribir nada, falta ejecutar un archivo que ya existe.**

Pedido desde `sonopolisWeb/specs/w022-datos-eventos-externos.md` (2026-08-19): la web
necesita traer eventos reales de PortalTickets para llenar la cartelera (difusión con
link a la fuente, **sin generar ningún dato de compra**). El spec completo —cada columna,
cada RLS, el porqué de cada decisión— está en `specs/049-eventos-externos-scraping.md`.
La migración ya está escrita: `supabase/migrations/20260819164643_spec_049_eventos_externos.sql`.

**Qué hacer en esta sesión:**

1. Aplicar la migración contra producción (`xluinfihjjtxkglihxqz`) — `supabase db push` o
   el método que uses para el resto de las migraciones de este repo
2. Confirmar contra producción: las dos tablas existen, RLS habilitado, el índice único
   `(source_slug, source_uid)` existe, la fila `portaltickets` está seedeada
3. Marcar los checkboxes de "Criterios de aceptación" en `specs/049-...md` y actualizar su
   línea de `> Estado:`
4. Actualizar la fila del 049 en `specs/README.md` (de "sin aplicar" a "aplicado")

**Del otro lado, en `sonopolisWeb`, no hay nada que tocar.** El pipeline de scraping
(spec W-023) y la Cartelera (spec W-024) ya están escritos, con `yarn build` verde,
esperando solo que `external_events` exista. En cuanto la migración corra, probar
`GET /api/cron/scrape` en local (necesita `SUPABASE_SERVICE_ROLE_KEY` y opcionalmente
`CRON_SECRET` en `.env.local` de ese repo) y mirar la Cartelera con eventos reales.

## 🚨 Spec 048 — Lógica y frontend para rol fan, guest checkout y seguir 🔴 datos aplicados, código sin empezar

**La base de datos ya cambió, el código de esta app todavía no.** Los specs 046 (rol
`fan`, rename `cafe`→`local`, guest checkout, claim por email) y 047 (seguir músicos y
locales) están **aplicados en `xluinfihjjtxkglihxqz`** desde el 2026-08-15 — `profiles.role`
ya es `{fan, musician, local}`, `reservar_ticket_pending_guest`, `set_my_role` y las tablas
`follows_musicians`/`follows_venues` ya existen y fueron verificados contra producción.

**Nada en `src/` los usa todavía.** Cuatro archivos siguen comparando contra los roles
viejos (`'cafe'`, `'public'`) — funcionan hoy solo porque `handle_new_user()` acepta
`'cafe'` como alias, pero es deuda que ya no tiene excusa (spec 032 la dejó abierta *porque*
la base seguía diciendo `'cafe'`; ya no es el caso). El spec completo, con líneas exactas y
los tres cambios (rename de roles, guest checkout real en `create-preference` +
`DetalleEventoScreen`, seguir + dashboard del fan en `PerfilScreen`), está en
`specs/048-logica-fan-guest-checkout-frontend.md`.

**Retomar acá cuando se vuelva a esta app** — quedó pausado a propósito el 2026-08-15
porque Victor pasó a trabajar en `sonopolisWeb` (que ya no necesita nada de este spec: su
frontend ya decía `'fan'`/`'local'` antes de que la base migrara).

---

## Spec 028 — Correo transaccional por Resend 🟢 aplicado (2026-08-11)

**Estado:** aplicado vía Management API (`PATCH /v1/projects/xluinfihjjtxkglihxqz/config/auth`,
3 llamadas: SMTP, límites, plantilla). Verificado por `GET` posterior — los 6 campos SMTP,
`rate_limit_email_sent: 30`, `smtp_max_frequency: 20` y el asunto/contenido en español quedaron
guardados. Un `POST /auth/v1/otp` de prueba devolvió `200 {}`, sin `429`.

**Actualización — el primero cayó en spam, ya resuelto.** El correo con
`onboarding@resend.dev` llegó a la carpeta de spam de Gmail: síntoma esperado de mandar
desde el dominio compartido de Resend sin DMARC/SPF alineados a la marca. `sonopolis.org`
ya estaba comprado y **verificado** en Resend (Victor lo dio de alta aparte), así que se
adelantó la *Ruta a producción* del spec: `smtp_admin_email` ahora es
`no-reply@sonopolis.org`. **Victor confirmó (2026-08-11) que con el dominio propio ya no
cae en spam.**

⚠️ **Hallazgo de la API, no del dominio:** el primer intento de cambiar solo
`smtp_admin_email` (un PATCH con ese único campo) **borró todo el grupo SMTP** —
`smtp_host`/`port`/`user`/`sender_name` volvieron a `null`, y de paso `rate_limit_email_sent`
volvió a 2 y la plantilla al default en inglés. El endpoint no hace merge parcial de este
grupo de campos: **hay que mandar los 6 juntos siempre**, igual que la config inicial.
Se corrigió reenviando el set completo. Detalle en `028-smtp-resend.md`.

⚠️ `smtp_max_frequency` quedó en 20s (era 60s) — recordatorio del propio spec: volver a 60
antes del Demo Day, es un freno anti-abuso.

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

## Spec 042 — Login con Google (OAuth) 🔴 código listo, bloqueado

**Estado:** spec completo en `042-google-oauth-login.md`. `AuthContext.signInWithGoogle`
y el botón en `LoginScreen` ya están en el repo, `tsc` limpio. **Bloqueado por el Client
ID/Secret de Google Cloud Console** — sin eso el provider no está habilitado en
Supabase Auth y el botón devuelve error.

**No depende del 028 ni lo reemplaza.** Resend es el SMTP de los correos de Auth;
Google es un provider de login aparte, sin relación con el envío de correo.

**Hueco a propósito, fuera de este spec:** un usuario nuevo que entra por Google no
pasa por el selector "¿músico o local?" de `RegisterScreen`, así que llega sin `role`
en `user_metadata`. Necesita spec propio de UX (perfil incompleto / selector post-login)
antes de que un músico o local reales puedan onboardearse por esta vía.

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

## Spec 021 — Cerrar el flujo de compra en web 🟢 código completo, falta la puerta

**Estado (revisado 2026-08-11):** los 9 problemas del spec —los 6 originales de la tabla de
abajo más los 3 encontrados al implementar (anon key en vez de access_token, sin CORS,
`monto` NULL)— están **todos verificados contra el repo actual**: 12 de los 13 checkboxes
de *Criterios de aceptación* quedaron tildados, cada uno con el archivo y la línea donde se
confirmó. El checklist nunca se había actualizado desde que se escribió, tres días y quince
specs atrás, aunque el código ya lo cumplía.

**Lo único que sigue abierto es real:** la compra end-to-end con tarjeta de prueba. Producción
tiene 6 tickets, todos en `pending` — el flujo llega hasta abrir el Checkout Pro de MP pero
nunca se completó un pago, ni antes ni después de estos fixes. Ya no depende del 028 (Resend
está aplicado desde el 2026-08-11) — el bloqueo actual es el checkout de MP en sí, ver el
intento del 2026-08-13 abajo.

### Intento end-to-end 2026-08-13 — no cerrado

Evento de prueba: **QuintalClandesta** (`b3f2760c-d28f-4994-b23a-e6fa54aaa238`), $5.000 CLP.
Comprador: `victor.leon.llanten@gmail.com` (login por magic link vía Resend, funcionó).

Encontrado en el camino:

1. **Pagar con la cuenta real de MP logueada en el navegador** → MP rechaza con "una de las
   partes con la que intentas hacer el pago es de prueba". Confirma que el collector
   (`create-preference`) usa credenciales de prueba, como dice este documento más abajo.
   Arreglo: incógnito, para no ir logueado con la cuenta real.
2. **Pagar como invitado** (sin loguearse en MP), con la tarjeta de prueba Chile (Mastercard
   `5416 7526 0258 2580`, CVV 123, venc. 11/30, titular `APRO`, documento Otro `123456789` —
   tabla oficial MLC) → rechazo genérico "No pudimos procesar tu pago", repetido incluso con
   los datos verificados carácter por carácter contra la tabla de MP. Checkout Pro como
   invitado no está simulando el escenario por nombre del titular de forma confiable.
3. **Loguearse como comprador de prueba** (recomendado por la doc de MP): la app ya tenía un
   test buyer autogenerado desde que se creó, credenciales en
   `https://www.mercadopago.cl/developers/panel/app/7224677760508968` → *Credenciales de
   prueba* (⚠️ el dominio es `mercadopago.cl`, **no** `mercadopago.com.cl` — ese no resuelve).
   Usuario: `TESTUSER5133118553056665163` (contraseña visible solo en ese panel — no
   guardarla en texto plano acá). Logueado como ese test buyer, el checkout ya trae una
   tarjeta guardada "Coopeuch débito" recomendada por defecto — **no es la nuestra**, hay que
   elegir a mano la Mastercard terminada en 2580 (la de titular APRO).
4. Con la tarjeta correcta seleccionada y CVV cargado, el botón **Pagar quedó sin dejar
   avanzar** — sin mensaje de error visible. Quedó sin diagnosticar, sesión cortada acá.

**Para retomar:** repetir el intento 3-4 con la tarjeta 2580 ya seleccionada; si el botón
Pagar sigue bloqueado, mirar si falta algún campo (CVV no cargó bien, cupón, etc.) o si hay un
error que no se ve en pantalla completa — probar con DevTools abierto en la pestaña Network
para ver la respuesta real del POST de pago.

⚠️ Al implementarlo aparecieron **tres causas raíz que este inventario no tenía**, cualquiera
de ellas suficiente para romper todo: el cliente se autenticaba con la anon key (401 antes de
llamar a MP), `create-preference` no respondía CORS (el navegador bloqueaba la llamada), y
`monto` quedaba NULL en todo evento creado desde la app (*"Sin precio"*). Detalle en el spec.

Tabla de los seis problemas originales, con la ubicación **donde se encontraron** (el código
ya cambió de línea al arreglarlos — ver el spec para dónde quedó cada fix):

| # | Problema | Dónde se encontró |
|---|---|---|
| 1 | `back_urls` apuntan a `appall://`, un scheme nativo. En web el navegador no lo resuelve: el usuario paga y queda varado. Además es la marca vieja. | `create-preference/index.ts:44-48` |
| 2 | `auto_return: 'approved'` con una back_url no-HTTP puede hacer que MP **rechace la preferencia al crearla**. | `create-preference/index.ts:49` |
| 3 | El webhook solo escucha `topic=merchant_order`. MP también notifica con `payment`, y en webhooks v2 suele ser el principal. Si llega solo ése, el ticket **nunca** pasa a `completed`. | `webhook-mp/index.ts:15` |
| 4 | El `catch` devuelve **200 incluso cuando falla**. MP lo lee como entregado y **no reintenta**: pago cobrado, ticket en `pending` para siempre. | `webhook-mp/index.ts:47-50` |
| 5 | No hay manejo de pagos rechazados. Solo se actúa si `order_status === 'paid'`; un rechazo deja el ticket colgado sin feedback. | `webhook-mp/index.ts:38` |
| 6 | El polling se rinde a los 30s sin avisar nada. El usuario queda mirando "Verificando pago…". | `ConfirmacionCompraScreen.tsx:62` |

**Criterio de cierre:** una compra completa con tarjeta de prueba, ticket en `completed`,
verificado en la base. Sigue siendo el único punto abierto.

**Lo que falta por escribir, no por arreglar** — spec 022, todavía sin archivo propio: validar
la firma `x-signature` de MP, validar `cantidad` y limitar aforo por evento. Ver su sección
más abajo.

---

## Spec 022 — Endurecer webhook y creación de preferencias 🟢 aplicado y verificado (2026-08-13)

**Estado:** migración `20260813054051_spec_022_endurecer_compra.sql` en producción,
`create-preference` (v6) y `webhook-mp` (v7) desplegados. Los 12 criterios de cierre
verificados — 3-8 y 10-12 contra producción real (RPC directa y HTTP con firma calculada a
mano), 1-2 y 9 por código + `tsc`. Detalle completo en `022-endurecer-webhook-preferencias.md`.
Los tres puntos originales (idempotencia pasó al spec 037 el 10-ago, con el
`SELECT ... FOR UPDATE` de `issue_ticket_items`, y no se tocó desde acá):

| # | Problema | Vive en |
|---|---|---|
| 1 | El webhook no valida la firma `x-signature` de MP. Mitigante existente: no confía en el payload, vuelve a consultar la orden a la API de MP. | `webhook-mp/index.ts` |
| 3 | `cantidad` llega del body **sin validar**. Un `cantidad: 500` crea una preferencia real por 500 entradas en un local de 40 lugares. | `create-preference/index.ts` |
| 4 | No hay límite de aforo por evento, y ni siquiera alcanzaría con validarlo solo en la Edge Function: la policy `tickets_insert` de hoy deja insertar un ticket directo por PostgREST, saltándose cualquier chequeo del lado servidor. | `create-preference/index.ts` + una función `reservar_ticket_pending()` + `DROP POLICY tickets_insert` |

La solución del punto 4 sigue el mismo patrón que folios (036) y canje (040): la condición
vive dentro de una función `SECURITY DEFINER` que bloquea la fila del evento antes de
contar, no en un `CHECK` declarativo ni en una carrera de "contar y después insertar". El
aforo que faltaba es además lo que le falta al dashboard de entradas (spec 039) para poder
mostrar "disponibles" en vez de solo "emitidas" — ese dato queda listo acá, mostrarlo es
tarea del 039 (ya aplicado, sin este dato todavía).

**Punto 1 verificado (2026-08-13)** firmando notificaciones a mano contra el `webhook-mp`
desplegado: firma válida aceptada, alterada y ausente ambas rechazadas con 401 (confirmado en
logs). **Sigue abierta la pregunta que necesita tráfico real:** si el tópico `merchant_order`
manda `x-signature` con el mismo formato que `order`/`payment`, o directamente no la manda —
ver la nota en el spec.

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

## Spec 031 — Dashboard de local 🟡 aplicado, sin verificar en runtime

**Estado:** migración en producción y código en `main` (`78af993`) desde el 2026-08-10.
Typecheck en 0. Lo que sigue abierto es la verificación: los 6 puntos del criterio de cierre
piden un usuario `role = 'cafe'` que todavía no existe, así que **ninguna de las pantallas
nuevas la ha abierto nadie**. Los tres hechos de abajo siguen siendo ciertos en la base; el
código que los corrige ya está desplegado, pero sin ejercitar.

Además hereda un hueco del 033: `tickets_select_event_owner` filtra por `events.created_by`,
que el 033 degradó a dato histórico. Un local que entró como `owner` sin crear el evento ve
sus ventas en cero. Anotado en `MiLocalStack.tsx` y `DashboardLocalScreen.tsx`. Pide spec propio.

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

## Spec 033 — Propiedad y colaboradores de evento 🟢 desplegado, falta verificar en runtime

**Estado:** código completo, mergeado a `main` y migración aplicada a producción el
2026-08-10 (migración + tipos + `EventosContext` + `useEventoPermisos` +
`EquipoEventoScreen` + botones de gestión en `DetalleEventoScreen` + selector de artista
en `CrearEventoScreen`). `tsc --noEmit` limpio salvo las Edge Functions Deno (preexistente,
no tocado). Verificado contra producción: backfill limpio (1 evento, 1 owner), 0 eventos
huérfanos. **Falta ejercitar la app con un músico y un local reales** (los otros 8 puntos
del criterio de cierre).

Al desplegar apareció una brecha no anotada: la migración del **spec 031** estaba aplicada
en producción sin estar mergeada a `main` (la rama `spec-031-dashboard-local` la desplegó
sin fusionarse). Se sincronizó el archivo de esa migración a `main` en un commit aparte
(`15a3523`). El código del 031 se mergeó después, ya cerrado el 033, en `78af993`.

**Por qué:** hoy `events.created_by` es la única noción de dueño, y es dueño para siempre.
Un músico y el local donde toca no pueden coordinar el mismo evento dentro de la app, y
borrar un evento con entradas vendidas las destruye en silencio (`tickets` cuelga de
`events` con `ON DELETE CASCADE`).

**Por qué no se aplicó ya:** es un cambio de esquema grande — tabla nueva
(`event_collaborators`), 6 funciones `SECURITY DEFINER`, 3 triggers, políticas RLS de
`events` reemplazadas — y hoy no hay entorno local para probarlo antes (spec 024 sigue
abierto). Aplicar contra la única base que existe sin poder ensayarlo antes es la clase de
acción que pide confirmación explícita en el momento, no autorización heredada de una
sesión anterior.

**Se degrada solo mientras tanto:** el código nuevo no rompe nada si la migración no está
— `EventosContext` cae a "sin colaboradores" y `useEventoPermisos` cae al modelo viejo
(`created_by`), con el mismo patrón que `useMock` ya usa para `events` y `venues`.

**Se solapa con el 031** por el lado del co-admin automático del dueño del local: la rama
que lo agrega (`events_claim_owner_trg`) es código correcto pero no se puede verificar
hasta que `venues.owner_id` esté poblado — hoy los 3 venues lo tienen `NULL`.

**Se solapa con el 023** en diagnóstico (borrado destructivo, ventas en riesgo) pero no en
alcance: el 023 gobierna usuarios y locales, este gobierna eventos.

**Deuda que queda a propósito fuera de este spec:** reembolso al cancelar (depende de la
API de refunds de MP), avisar por correo a compradores de un evento cancelado (depende del
028/029), invitar por correo a alguien sin cuenta (depende del 028), y editar un evento ya
creado — es el **spec 034**, separado a propósito para no ensanchar el diff de este.

**Antes de cerrar:** ejercitar los 9 puntos del criterio de cierre contra producción con
un músico y un local reales — hoy solo el punto 8 (sin eventos huérfanos) está verificado.

---

## Spec 034 — Editar evento 🟡 propuesto

**Estado:** spec completo en `034-editar-evento.md`. Sin implementar.

**Por qué:** `CrearEventoScreen` es la única pantalla que toca un evento, y solo sabe
crear. El spec 033 dejó el equipo, el borrado y la cancelación resueltos, pero ni el
owner puede corregir una hora o un precio equivocados desde la app — solo por API.

Se separó del 033 a pedido de Victor, aislado a propósito: reusa `can_edit_event()` y
las policies que el 033 ya dejó (`events_update` con `WITH CHECK` explícito), así que no
toca la migración ni el modelo de permisos, solo agrega la pantalla y el flujo de UI.

⚠️ Escribe `MusicoStack.tsx`, `MiLocalStack.tsx` y `CarteleraStack.tsx` — los mismos tres
archivos que los specs 039 y 041. No correr dos de los tres a la vez.

---

## Specs 036-041 — Flujo de entradas con QR 🟢 los seis implementados al 2026-08-11

**El pedido:** dashboard de entradas ligado al evento, entradas numeradas, un QR por entrada,
accesible por los organizadores (creador + segundo admin), y lectura de QR en el dashboard de
banda y en el de local.

**Los tres hallazgos que definieron el corte:**

1. **`tickets` es una fila por compra, no por entrada** (columna `cantidad`). Un QR por compra
   se escanea una vez y deja entrar a tres personas. Hace falta una tabla de entradas
   individuales — es el spec 036 y es la razón de que esto no sea un spec de frontend.
2. **Los permisos ya existen.** El spec 033 dejó `event_collaborators`: el creador entra como
   `owner` y el invitado como `admin`, los dos con `can_edit_event()`. Lo único que faltaba es
   que la policy de `tickets` los mirara — el hueco que 031 y 033 ya dejaron anotado. Es el
   spec 038 y es una policy.
3. **Que dos porteros no se pisen no se arregla en el frontend.** Se arregla con un
   `UPDATE ... WHERE status='valid'` atómico en la base — spec 040, verificable sin cámara.

| Spec | Capa | Archivos |
|---|---|---|
| 036 — `ticket_items`, folio y token QR | Datos | `supabase/migrations/` |
| 037 — emisión al confirmar el pago | Comportamiento | `supabase/functions/webhook-mp/` |
| 038 — RLS de ventas por colaborador | Datos | `supabase/migrations/` |
| 039 — dashboard de entradas del evento | Frontend | `src/screens/`, `src/hooks/`, `src/navigation/` |
| 040 — canje atómico | Comportamiento | `supabase/migrations/` |
| 041 — escáner QR en los dos dashboards | Frontend | `src/screens/`, `src/hooks/`, `src/navigation/` |

**Orden:** 038 primero (es una policy y cierra solo el requisito de permisos); 036 en paralelo —
**los dos aplicados a producción el 2026-08-10**, ver sus secciones abajo; siguen 037 y 040 en
paralelo; 039 y 041 al final y **en serie**, porque comparten los archivos de navegación.
**Los seis quedaron escritos y aplicados entre el 10 y el 11 de agosto**, cada uno con su
sección abajo.

**Dependencias externas a la serie:** el 021 y el 028 siguen siendo el camino crítico —sin una
compra que llegue a `completed` no hay entrada que emitir ni que escanear—, pero **ninguno
bloquea implementar**: 036, 038 y 040 se verifican por RPC directa sin pasar por Mercado Pago.

⚠️ **Y ahora que los seis están implementados, ese camino crítico es lo único que queda.** Las
seis secciones de abajo terminan en la misma frase —"falta verificar en runtime"— y todas por
la misma causa: **producción tiene 0 tickets**. No es seis deudas, es una: una compra real de
punta a punta cierra los criterios pendientes de 036, 037, 038, 039 y 041 a la vez. El
prerequisito sigue siendo el 028 (Resend), y detrás de él el dominio propio.

---

## Spec 038 — RLS de ventas por colaborador 🟢 aplicado, falta criterio de cierre

**Estado:** migración `20260810233000_spec_038_rls_ventas_por_colaborador.sql` aplicada a
producción el 2026-08-10. `tickets_select_event_owner` (que miraba `events.created_by`)
fue reemplazada por `tickets_select_event_team`, que usa `can_edit_event(evento_id)` del
spec 033. Verificado por consulta directa a `pg_policies` que la policy quedó con el
`qual` esperado y que `tickets_select_own`/`tickets_insert` no se tocaron.

**No toca frontend:** `VentasMusicoScreen` ya lee "lo que RLS deja ver" sin lógica propia,
así que empieza a mostrar lo correcto para local y músico sin cambiar una línea de `src/`.

**Falta el criterio de cierre completo** — no por código, por datos: producción tiene 0
tickets (confirmado arriba, spec 021) y una sola fila en `event_collaborators` (el owner
automático de un evento), así que no hay un segundo colaborador ni una venta real con que
comparar "ve ventas" vs "ve cero". Se cierra cuando exista un ticket real (depende del
021/028) y un segundo colaborador de prueba (invitado manual desde `EquipoEventoScreen`,
no depende de nada externo — se puede sembrar hoy).

Queda pendiente, del propio spec: borrar el comentario de 12 líneas en `MiLocalStack.tsx`
que documentaba este hueco — lo hace el spec 039, que ya toca ese archivo.

---

## Spec 036 — `ticket_items`, folio y token QR 🟢 aplicado, criterios 1-5 verificados

**Estado:** migración `20260811013847_spec_036_entradas_individuales.sql` aplicada a
producción el 2026-08-10. Crea `ticket_items`, `event_folio_counters`,
`issue_ticket_items()` y el trigger de inmutabilidad, tal como especifica el documento.

**Verificado por RPC directa** (dentro de una transacción con `ROLLBACK`, sin dejar datos
sintéticos en producción — se insertaron tickets de prueba, se corrieron los criterios y
se descartó todo en el mismo `BEGIN`):

1. Ticket `completed` con `cantidad=3` → 3 filas, folios 1,2,3, tokens distintos. OK.
2. Reentrada sobre el mismo ticket → devuelve 0, sigue en 3 filas. OK.
3. Ticket `pending` → excepción `"solo se emiten entradas de compras completed"`. OK.
4. Segunda compra del mismo evento (`cantidad=2`) → folios 4,5, continuando 1,2,3 sin
   huecos ni repetidos. OK.
5. El trigger de inmutabilidad rechaza un `UPDATE` de `folio` y uno de `evento_id` —
   probado como `postgres`, que bypasea RLS, así que la guarda no depende solo de la
   policy. La tabla solo tiene la policy `ti_select`: sin policy de INSERT/UPDATE/DELETE,
   RLS niega esas operaciones por defecto a `anon`/`authenticated`. OK.

**Faltan los criterios 6 y 7** (el comprador ve sus propias entradas; un `admin` que no
creó el evento ve todas) — no por código, por lo mismo que bloquea el spec 038: piden una
sesión autenticada real con `auth.uid()`, no una RPC de superusuario. Se cierran junto con
el resto de la serie cuando exista una compra real (021/028).

**Hallazgo de infraestructura, no del spec:** `qr_token DEFAULT gen_random_bytes(16)` sin
calificar fallaba en `supabase db push` (el CLI no reportó el motivo real — solo repetía
el statement). La causa: `db push` conecta vía el pooler de Supavisor
(`postgres.<ref>@aws-1-us-west-2.pooler.supabase.com`), y ese rol no trae `extensions` en
el `search_path` por defecto, a diferencia de una conexión directa. Se resolvió
calificando `extensions.gen_random_bytes(16)`. Vale para cualquier función de `pgcrypto`
en migraciones futuras — no es específico de este spec.

---

## Spec 040 — Canje atómico de entradas 🟢 aplicado y verificado

**Estado:** migración `20260811020000_spec_040_canje_entradas.sql` aplicada a producción el
2026-08-10. `comprador_de`, `redeem_ticket_item` y `peek_ticket_item` creadas. Los 8 puntos
del criterio de cierre verificados por RPC directa (7 dentro de una transacción con
`ROLLBACK`, el de concurrencia con datos committeados y luego borrados). Detalle completo,
incluido un bug de `RETURNING ... INTO` encontrado y corregido durante la verificación, en
`specs/040-canje-atomico-de-entradas.md`.

**A diferencia de 030/031/033/036/038**, este spec no queda con el criterio de cierre
pendiente por falta de datos: se pudo verificar entero porque no depende de una compra real
ni de una sesión HTTP autenticada — `set_config('request.jwt.claims', …)` simula
`auth.uid()` sin pasar por PostgREST. Es el primero de la serie 036-041 que cierra del todo.

---

## Spec 037 — Emisión de entradas al confirmar el pago 🟢 desplegado, falta punta a punta

**Estado:** migración de backfill `20260811051330_spec_037_backfill_entradas.sql` aplicada
(0 filas — coincide con las 0 compras `completed` de producción) y `webhook-mp` versión 5
desplegado con la llamada a `issue_ticket_items` tras confirmar el pago. Confirmado por
Management API que el código desplegado es el del repo (criterio 7).

**Ajuste sobre el documento del spec:** el `UPDATE` de `tickets` en el código real devuelve
un arreglo (`.select('id')`), no una fila (`.single()` como sugería el ejemplo del spec) —
usar `.single()` habría sumado un modo de fallo que el webhook no tenía (error si 0 filas
matchean `preference_id`). La emisión itera el arreglo; en la práctica es 0 o 1 fila, porque
`preference_id` es único por compra.

**Sin verificar de punta a punta** (criterios 1, 2, 3 y 5): piden que Mercado Pago le mande
una notificación real al webhook desplegado, y eso depende del 021 (flujo de compra cerrado)
y el 028 (correo, para no agotar el tope de 2 magic links/hora). La función que este spec
invoca, `issue_ticket_items`, ya tiene sus propios criterios de emisión verificados por RPC
directa en el spec 036 — este spec no los repite, solo confirma que el webhook la llama bien
y que lo desplegado coincide con el repo.

---

## Spec 034 — Editar evento 🟢 implementado, falta verificar en runtime

**Estado:** `updateEvento` en `EventosContext.tsx`, pantalla nueva `EditarEventoScreen.tsx`,
botón "✏️ Editar" en `DetalleEventoScreen.tsx` y ruta `EditarEvento` registrada en las tres
stacks (`CarteleraStack`, `MusicoStack`, `MiLocalStack`). `tsc --noEmit` limpio en `src/` y
`expo export --platform web` compila sin error. No toca migración: reutiliza
`events_update`/`can_edit_event()` del spec 033.

**Bug encontrado implementando:** el código de ejemplo del propio spec no recalculaba
`monto` al cambiar `precio` — mismo bug de "Sin precio" que el spec 021 encontró en la
creación. Corregido: `monto` solo se recalcula cuando `precio` viene en los cambios (evita
pisarlo con `0` en un `UPDATE` que edite otro campo). Detalle en
`specs/034-editar-evento.md`.

**Falta el criterio de cierre en runtime**, mismo bloqueo que 030/031/033/036/038: pide un
`admin` (no `owner`) editando un evento que no creó, y producción solo tiene un
`event_collaborators` (el owner automático). Se puede destrabar sembrando un segundo
colaborador desde `EquipoEventoScreen` — no depende de nada externo, no se hizo en esta
sesión.

---

## Spec 039 — Dashboard de entradas del evento 🟢 implementado, falta verificar en runtime

**Estado:** `react-native-qrcode-svg` + `react-native-svg` instaladas, `useEntradasEvento`
(hook nuevo, no en `EventosContext` — mismo criterio que `useEventoPermisos` del 033),
`EntradasEventoScreen` (contadores, lista de `ticket_items` por folio, QR por entrada,
bloque de compras sin emitir), botón "🎟️ Entradas" en `DetalleEventoScreen`, y
`CrearEventoScreen` navega al dashboard del evento recién publicado. Ruta `EntradasEvento`
registrada en las tres stacks. `tsc --noEmit` limpio en `src/`, `expo export --platform web`
compila (1.6MB → 1.7MB por las dos libs nuevas).

Se borró el comentario de 12 líneas de `MiLocalStack.tsx` que documentaba el hueco del 038
(tal como el 038 dejó anotado que le tocaba a este spec) y se reemplazó por una nota corta
y vigente.

**Falta el criterio de cierre en runtime**, mismo bloqueo que 030/031/033/034/038: producción
tiene 0 tickets (el 037 recién se desplegó, sin una compra real de punta a punta que lo
ejercite) y un solo `event_collaborators`. El render visual del QR en un navegador real
tampoco se verificó — solo se confirmó que el bundle compila con `react-native-svg`. Detalle
completo en `specs/039-dashboard-entradas-evento.md`.

---

## Spec 041 — Escáner de QR en los dos dashboards 🟢 implementado, falta la puerta

**Estado:** `expo-camera` instalada y declarada como plugin en `app.json` con su
`cameraPermission` (iOS exige `NSCameraUsageDescription`); `useCanjeEntrada` (hook nuevo) y
`EscanerQRScreen` (pantalla nueva); ruta `Escaner` registrada en las tres stacks con el mismo
nombre; botón "📷 Escanear entradas" en `EntradasEventoScreen` (con el evento fijado) y en
`PerfilMusicoScreen` / `DashboardLocalScreen` (sin evento — lo pide la pantalla).
`tsc --noEmit` limpio en `src/`; `expo export --platform web` compila (1.7MB → 1.8MB).

**Con esto cierra la serie 036-041 en código.** Los seis specs están escritos y aplicados; lo
que queda de todos ellos es la misma deuda, y es una sola: **nunca hubo una compra real**.

**La decisión de diseño que no estaba en el spec:** el escáner llama a `peek_ticket_item`
antes de `redeem_ticket_item`. El token no dice de qué evento es —eso lo sabe la base—, y la
alternativa barata (precargar los tokens del evento y comparar en el cliente) rechazaría como
"de otro evento" una entrada comprada durante el show. Cuesta dos RPC en el caso bueno y una
sola en todos los rechazos. Efecto secundario que vale por sí solo: un escaneo accidental no
quema una entrada, porque `peek` no escribe. Las otras tres desviaciones (4 s en pantalla para
los rechazos, el resultado `folio_no_existe` de la entrada manual, y dónde quedó el botón)
están en `specs/041-escaner-qr-en-dashboards.md`, sección *Verificación*.

**Lo que falta es la puerta**, y son 7 de los 9 puntos del criterio de cierre. El que importa
más es el 4 — **dos teléfonos escaneando el mismo QR a la vez** —, que es a la vez el criterio
que cierra "que no se pisen entre sí" y el único que la verificación del spec 040 no pudo
hacer de forma estrictamente simultánea (el CLI de `supabase` se cuelga con dos procesos en
paralelo). Necesita HTTPS: no se prueba en `localhost` ni con el dev server por IP de red.

---

## Cosas menores, anotadas para no perderlas

- Un deploy de Vercel quedó en estado **Error** (2026-08-06, ~23h antes del deploy actual). Nunca se revisaron sus logs
- El dashboard de Vercel tiene `buildCommand: npm run vercel-build` y output `public`, que no coinciden con el proyecto. Es inocuo porque `vercel.json` los sobrescribe, pero confunde a quien edite desde el dashboard
- `create-preference` usa `currency_id: 'CLP'`. Verificado correcto: la cuenta MP es `site_id: MLC` (Chile)
