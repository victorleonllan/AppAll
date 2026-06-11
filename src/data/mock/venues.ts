import { Venue } from "../../types";

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
