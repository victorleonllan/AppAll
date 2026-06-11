# Spec 003: Autenticación con roles (Supabase Auth)

## Objetivo

Configurar Supabase Auth con registro/login por roles (público, músico, café). Crear el flujo de autenticación que separe lo público de lo privado.

---

## Estado: ✅ COMPLETADO

Ejecutado por **Hermes Agent** (vía WhatsApp) + **OpenCode** en Mac.

---

## Fase 0: Setup manual en Supabase (✅ COMPLETADO por Hermes)

| Paso | Detalle | Responsable |
|------|---------|-------------|
| 1. Crear proyecto Supabase | ✅ Proyecto `QJXHt4WfIA3jtuAM` creado | Victor |
| 2. Obtener publishable key | ✅ `sb_publishable_da_mxDi-gYK91IQEQ1QjOQ_fRp44Rl-` | Victor |
| 3. Ejecutar SQL (tabla `profiles` + trigger) | ✅ Ejecutado con RLS activado | Victor (guiado por Hermes) |
| 4. Configurar `.env` | ✅ URL y ANON_KEY actualizados | Hermes vía SSH |

### SQL ejecutado

```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN (public, musician, cafe)),
  nombre TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, nombre)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>role, public),
    COALESCE(NEW.raw_user_meta_data->>nombre, )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### Variables de entorno configuradas

```
EXPO_PUBLIC_SUPABASE_URL=https://QJXHt4WfIA3jtuAM.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_da_mxDi-gYK91IQEQ1QjOQ_fRp44Rl-
```

---

## Fase 1–9: Código (✅ COMPLETADO por OpenCode)

| Archivo | Descripción |
|---|---|
| `src/lib/supabase.ts` | Cliente Supabase con AsyncStorage como storage |
| `src/context/AuthContext.tsx` | AuthProvider con signUp, signIn, signOut y detección de sesión |
| `src/screens/LoginScreen.tsx` | Pantalla de login con email/contraseña |
| `src/screens/RegisterScreen.tsx` | Pantalla de registro con selector de rol (músico/café) |
| `src/screens/AuthScreen.tsx` | Contenedor que alterna entre login y registro |
| `src/navigation/index.tsx` | Tercer tab dinámico: "Ingresar" (sin sesión) / "Perfil" (con sesión) |
| `App.tsx` | Envuelto en `<AuthProvider>` |
| `package.json` | Dependencias `@supabase/supabase-js` y `@react-native-async-storage/async-storage` instaladas |

### Verificación

- ✅ TypeScript compila sin errores (`npx tsc --noEmit`)
- ✅ `.env` con valores reales de Supabase
- ✅ Tabla `profiles` creada con RLS en Supabase
- ✅ Trigger `handle_new_user` activo

---

## Criterios de aceptación

- [x] Supabase project creado y SQL migration ejecutada
- [x] `.env` configurado con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY
- [x] `src/lib/supabase.ts` creado
- [x] `src/context/AuthContext.tsx` creado con signUp, signIn, signOut
- [x] `src/screens/LoginScreen.tsx` funcional
- [x] `src/screens/RegisterScreen.tsx` con selector de rol (músico / café)
- [x] `src/screens/AuthScreen.tsx` alterna entre login y registro
- [x] Navegación actualizada: tercer tab muestra "Ingresar" si no hay sesión, "Perfil" si hay
- [x] App.tsx envuelto en AuthProvider
- [x] La app compila sin errores
- [ ] Pendiente: probar registro de usuario y verificar en Supabase Dashboard
