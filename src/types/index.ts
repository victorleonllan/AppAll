export interface Venue {
  id: string;
  name: string;
  type: "cafe" | "venue";
  ownerId?: string;
  address?: string;
  description?: string;
  estilo?: string;
  rating?: number;
  lat?: number;
  lng?: number;
  distance?: string;
  image?: string | null;
}

export interface Evento {
  id: string;
  artista: string;
  venueId: string;
  venueName: string;
  fecha: string;
  hora: string;
  genero: string;
  precio: string;
  imagen: string | null;
  createdBy: string;
}

export interface Cafe {
  id: string;
  nombre: string;
  estilo?: string;
  distancia: string;
  rating?: number;
}

export interface Musico {
  id: string;
  nombre: string;
  genero: string;
  bio: string;
}

export interface PerfilMusico {
  id: string;
  userId: string;
  nombre: string;
  genero: string;
  bio: string;
  instagram?: string;
  spotify?: string;
  youtube?: string;
  foto?: string | null;
}
