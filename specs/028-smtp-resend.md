# Spec 028 — Correo transaccional: del mailer de Supabase a Resend

**Estado: bloqueado.** Falta la API key de Resend. Todo lo demás está listo.

## Contexto

El magic link es el **único** camino de compra: si el correo no sale, nadie compra una
entrada. Hoy sale por el mailer integrado de Supabase, que tiene un techo de **2 correos
por hora** y no se puede subir:

```
PATCH rate_limit_email_sent → 400
"Custom SMTP required to configure SMTP_SENDER_NAME or RATE_LIMIT_EMAIL_SENT.
 Missing SMTP_ADMIN_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS"
```

Ese límite ya bloqueó una sesión de pruebas real: `429 over_email_send_rate_limit`,
8-ago-2026 05:00 UTC, pidiendo el link desde `app-all-lemon.vercel.app`. Con dos correos
por hora no se puede ni depurar el flujo, mucho menos vender.

Segundo problema, del mismo origen: los correos salen en **inglés** con el texto por
defecto de Supabase (`"Your sign-in link"`). Es el primer contacto de un comprador con la
marca.

⚠️ **Las plantillas están detrás del mismo gate**, no solo los límites:

```
"Email template modification is not available for free tier projects using the
 default email provider. Please upgrade your plan or configure a custom SMTP provider."
```

Por eso los dos problemas se resuelven en un solo spec: el SMTP propio es requisito de
ambos.

## Decisión

**Resend** como proveedor SMTP. Es parte del stack recomendado de All In Mexico, tiene
plan gratis suficiente (3.000 correos/mes, 100/día) y se configura por SMTP plano, sin
tocar código de la app.

### Sin dominio propio — limitación aceptada a conciencia

El remitente será `onboarding@resend.dev`, el de prueba de Resend, porque Sonópolis
todavía no tiene dominio. **Resend solo entrega a la dirección con la que se creó la
cuenta**, así que:

- ✅ Desbloquea las pruebas de desarrollo, sin límite de 2/hora.
- ❌ **Ningún tercero puede recibir un magic link** → nadie más puede comprar.

Es un desbloqueo de desarrollo, no una solución de producción. Ver *Ruta a producción*.

## Configuración a aplicar

Todo vía Management API sobre `/v1/projects/xluinfihjjtxkglihxqz/config/auth`.
No hay migración: la config de Auth no vive en `supabase/migrations/`.

### 1. SMTP (los cinco campos van juntos o Supabase los rechaza)

| Campo | Valor |
|---|---|
| `smtp_host` | `smtp.resend.com` |
| `smtp_port` | `465` — SMTPS, TLS implícito |
| `smtp_user` | `resend` — literal, no es el email |
| `smtp_pass` | la API key `re_…` |
| `smtp_admin_email` | `onboarding@resend.dev` |
| `smtp_sender_name` | `Sonópolis` |

### 2. Límites (segundo PATCH — antes de guardar el SMTP los rechaza)

| Campo | De | A | Por qué |
|---|---|---|---|
| `rate_limit_email_sent` | 2 | 30 | Por hora. El techo real pasa a ser el de Resend: 100/día |
| `smtp_max_frequency` | 60 | 20 | Segundos mínimos entre dos correos al **mismo** usuario. Es el que producía *"you can only request this after 19 seconds"* |

⚠️ `smtp_max_frequency` vuelve a 60 antes del Demo Day: es un freno anti-abuso, y 20s
solo se justifica mientras se depura.

### 3. Plantilla del magic link

- `mailer_subjects_magic_link`: `Tu enlace para entrar a Sonópolis`
- `mailer_templates_magic_link_content`: el contenido de
  **`supabase/email-templates/magic-link.html`**

El HTML se versiona en el repo a propósito. La config de Auth vive solo en el dashboard,
que es exactamente el problema que el spec 018 resolvió para el esquema: sin archivo no es
reproducible ni auditable. El archivo es la fuente de verdad; el dashboard, el destino.

Detalles del HTML: tablas y CSS inline (los clientes de correo ignoran hojas externas),
tokens de color de `src/theme/index.ts`, el enlace repetido como texto plano por si el
botón no renderiza, y la variable de Supabase `{{ .ConfirmationURL }}`.

Las demás plantillas (registro, recuperación, cambio de email) quedan en inglés: hoy
ninguna está en uso real. Cuando se usen, mismo procedimiento y misma carpeta.

## Criterios de aceptación

- [ ] `GET config/auth` devuelve `smtp_host: smtp.resend.com` y `rate_limit_email_sent: 30`
- [ ] Pedir un magic link desde `app-all-lemon.vercel.app` produce `mail.send` en los logs
      de Auth, **sin** ningún 429
- [ ] El envío figura como entregado en el dashboard de Resend
- [ ] El correo llega en español y con la marca, no con el texto por defecto en inglés
- [ ] El enlace deja la sesión en `app-all-lemon.vercel.app`, no en `localhost`
- [ ] **Cuatro links seguidos funcionan.** Con el mailer viejo la tercera petición fallaba

## Rollback

Vaciar los cinco campos SMTP devuelve el mailer de Supabase y el límite de 2/hora. No hay
estado que migrar; la plantilla vuelve sola al default porque el gate la bloquea de nuevo.

## Ruta a producción — requisito del Demo Day (23-sep-2026)

Con dominio propio: verificarlo en Resend (SPF, DKIM y DMARC), y cambiar
`smtp_admin_email` a `no-reply@<dominio>`. El resto de la configuración no se toca.

**Sin ese paso la venta de entradas a terceros no funciona**, porque `onboarding@resend.dev`
solo entrega al dueño de la cuenta. No es una mejora opcional: es el bloqueo entre "yo
puedo probar" y "alguien puede comprar".

## Fuera de alcance

- El 401 de la anon key y los eventos mock → spec 021. Este spec **no** arregla la compra.
- Correos que no sean de Auth (confirmación de compra, entrada en PDF) → spec aparte.
