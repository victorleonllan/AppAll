# Spec 014: Deploy Edge Functions MP + Secrets en Supabase

> **Fecha:** 28 Jul 2026 (actualizado 30 Jul 2026)
> **Prioridad:** 🔴 Alta
> **Dependencias:** Spec 009 (código de Edge Functions escrito)
> **Objetivo:** Subir las Edge Functions de Mercado Pago a Supabase para que el flujo de compra sea funcional.

## Estado actual

Las Edge Functions `create-preference` y `webhook-mp` existen como código en la Mac pero **NO están deployadas funcionalmente** (responden 500). Tampoco hay Supabase CLI instalado ni secrets configurados correctamente. Sin este spec, el botón "Comprar entrada" falla porque llama a funciones rotas.

## Secrets necesarios

Las Edge Functions usan estas variables de entorno:

| Variable | Origen |
|----------|--------|
| `MERCADOPAGO_ACCESS_TOKEN` | Custom — configurar como secret manual |
| `SUPABASE_URL` | **Reservado** — Supabase lo provee automáticamente |
| `SUPABASE_SERVICE_ROLE_KEY` | **Reservado** — Supabase lo provee automáticamente |

**Nota:** `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya existen como "Reserved secrets" en Supabase. No es necesario crearlos como custom secrets.

## Pasos

### Paso 1: Instalar Supabase CLI

```bash
npm install -g supabase
supabase --version  # debe mostrar v2.x+
```

(Supabase CLI v2.110.0 instalado el 30 Jul 2026)

### Paso 2: Configurar MERCADOPAGO_ACCESS_TOKEN

Desde Supabase Dashboard > Edge Functions > Secrets > Custom secrets:

| Name | Value |
|------|-------|
| `MERCADOPAGO_ACCESS_TOKEN` | `APP_USR-7224677760508968-062101-daa37436dde426359c4b1ec539784a43-3486811969` |

O por CLI (requiere `supabase login` primero):
```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN="APP_USR-7224677760508968-062101-daa37436dde426359c4b1ec539784a43-3486811969"
```

### Paso 3: Deployar Edge Function `create-preference`

```bash
supabase functions deploy create-preference
```

Verificar:
```bash
curl -s -X POST "https://xluinfihjjtxkglihxqz.supabase.co/functions/v1/create-preference" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <anon_key>" \
  -d {}
```

Debe responder con JSON (no 500).

### Paso 4: Deployar Edge Function `webhook-mp`

```bash
supabase functions deploy webhook-mp
```

Verificar:
```bash
curl -s "https://xluinfihjjtxkglihxqz.supabase.co/functions/v1/webhook-mp"
```

Debe responder "OK" con status 200.

## Verificación post-deploy

- [ ] `supabase functions list` muestra ambas funciones como `ACTIVE`
- [ ] `MERCADOPAGO_ACCESS_TOKEN` visible en Custom secrets del Dashboard
- [ ] `curl` a create-preference responde con JSON (aunque sea error controlado)
- [ ] `curl` a webhook-mp responde 200

## Archivos que tocar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/create-preference/index.ts` | Usa `SUPABASE_SERVICE_ROLE_KEY` (reserved secret) |
| `supabase/functions/webhook-mp/index.ts` | Usa `SUPABASE_SERVICE_ROLE_KEY` (reserved secret) |

## Notas

- Si el CLI da error de autenticación: `supabase login` o usar Dashboard > Edge Functions > Secrets (no requiere CLI)
- Si la Edge Function falla con 502, revisar logs en Supabase Dashboard > Edge Functions > {function} > Logs
- Los reserved secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) están disponibles en toda función sin configurarlos manualmente
