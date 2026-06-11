# Spec 005: Dashboard café privado — ✅ COMPLETADO

## Objetivo
Crear el dashboard privado para usuarios con rol "cafe": pueden ver sus eventos, crear nuevos eventos, y explorar los perfiles de músicos disponibles para contactarlos.

**Dependencia**: Este spec requiere que 004 esté completo (tipos `PerfilMusico` y mock data de músicos ya existentes).

---

## Archivos a tocar

- `src/types/index.ts` — extender si hace falta (opcional)
- `src/data/mock/eventos.ts` — agregar campo `cafeId` para filtrar por café dueño
- `src/screens/DashboardCafeScreen.tsx` — crear (dashboard principal del café)
- `src/screens/CrearEventoScreen.tsx` — crear (formulario de nuevo evento)
- `src/screens/CafesScreen.tsx` — modificar (integrar listado de músicos desde spec 004 + conectar con Dashboard)
- `src/navigation/index.tsx` — conectar DashboardCafeScreen como tercer tab cuando role="cafe"
- `src/navigation/CafesStack.tsx` — actualizar (si ya existe del spec 004, agregar ruta a DashboardCafeScreen opcionalmente)

---

## Pasos de implementación

### 1. Agregar `cafeId` al mock de eventos

En `src/data/mock/eventos.ts`, agregar el campo `cafeId` a cada evento:

```typescript
export const eventos: Evento[] = [
  { id: "1", artista: "Juana Fe", cafe: "Café La Palma", cafeId: "cafe-1", fecha: "Sáb 14 Jun", hora: "20:00", genero: "Samba / MPB", precio: "$5.000", imagen: null },
  { id: "2", artista: "Los Andes Jazz", cafe: "Café Central", cafeId: "cafe-2", fecha: "Dom 15 Jun", hora: "19:30", genero: "Jazz fusión", precio: "$4.000", imagen: null },
  { id: "3", artista: "María Sol Trío", cafe: "Café del Artista", cafeId: "cafe-2", fecha: "Vie 20 Jun", hora: "21:00", genero: "Pop acústico", precio: "$6.000", imagen: null },
  { id: "4", artista: "Banda de Garage", cafe: "Café Foresta", cafeId: "cafe-1", fecha: "Sáb 21 Jun", hora: "18:00", genero: "Rock alternativo", precio: "$3.500", imagen: null },
  { id: "5", artista: "Tango Sur", cafe: "Café La Palma", cafeId: "cafe-1", fecha: "Dom 22 Jun", hora: "20:30", genero: "Tango / Milonga", precio: "$5.000", imagen: null },
];
```

También actualizar `src/types/index.ts` agregando `cafeId` opcional a `Evento`:

```typescript
export interface Evento {
  // ... campos existentes ...
  cafeId?: string;      // opcional por ahora, mock
}
```

Y crear mock de cafés dueños (para simular "este café es el mío"):

En `src/data/mock/cafes.ts`, agregar una constante extra:

```typescript
export const cafesPropios: Cafe[] = [
  { id: "cafe-1", nombre: "Café La Palma", estilo: "Jazz en vivo", distancia: "", rating: 4.8 },
];
```

Esto simula que el usuario logueado como café es dueño de "Café La Palma".

### 2. Crear `src/screens/DashboardCafeScreen.tsx`

El dashboard principal del café logueado. Debe mostrar:

- **Encabezado**: "☕ Bienvenido, [nombre del café]"
- **Sección "Mis Eventos"**: lista de eventos cuyo `cafeId` coincide con el café del usuario logueado
- **Botón flotante** (FAB) o botón destacado "+ Nuevo Evento" que navega a `CrearEventoScreen`
- **Sección "Músicos disponibles"**: lista de músicos del mock, con navegación a VerMusicoScreen (del spec 004) para contactarlos

