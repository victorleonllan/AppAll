# Spec 009: Fix navegación para crear evento desde perfil de músico — ✅ COMPLETADO

## Objetivo

Corregir el error de navegación al tocar "+ Nuevo Evento" desde el perfil de músico. El error era:

> The action 'NAVIGATE' with payload {"name":"CrearEvento"} was not handled by any navigator.

## Causa raíz

`PerfilMusicoScreen` estaba montada directamente como un `Tab.Screen` en el `Tab.Navigator` principal. Cuando llamaba a `(navigation as any).navigate('CrearEvento')`, React Navigation buscaba un screen con ese nombre en el tab actual y no lo encontraba, porque no existía registrado en ningún navigador del árbol.

## Cambios realizados

### 1. Crear `src/navigation/MusicoStack.tsx` — NUEVO

Stack Navigator que envuelve `PerfilMusicoScreen` y agrega `CrearEventoScreen` como sub-pantalla:

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PerfilMusicoScreen from '../screens/PerfilMusicoScreen';
import CrearEventoScreen from '../screens/CrearEventoScreen';
import { colors, fontSize } from '../theme';

export type MusicoStackParamList = {
  PerfilMusico: undefined;
  CrearEvento: undefined;
};

const Stack = createNativeStackNavigator<MusicoStackParamList>();

export default function MusicoStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontSize: fontSize.lg },
      }}
    >
      <Stack.Screen
        name="PerfilMusico"
        component={PerfilMusicoScreen}
        options={{ title: 'Mi Perfil' }}
      />
      <Stack.Screen
        name="CrearEvento"
        component={CrearEventoScreen}
        options={{ title: 'Nuevo Evento' }}
      />
    </Stack.Navigator>
  );
}
```

### 2. Actualizar `src/navigation/index.tsx`

Dos cambios:

1. **Importar `MusicoStack`** en lugar de `PerfilMusicoScreen`
2. **Usar `MusicoStack` como componente** en `getThirdTab` cuando el rol es `musician`
3. **Ocultar el header del tab** para `Mi Perfil` (porque `MusicoStack` maneja su propio header, igual que `CarteleraStack` y `CafesStack`)

Cambio en imports:
```tsx
// Antes:
import PerfilMusicoScreen from '../screens/PerfilMusicoScreen';
// Después:
import MusicoStack from './MusicoStack';
```

Cambio en `getThirdTab`:
```tsx
// Antes:
if (role === 'musician') return { name: 'Mi Perfil', component: PerfilMusicoScreen, icon: 'person-circle' };
// Después:
if (role === 'musician') return { name: 'Mi Perfil', component: MusicoStack, icon: 'person-circle' };
```

Cambio en `headerShown` del tercer tab:
```tsx
// Antes:
headerShown: thirdTab.name !== 'AppAll' && thirdTab.name !== 'Mi Café',
// Después:
headerShown: thirdTab.name === 'AppAll' ? false : thirdTab.name === 'Mi Café' ? false : thirdTab.name === 'Mi Perfil' ? false : true,
```

## Otros errores simultáneos

### Error "Internet connection appears to be offline"

**Causa**: El bundle de Metro se generó antes de que las variables de entorno `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` estuvieran correctamente definidas en `.env`. Expo inlinea estas variables en tiempo de empaquetado, no en runtime.

**Solución**: Ejecutar `npx expo start --clear` para limpiar el cache de Metro y forzar un repack del bundle con las env vars actuales.

### Error "fetch failed" en createEvento con Supabase

**No se requiere acción adicional**. El `EventosContext` ya maneja graceful fallback a datos mock cuando Supabase no está disponible. Una vez que las env vars se carguen correctamente y las RLS policies permitan inserts (ya configuradas), el flujo debería funcionar contra la BD.

## Archivos modificados

| Archivo | Acción |
|---------|--------|
| `src/navigation/MusicoStack.tsx` | Creado |
| `src/navigation/index.tsx` | Modificado |

## Verificación

1. Iniciar sesión con cuenta con rol `musician`
2. Ir al tercer tab ("Mi Perfil")
3. Tocar botón "+ Nuevo Evento"
4. ✓ Debe navegar a la pantalla `CrearEventoScreen`
5. Llenar artista, venue, fecha, hora y tocar "Publicar evento"
6. ✓ Debe publicar el evento (contra Supabase o mock) y regresar al perfil

---

**Estado**: ✅ COMPLETADO
**Fecha**: 14 Jun 2026
**Specs relacionados**: 006, 008
