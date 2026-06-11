# Spec 006: Músico crea eventos + sistema de venues — ✅ COMPLETADO

## Objetivo

Que los músicos puedan crear eventos asociados a un local (venue). Diferenciar entre **cafés** (locales registrados por dueños, visibles siempre en el mapa) y **locales no cafés** (solo aparecen cuando tienen eventos).

---

## Archivos a tocar

- `src/types/index.ts` — agregar interfaz `Venue`, actualizar `Evento`
- `src/data/mock/venues.ts` — crear mock de venues (cafés + otros)
- `src/data/mock/eventos.ts` — actualizar con `venueId`
- `src/screens/CrearEventoScreen.tsx` — reescribir (crear evento + selector/buscador de venues)
- `src/screens/PerfilMusicoScreen.tsx` — agregar sección "Mis Eventos" + botón "+ Nuevo Evento"
- `src/screens/DashboardCafeScreen.tsx` — actualizar (usar venues y eventos con venueId)
- `src/screens/CarteleraScreen.tsx` — actualizar (mostrar venue info)
- `src/screens/CafesScreen.tsx` — renombrar/concepto a "Locales", mostrar cafés siempre + otros venues con eventos

---

## Pasos de implementación

### 1. Actualizar tipos en `src/types/index.ts`

Agregar `Venue` y actualizar `Evento`:

```typescript
export interface Venue {
  id: string;
  name: string;
  type: "cafe" | "venue";      // cafe = permanente en mapa, venue = solo con eventos
  ownerId?: string;              // userId del dueño (solo cafes)
  address?: string;
  description?: string;
  estilo?: string;
  rating?: number;
  lat?: number;                  // coordenadas para mapa
  lng?: number;
  distance?: string;             // calculada para frontend
  image?: string | null;
}

export interface Evento {
  id: string;
  artista: string;
  venueId: string;               // FK a Venue (reemplaza "cafe" string)
  venueName: string;             // nombre del venue para display rápido
  fecha: string;
  hora: string;
  genero: string;
  precio: string;
  imagen: string | null;
  createdBy: string;            // userId del creador (músico o café)
}
```

Conservar `Cafe` y `Musico`/`PerfilMusico` existentes (se migrarán a Supabase después).

### 2. Crear mock de venues en `src/data/mock/venues.ts`

```typescript
import { Venue } from "../../types";

// Cafés — siempre visibles en el mapa/lista
export const cafes: Venue[] = [
  {
    id: "venue-cafe-1",
    name: "Café La Palma",
    type: "cafe",
    ownerId: "cafe-user-1",
    address: "Providencia 1234",
    estilo: "Jazz en vivo",
    rating: 4.8,
    distance: "2 km",
  },
  {
    id: "venue-cafe-2",
    name: "Café Central",
    type: "cafe",
    ownerId: "cafe-user-2",
    address: "Bellavista 567",
    estilo: "Blues los sábados",
    rating: 4.5,
    distance: "3 km",
  },
  {
    id: "venue-cafe-3",
    name: "Café del Artista",
    type: "cafe",
    ownerId: "cafe-user-3",
    address: "Lastarria 89",
    estilo: "Rock acústico",
    rating: 4.7,
    distance: "1.5 km",
  },
];

// Locales no cafés — solo aparecen con eventos
export const otrosVenues: Venue[] = [
  {
    id: "venue-other-1",
    name: "Teatro Municipal",
    type: "venue",
    address: "Agustinas 789",
    distance: "4 km",
  },
  {
    id: "venue-other-2",
    name: "Bar El Cantar",
    type: "venue",
    address: "Manuel Montt 345",
    distance: "1 km",
  },
];

export const allVenues: Venue[] = [...cafes, ...otrosVenues];
```

### 3. Actualizar mock de eventos en `src/data/mock/eventos.ts`

Reemplazar el campo `cafe` por `venueId` + `venueName`:

```typescript
import { Evento } from "../../types";

export const eventos: Evento[] = [
  { id: "1", artista: "Juana Fe", venueId: "venue-cafe-1", venueName: "Café La Palma", fecha: "Sáb 14 Jun", hora: "20:00", genero: "Samba / MPB", precio: "$5.000", imagen: null, createdBy: "cafe-user-1" },
  { id: "2", artista: "Los Andes Jazz", venueId: "venue-cafe-2", venueName: "Café Central", fecha: "Dom 15 Jun", hora: "19:30", genero: "Jazz fusión", precio: "$4.000", imagen: null, createdBy: "musico-user-2" },
  { id: "3", artista: "María Sol Trío", venueId: "venue-cafe-3", venueName: "Café del Artista", fecha: "Vie 20 Jun", hora: "21:00", genero: "Pop acústico", precio: "$6.000", imagen: null, createdBy: "cafe-user-3" },
  { id: "4", artista: "Banda de Garage", venueId: "venue-other-2", venueName: "Bar El Cantar", fecha: "Sáb 21 Jun", hora: "18:00", genero: "Rock alternativo", precio: "$3.500", imagen: null, createdBy: "musico-user-1" },
  { id: "5", artista: "Tango Sur", venueId: "venue-cafe-1", venueName: "Café La Palma", fecha: "Dom 22 Jun", hora: "20:30", genero: "Tango / Milonga", precio: "$5.000", imagen: null, createdBy: "cafe-user-1" },
];
```

