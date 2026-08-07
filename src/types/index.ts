export type VenueType = "cafe" | "bar" | "sala" | "centro_cultural";

export interface Venue {
  id: string;
  name: string;
  type: VenueType;
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
  monto?: number;
}

export type TicketStatus = 'pending' | 'completed' | 'refunded' | 'cancelled';

export interface Ticket {
  id: string;
  eventoId: string;
  userId: string;
  status: TicketStatus;
  preferenceId: string;
  paymentId?: string;
  monto: number;
  createdAt: string;
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
  tipoProyecto: string;
  bio: string;
  instagram?: string;
  spotify?: string;
  youtube?: string;
  foto?: string | null;
}
