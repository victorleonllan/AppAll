export type VenueType = "cafe" | "bar" | "sala" | "centro_cultural";

export interface Venue {
  id: string;
  name: string;
  type: VenueType;
  ownerId?: string;
  address?: string;
  description?: string;
  estilo?: string;
  // spec 031 — perfil del local
  ciudad?: string;
  comuna?: string;
  aforo?: number;
  telefono?: string;
  emailContacto?: string;
  instagram?: string;
  sitioWeb?: string;
  horarios?: string;
  tieneEscenario?: boolean;
  tieneSonido?: boolean;
  tieneBackline?: boolean;
  updatedAt?: string;
  // Ningún flujo escribe `rating` todavía (los 3 valores actuales se cargaron
  // a mano, no salen de reseñas). Se mantiene en el tipo porque la columna
  // existe, pero ninguna pantalla debe mostrarlo — ver spec 031.
  rating?: number;
  lat?: number;
  lng?: number;
  distance?: string;
  image?: string | null;
}

/** Spec 033 — estado del evento. 'draft' solo lo ve el equipo; 'cancelled'
 * sigue público (quien compró tiene que poder ver que el show se canceló). */
export type EventoStatus = 'draft' | 'published' | 'cancelled';

export interface Evento {
  id: string;
  artista: string;
  artistId?: string | null;   // Spec 033 — FK opcional a profiles (role='musician')
  venueId: string;
  venueName: string;
  fecha: string;
  hora: string;
  genero: string;
  precio: string;
  imagen: string | null;
  createdBy: string;          // Spec 033 — hecho histórico, ya no autoriza nada; ver EventRole
  monto?: number;
  status?: EventoStatus;      // Spec 033 — default 'published' en DB
  cancelledAt?: string | null;
  cancelReason?: string | null;
}

/** Spec 033 — rol dentro del equipo de un evento (tabla event_collaborators). */
export type EventRole = 'owner' | 'admin' | 'editor';

/** Spec 033 — por qué alguien está en el equipo de un evento. La UI lo usa
 * para explicar la fila ("dueño del local") en vez de mostrar un nombre suelto. */
export type ColaboradorSource = 'claim' | 'venue_owner' | 'artist' | 'invited' | 'backfill';

export interface Colaborador {
  eventId: string;
  userId: string;
  role: EventRole;
  canDelete: boolean;
  source: ColaboradorSource;
  invitedBy?: string | null;
  createdAt: string;
  nombre?: string;   // se completa al hacer join con profiles, no viene de la tabla
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
