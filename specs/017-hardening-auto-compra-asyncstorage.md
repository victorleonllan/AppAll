# Spec 017 — Hardening de la auto-compra tras migrar a AsyncStorage

## Contexto

Los commits `4efb9a4` y `25588f9` migraron el `pending_ticket` de `localStorage` a `Platform.OS` + AsyncStorage, porque `localStorage` no existe en React Native y la auto-compra del magic link (spec 013) solo funcionaba en web.

La migración es correcta en su dirección, pero al volver asíncrono un bloque que antes era síncrono introdujo dos problemas. Este spec los cierra.

## Problema 1 — Race de doble compra (solo nativo)

`DetalleEventoScreen.tsx` leía y borraba el `pending_ticket` de forma atómica cuando era `localStorage`: lectura, borrado y compra ocurrían en el mismo tick.

Con AsyncStorage aparece un `await` entre la lectura y el borrado:

```typescript
pendingId = await AsyncStorage.getItem('pending_ticket');   // ← hueco
if (pendingId === evento.id && user) {
  await AsyncStorage.removeItem('pending_ticket');
  handleComprarLogueado();
}
```

Si el efecto se dispara dos veces solapadas dentro de ese hueco, ambas ejecuciones leen el mismo `pendingId` y ambas llaman a `handleComprarLogueado()` → **dos preferencias de Mercado Pago y dos tickets** para una sola intención de compra.

Las dependencias del efecto son `[user, evento.id]`, y con `autoRefreshToken: true` en el cliente de Supabase la referencia de `user` puede cambiar sola al refrescarse el token. Probabilidad baja, consecuencia alta: cobro duplicado.

**En web no aplica.** El cuerpo de una función `async` corre síncrono hasta el primer `await`, y la rama web no tiene ninguno entre la lectura y el borrado.

### Solución

Un candado en `useRef`, chequeado y marcado sin ningún `await` en medio — así la operación es atómica bajo el modelo de un solo hilo de JS:

```typescript
const autoCompraIniciada = useRef(false);
// ...
if (pendingId !== evento.id || !user || autoCompraIniciada.current) return;
autoCompraIniciada.current = true;   // ← marcado inmediato, antes de cualquier await
```

Un `return` temprano al entrar a la función no basta: dos ejecuciones pueden pasarlo ambas antes de que la primera resuelva su `getItem`. El chequeo tiene que ir **después** de la lectura y pegado al marcado.

## Problema 2 — `catch {}` silencioso

Ambas pantallas capturaban cualquier error sin registrarlo:

```typescript
} catch {}
```

Si AsyncStorage falla en nativo, la auto-compra no ocurre y no queda ninguna traza: sin mensaje, sin log, nada que depurar. Es justo el flujo que ya se rompió una vez y necesitó el spec 013 completo para diagnosticarse.

### Solución

`console.error` con prefijo de pantalla en ambos `catch`.

## Cambios aplicados

| Archivo | Cambio |
|---------|--------|
| `src/screens/DetalleEventoScreen.tsx` | Candado `autoCompraIniciada` (`useRef`) contra la doble compra. `useRef` declarado junto al resto de hooks |
| `src/screens/DetalleEventoScreen.tsx` | `catch {}` → `console.error` |
| `src/screens/CarteleraScreen.tsx` | `catch {}` → `console.error` |
| `src/screens/CarteleraScreen.tsx` | Restaurado el newline final que se había perdido |

`npx tsc --noEmit` no introduce errores nuevos (siguen los 22 preexistentes documentados en el spec 016).

## Verificación

### Web (Vercel)

No hay cambio de comportamiento — la rama web era y sigue siendo síncrona. Basta confirmar que el flujo de magic link → auto-compra sigue funcionando igual.

### Nativo (sin probar todavía)

Este código apunta a nativo y **no se ha corrido en un dispositivo**. Pendiente:

1. Comprar como usuario no logueado → recibir magic link → volver a la app
2. Confirmar que la auto-compra dispara **una sola vez** (un ticket en la tabla, una preferencia en MP)
3. Confirmar que el `pending_ticket` queda borrado de AsyncStorage
4. Forzar un fallo de AsyncStorage y confirmar que ahora aparece el `console.error`

## Deuda técnica detectada (no corregida acá)

**Hook condicional en `DetalleEventoScreen.tsx`** — riesgo de crash, preexistente.

El `return` temprano de "Evento no encontrado" está **antes** del `useEffect` de la auto-compra:

```typescript
if (!evento) {
  return (<Text>Evento no encontrado</Text>);   // ← corta el render
}
// ...
useEffect(() => { ... });                        // ← hook después del return
```

Eso viola las Reglas de Hooks. Si `evento` es `undefined` en un render y está definido en el siguiente, la cantidad de hooks cambia entre renders y React lanza *"Rendered more hooks than during the previous render"*.

`eventos` viene del contexto y arranca vacío, así que el escenario es real: entrar directo a `DetalleEvento` antes de que carguen los eventos — por ejemplo recargando la página en esa ruta en web, o con un deep link. Navegando desde la Cartelera no se dispara, porque los eventos ya están cargados.

**Arreglo:** mover el `useEffect` por encima del `return` temprano y guardar el cuerpo con `if (!evento) return;`.

## Estado: Completado (pendiente prueba en nativo)
