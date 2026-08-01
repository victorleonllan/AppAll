# Spec 015: Webhook MP + Prueba End-to-End del flujo de compra

> **Fecha:** 28 Jul 2026
> **Prioridad:** Alta
> **Dependencias:** Spec 009, Spec 014
> **Objetivo:** Configurar webhook MP, asegurar tabla tickets, probar flujo completo.

## Estado actual

Edge Functions listas para deployar. Frontend con boton de compra y polling. Pero:
- Webhook no configurado en MP
- Tabla tickets puede no existir
- Flujo completo nunca probado

## Paso 1: Verificar tabla tickets

En Supabase Dashboard > SQL Editor:

```sql
SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tickets');
```

Si false, ejecutar migration completa del Spec 009.

## Paso 2: Configurar Webhook en MP

1. Ir a https://www.mercadopago.com.uy/developers/
2. App JamCafe > Webhooks
3. URL: https://xluinfihjjtxkglihxqz.supabase.co/functions/v1/webhook-mp
4. Evento: merchant_order
5. Guardar

## Paso 3: Probar flujo con tarjeta de prueba

| Campo | Valor |
|-------|-------|
| Numero | 5031 7557 3453 0604 |
| CVV | 123 |
| Vencimiento | Cualquier fecha futura |

## Paso 4: Verificar post-pago

```sql
SELECT * FROM tickets WHERE status = 'completed';
```

## Criterios de aceptacion

- [ ] Webhook configurado en MP Dashboard
- [ ] Tabla tickets existe con RLS
- [ ] Flujo completo: boton > MP > pago > confirmacion > ticket en BD
- [ ] Polling funciona: pending > completed automaticamente
- [ ] Magic link + auto-compra funciona

## Archivos

Ninguno en src/. Todo es configuracion externa.

## Notas

- Tarjetas de prueba solo en sandbox
- MP puede tardar ~30s en enviar webhook
- Polling: 3s intervals, timeout 30s