Notar: los eventos pueden ser creados por cafes (`cafe-user-1`) O por músicos (`musico-user-1`).

### 4. Reescribir `src/screens/CrearEventoScreen.tsx`

Formulario completo para crear un evento desde cualquier rol (músico o café):

- **Campos**: Artista, Venue (selector con búsqueda), Fecha, Hora, Género, Precio
- **Selector de venue**: input de texto que al escribir filtra venues existentes (cafés + otros)
  - Si el texto coincide con un venue existente → lo selecciona
  - Si no coincide → aparece opción "Agregar [texto] como nuevo local"
  - Al presionar "Agregar nuevo", se crea un Venue con type="venue" (no café)
- **Botón "Publicar evento"**: agrega al array mock y muestra alerta de confirmación
- **Navegación**: después de publicar, volver al perfil/dashboard del creador

```tsx
// Estructura sugerida
export default function CrearEventoScreen({ navigation }) {
  const { user } = useAuth();
  const [artista, setArtista] = useState("");
  const [venueQuery, setVenueQuery] = useState("");
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [suggestions, setSuggestions] = useState<Venue[]>([]);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [genero, setGenero] = useState("");
  const [precio, setPrecio] = useState("");

  // Filtrar venues según búsqueda
  useEffect(() => {
    if (venueQuery.length > 0) {
      const filtrados = allVenues.filter(v =>
        v.name.toLowerCase().includes(venueQuery.toLowerCase())
      );
      setSuggestions(filtrados);
    } else {
      setSuggestions([]);
    }
  }, [venueQuery]);

  const handleSelectVenue = (venue: Venue) => {
    setSelectedVenue(venue);
    setVenueQuery(venue.name);
    setSuggestions([]);
  };

  const handleAgregarNuevoVenue = () => {
    const nuevoVenue: Venue = {
      id: `venue-new-${Date.now()}`,
      name: venueQuery,
      type: "venue",     // no es café, solo aparece con eventos
    };
    allVenues.push(nuevoVenue);      // mock global (se pierde al recargar)
    handleSelectVenue(nuevoVenue);
  };

  const handlePublicar = () => {
    if (!selectedVenue) {
      // Si no seleccionó un venue existente, crear uno nuevo
      handleAgregarNuevoVenue();
    }
    // Crear evento en mock
    Alert.alert(
      "Evento publicado",
      `"${artista}" en ${selectedVenue?.name ?? venueQuery} el ${fecha}`,
      [{ text: "OK", onPress: () => navigation.goBack() }]
    );
  };
}
```

### 5. Actualizar `src/screens/PerfilMusicoScreen.tsx`

Agregar al final del ScrollView:
- **Sección "Mis Eventos"**: lista de eventos donde `createdBy === user.id`
- **Botón "+ Nuevo Evento"**: navega a CrearEventoScreen

### 6. Actualizar `src/screens/DashboardCafeScreen.tsx`

Reemplazar el placeholder actual por el dashboard funcional:
- **Sección "Mis Eventos"**: eventos donde `createdBy === user.id`
- **Botón "+ Nuevo Evento"**: navega a CrearEventoScreen
- **Sección "Músicos disponibles"**: lista de músicos (del mock existente)
- **Datos del café**: nombre, dirección, estilo (del venue asociado al ownerId del user)

### 7. Actualizar `src/screens/CafesScreen.tsx`

Rediseñar como "Locales":
- **Cafés** (type="cafe"): siempre visibles, igual que antes (asociados + pendientes)
- **Otros locales** (type="venue"): solo aparecen si tienen eventos activos en la cartelera
- Al tocar un local que no es café, mostrar sus eventos activos

### 8. Actualizar `src/screens/CarteleraScreen.tsx`

Los eventos ahora muestran:
- Artista, venue (nombre), fecha, hora, género, precio
- El venue linkea al perfil del local si existe

---

## Diseño / UI

- **CrearEventoScreen**: input de venue con dropdown de sugerencias debajo, similar a Google Maps. Lista de venues con icono según tipo (☕ café, 🎪 otro local). Opción "Agregar [nombre]" al final si no hay match.
- **Perfil músico + Dashboard café**: misma sección "Mis Eventos" reutilizada, mismo botón "+" en ambas.
- **CafesScreen → Locales**: tabs o secciones separadas "☕ Cafés" y "🎪 Eventos en otros locales"

---

## Criterios de aceptación

- [x] Interfaz `Venue` existe con tipo cafe/venue
- [x] `Evento.venueId` reemplaza a `Evento.cafe`
- [x] Mock de venues con cafés + locales no cafés
- [x] CrearEventoScreen funcional: selector de venues con búsqueda + crear nuevo
- [x] Músico puede crear eventos desde su perfil
- [x] Café puede crear eventos desde su dashboard
- [x] Cafés siempre visibles en "Locales" (con o sin eventos)
- [x] Locales no cafés solo aparecen si tienen eventos
- [x] Cartelera muestra venue de cada evento
- [x] TypeScript compila sin errores (`npx tsc --noEmit`)
