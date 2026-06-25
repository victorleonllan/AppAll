# Spec 013: Fix Magic Link Auth + Auto-compra

> **Fecha:** 21 Jun 2026
> **Contexto:** El publico puede comprar entradas sin contraseña usando magic link de Supabase Auth.
> 4 archivos modificados, 1 bug critico corregido.

## Problema

Cuando el usuario ingresaba su email para comprar una entrada:
1. El magic link se enviaba correctamente
2. Al hacer click, Supabase procesaba el token y redirigia a la app
3. La app **no detectaba** la autenticacion → mostraba el formulario de email de nuevo
4. El usuario tenia que volver a presionar "Comprar entrada" manualmente

## Causa raiz

El archivo `src/lib/supabase.ts` tenia:
```typescript
detectSessionInUrl: false,
```

Esto hacia que el cliente de Supabase JS ignorara el token de autenticacion que viene en la URL (`#access_token=xxx`) cuando el magic link redirige al navegador.

## Solucion

### 1. `src/lib/supabase.ts` — detectSessionInUrl

```typescript
detectSessionInUrl: true,   // REQUERIDO
```

### 2. `src/context/AuthContext.tsx` — emailRedirectTo

El magic link necesita saber a que URL redirigir. Usar el origen actual:

```typescript
const signInOtp = async (email: string) => {
  const redirectTo = typeof window !== 'undefined'
    ? window.location.origin
    : undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      data: { role: 'public', nombre: email.split('@')[0] },
      shouldCreateUser: true,
      emailRedirectTo: redirectTo,
    },
  });
```

### 3. `src/screens/DetalleEventoScreen.tsx` — localStorage para auto-compra

Antes de enviar el magic link:
```typescript
localStorage.setItem('pending_ticket', evento.id);
```

Despues del redirect (app recargada), el `useEffect` detecta el pending_ticket y ejecuta la compra automaticamente.

### 4. `src/screens/CarteleraScreen.tsx` — auto-navegacion

Cuando vuelve del magic link, detecta `pending_ticket` en localStorage y navega directo al detalle del evento:

```typescript
const pendingId = localStorage.getItem('pending_ticket');
if (pendingId && user) {
  navigation.navigate('DetalleEvento', { eventoId: pendingId });
}
```

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/lib/supabase.ts` | `detectSessionInUrl: false` → `true` |
| `src/context/AuthContext.tsx` | `signInOtp` con `emailRedirectTo: window.location.origin` |
| `src/screens/DetalleEventoScreen.tsx` | localStorage `pending_ticket` + auto-compra on mount |
| `src/screens/CarteleraScreen.tsx` | Auto-navegacion al evento con pending_ticket |

## Rate limit

Supabase plan free permite ~4 emails de magic link por hora. Despues de eso:
```
email rate limit exceeded
```

Solucion: esperar ~1 hora.

## Config en Supabase Dashboard

Authentication > Settings:
- SITE_URL: puerto donde corre Expo Web (ej: http://localhost:8082)
- Redirect URLs: http://localhost:3000/**, http://localhost:8082/**

## Flujo final

1. Usuario toca "Comprar entrada" → no logueado → formulario de email
2. Ingresa email → magic link enviado → se guarda evento en localStorage
3. Click en el link → Supabase procesa → redirect a la app
4. App detecta sesion (detectSessionInUrl: true)
5. Cartelera detecta pending_ticket → navega al evento
6. DetalleEvento detecta pending_ticket → auto-compra
7. Se abre MP Checkout Pro
8. Confirmacion con polling cada 3s