```tsx
// Estructura sugerida
export default function DashboardCafeScreen({ navigation }) {
  const { user } = useAuth();
  // cafeId mock: "cafe-1" (eventualmente vendrá de la tabla profiles en Supabase)
  const misEventos = eventos.filter(e => e.cafeId === "cafe-1");
  // ...
}
```

Usar `FlatList` con `ListHeaderComponent` para organizar las secciones.

### 3. Crear `src/screens/CrearEventoScreen.tsx`

Formulario para crear un nuevo evento:

- Campos: Artista (text), Fecha (text, ej: "Sáb 28 Jun"), Hora (text, ej: "21:00"), Género (text o picker), Precio (text)
- Botón "Publicar evento" que agrega el evento al mock local (push a array)
- Después de publicar, navegar de vuelta al Dashboard y mostrar el nuevo evento
- Por ahora es solo mock — los datos se pierden al recargar, pero la experiencia de flujo queda completa

```tsx
export default function CrearEventoScreen({ navigation, route }) {
  const [artista, setArtista] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [genero, setGenero] = useState("");
  const [precio, setPrecio] = useState("");

  const handlePublicar = () => {
    // Agregar a array mock global (o mostrar alert)
    Alert.alert(
      "Evento publicado",
      `"${artista}" el ${fecha} a las ${hora}`,
      [{ text: "OK", onPress: () => navigation.goBack() }]
    );
  };
}
```

### 4. Actualizar navegación

En `src/navigation/index.tsx`, el tercer tab cuando `role === "cafe"` debe apuntar a `DashboardCafeScreen`.

Además, para que `CrearEventoScreen` funcione con navegación, conviene crear un **CafeStack**:

```tsx
// src/navigation/CafeStack.tsx
const Stack = createNativeStackNavigator();

export default function CafeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Dashboard" component={DashboardCafeScreen} />
      <Stack.Screen name="CrearEvento" component={CrearEventoScreen} />
      <Stack.Screen name="VerMusico" component={VerMusicoScreen} />
    </Stack.Navigator>
  );
}
```

Luego en `index.tsx`, usar `CafeStack` como component del tercer tab cuando role="cafe".

### 5. Conectar todo

Asegurar que:
- Desde DashboardCafeScreen → botón "+ Nuevo Evento" → CrearEventoScreen
- Desde DashboardCafeScreen → tarjeta de músico → VerMusicoScreen
- Desde CrearEventoScreen → publicar → goBack al dashboard

---

## Diseño / UI

- **Dashboard**: Fondo beige, tarjeta blanca para "Mis Eventos" con las mismas TarjetaEvento reutilizadas, botón FAB verde o accent para "+" en la esquina inferior derecha
- **CrearEvento**: Formulario vertical con labels en primary, inputs con borde border, fondo blanco, botón publicar en accent
- **Músicos disponibles**: Tarjetas pequeñas con nombre, género y botón "Ver perfil" en accentLight

---

## ✅ Criterios de aceptación — cumplidos

- [x] `cafeId` agregado a tipo `Evento` y a datos mock
- [x] Mock de `cafesPropios` creado (simula dueño de café)
- [x] `DashboardCafeScreen` existe y muestra "Mis Eventos" filtrados
- [x] `CrearEventoScreen` existe con formulario funcional
- [x] Botón "+ Nuevo Evento" navega a CrearEventoScreen
- [x] Sección "Músicos disponibles" en el Dashboard con navegación a VerMusicoScreen
- [x] `CafeStack.tsx` creado con las rutas
- [x] Tercer tab muestra "Mi Café" cuando role="cafe" con DashboardCafeScreen
- [x] TypeScript compila sin errores (`npx tsc --noEmit`)
- [x] Datos mock coherentes con spec 004 (mismos músicos, mismos cafés)

## Nota: pendiente de redefinir con venues

Este spec se implementó con la estructura `cafeId`. Cuando se implemente **spec 006** (sistema de venues), el dashboard deberá migrarse a usar `venueId` en lugar de `cafeId`, y el café se asociará a un `Venue` de tipo `"cafe"`.
