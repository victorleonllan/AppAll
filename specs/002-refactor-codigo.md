# Spec 002: Refactor de código — componentes + screens + navegación

## Objetivo

Refactorizar el código existente para usar la nueva arquitectura: componentes reutilizables en `src/components/`, screens que importan datos de `src/data/mock/` y tokens de `src/theme/`, y navegación extraída a `src/navigation/`.

**Requisito:** El Spec 001 (AGENTS.md + fundación) debe estar completado antes de ejecutar este spec.

---

## Fase 1: Componentes reutilizables

### Crear `src/components/TarjetaCafe.tsx`

Extraer el diseño de las tarjetas de café de CafesScreen a un componente independiente.

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Cafe } from '../types';
import { colors, spacing, borderRadius } from '../theme';

interface Props {
  cafe: Cafe;
  tipo: 'asociado' | 'pendiente';
  onInvitar?: () => void;
}

export default function TarjetaCafe({ cafe, tipo, onInvitar }: Props) {
  return (
    <View style={[styles.base, tipo === 'asociado' ? styles.asociado : styles.pendiente]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.nombre}>{cafe.nombre}</Text>
        {cafe.estilo && (
          <Text style={styles.info}>
            {cafe.estilo} {cafe.rating ? '· ⭐ ' + cafe.rating : ''}
          </Text>
        )}
        <Text style={styles.info}>📍 {cafe.distancia}</Text>
      </View>
      {tipo === 'pendiente' && onInvitar && (
        <TouchableOpacity style={styles.boton} onPress={onInvitar}>
          <Text style={styles.textoBoton}>💬 Invitar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.md,
    marginVertical: 4,
    padding: 14,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  asociado: { borderLeftColor: colors.accent },
  pendiente: { opacity: 0.8 },
  nombre: { fontSize: 16, fontWeight: '600', color: colors.primary },
  info: { fontSize: 13, color: colors.secondary, marginTop: 2 },
  boton: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: borderRadius.sm },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});
```

### Crear `src/components/TarjetaEvento.tsx`

Nuevo componente para la cartelera de eventos.

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Evento } from '../types';
import { colors, spacing, borderRadius } from '../theme';

interface Props {
  evento: Evento;
  onComprar?: () => void;
}

export default function TarjetaEvento({ evento, onComprar }: Props) {
  return (
    <View style={styles.tarjeta}>
      <View style={{ flex: 1 }}>
        <Text style={styles.artista}>{evento.artista}</Text>
        <Text style={styles.genero}>{evento.genero}</Text>
        <Text style={styles.detalle}>
          📍 {evento.cafe} · {evento.fecha} · {evento.hora}
        </Text>
        <Text style={styles.precio}>{evento.precio}</Text>
      </View>
      {onComprar && (
        <TouchableOpacity style={styles.boton} onPress={onComprar}>
          <Text style={styles.textoBoton}>🎫 Comprar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.md,
    marginVertical: 4,
    padding: 14,
    borderRadius: borderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
  },
  artista: { fontSize: 16, fontWeight: '600', color: colors.primary },
  genero: { fontSize: 13, color: colors.secondary, marginTop: 2 },
  detalle: { fontSize: 12, color: colors.muted, marginTop: 4 },
  precio: { fontSize: 15, fontWeight: 'bold', color: colors.success, marginTop: 6 },
  boton: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: borderRadius.sm, marginLeft: 12 },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: 13 },
});
```

---

## Fase 2: Refactor de screens

### Reemplazar TODO `src/screens/CarteleraScreen.tsx`

```typescript
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { eventos } from '../data/mock/eventos';
import TarjetaEvento from '../components/TarjetaEvento';
import { colors, spacing, fontSize } from '../theme';

export default function CarteleraScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>📅 Próximos eventos</Text>
      <FlatList
        data={eventos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TarjetaEvento evento={item} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 20 },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginLeft: spacing.md, marginBottom: spacing.sm },
});
```

### Reemplazar TODO `src/screens/CafesScreen.tsx`

```typescript
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { cafesAsociados, cafesPendientes } from '../data/mock/cafes';
import TarjetaCafe from '../components/TarjetaCafe';
import { colors, spacing, fontSize } from '../theme';

export default function CafesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>☕ Asociados</Text>
      <FlatList
        data={cafesAsociados}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TarjetaCafe cafe={item} tipo="asociado" />}
        style={{ maxHeight: 200 }}
      />

      <Text style={styles.titulo}>📍 Otros cafés del sector</Text>
      <FlatList
        data={cafesPendientes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TarjetaCafe cafe={item} tipo="pendiente" onInvitar={() => {}} />
        )}
        style={{ maxHeight: 200 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 20 },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginLeft: spacing.md, marginTop: 10, marginBottom: 6 },
});
```

### Reemplazar TODO `src/screens/PerfilScreen.tsx`

```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, fontSize } from '../theme';

export default function PerfilScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icono}>👤</Text>
      <Text style={styles.titulo}>Tu Perfil</Text>
      <Text style={styles.sub}>Crea tu cuenta para empezar</Text>

      <View style={styles.tarjetaRol}>
        <Text style={styles.label}>Yo soy...</Text>
        <TouchableOpacity style={[styles.botonRol, styles.botonActivo]}>
          <Text style={styles.textoRol}>🎭 Público</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonRol}>
          <Text style={styles.textoRolInactivo}>🎸 Músico</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botonRol}>
          <Text style={styles.textoRolInactivo}>☕ Dueño de café</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.aviso}>Si eres músico o café, podrás gestionar tu perfil después.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', paddingTop: 60 },
  icono: { fontSize: fontSize.xxl },
  titulo: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.primary, marginTop: spacing.sm },
  sub: { fontSize: fontSize.md, color: colors.secondary, marginTop: spacing.sm },
  tarjetaRol: { backgroundColor: colors.cardBackground, padding: 20, borderRadius: borderRadius.lg, marginTop: 30, width: '85%' },
  label: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary, marginBottom: 12 },
  botonRol: { paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, marginBottom: spacing.sm, backgroundColor: colors.accentLight },
  botonActivo: { backgroundColor: colors.accent },
  textoRol: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  textoRolInactivo: { color: colors.secondary, fontSize: fontSize.md },
  aviso: { fontSize: fontSize.xs, color: colors.muted, marginTop: 20, textAlign: 'center', paddingHorizontal: 30 },
});
```

---

## Fase 3: Navegación extraída

### Crear `src/navigation/index.ts`

```typescript
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import CarteleraScreen from '../screens/CarteleraScreen';
import CafesScreen from '../screens/CafesScreen';
import PerfilScreen from '../screens/PerfilScreen';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'musical-notes';
            if (route.name === 'Cartelera') iconName = 'musical-notes';
            else if (route.name === 'Cafés') iconName = 'cafe';
            else iconName = 'person';
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
        })}
      >
        <Tab.Screen name="Cartelera" component={CarteleraScreen} />
        <Tab.Screen name="Cafés" component={CafesScreen} />
        <Tab.Screen name="Perfil" component={PerfilScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

---

## Fase 4: App.tsx simplificado

Reemplazar TODO `App.tsx`:

```typescript
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation';

export default function App() {
  return (
    <>
      <AppNavigator />
      <StatusBar style="light" />
    </>
  );
}
```

---

## Criterios de aceptación

- [ ] `src/components/TarjetaCafe.tsx` funciona con tipo 'asociado' y 'pendiente'
- [ ] `src/components/TarjetaEvento.tsx` existe y se renderiza correctamente
- [ ] CarteleraScreen.tsx muestra 5 eventos con TarjetaEvento
- [ ] CafesScreen.tsx usa TarjetaCafe + datos de src/data/mock/
- [ ] PerfilScreen.tsx usa tokens de theme
- [ ] App.tsx delega navegación a src/navigation/
- [ ] NO hay colores hardcodeados en screens (todos desde theme)
- [ ] NO hay datos mock inline en screens
- [ ] La app compila sin errores
- [ ] Los 3 tabs funcionan igual que antes visualmente