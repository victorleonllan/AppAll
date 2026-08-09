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

/** Vocabulario cerrado desde el spec 030 (antes era texto libre). */
export type TipoProyecto = 'solista' | 'duo' | 'banda' | 'dj' | 'colectivo';

export interface PerfilMusico {
  id: string;
  userId: string;
  nombre: string;
  tipoProyecto: TipoProyecto | '';
  bio: string;
  instagram?: string;
  spotify?: string;
  youtube?: string;
  foto?: string | null;
  // Spec 030 — datos con los que un local decide contratar.
  ciudad?: string;
  generos?: string[];
  integrantes?: number;
  duracionShow?: number;
  telefono?: string;
  emailContacto?: string;
  sitioWeb?: string;
  tiktok?: string;
  riderTecnico?: string;
  updatedAt?: string;
}
