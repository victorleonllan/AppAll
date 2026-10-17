export type VenueType = "cafe" | "bar" | "sala" | "centro_cultural";

export interface Venue {
  id: string;
  name: string;
  type: VenueType;
  // Spec 095 — ISO 3166-1 alpha-2. NOT NULL sin DEFAULT en la base (spec 080):
  // un insert que no lo mande falla con 23502 en vez de asumir Chile.
  pais: string;
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
  avatar?: string | null; // spec 085
}

/** Spec 033 — estado del evento. 'draft' solo lo ve el equipo; 'cancelled'
 * sigue público (quien compró tiene que poder ver que el show se canceló). */
export type EventoStatus = 'draft' | 'published' | 'cancelled';

/** Spec 064 — `general`: un precio fijo. `puerta`: el precio es el de la puerta y
 * lo que se vende antes son preventas (spec 135, `usePreventas`). */
export type TipoPrecio = 'general' | 'puerta';

export interface Evento {
  id: string;
  artista: string;
  artistId?: string | null;   // Spec 033 — FK opcional a profiles (role='musician')
  venueId: string;
  venueName: string;
  pais: string;               // Spec 095 — copia denormalizada de venue.pais (spec 080)
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
  comienzaAt?: string | null;   // Spec 116 — events.comienza_at (spec 045). null en eventos viejos
  moneda?: string | null;       // Spec 116 — events.moneda (spec 100), solo lectura
  // Spec 119 — opcionales para no romper los objetos que se arman a mano
  // (el `Omit<Evento, 'id'>` de createEvento).
  tipoPrecio?: TipoPrecio;            // spec 064
  descripcion?: string | null;        // spec 087
  visibleEnCartelera?: boolean;       // spec 079
  createdAt?: string;                 // fecha de publicación (no del show); la usa el feed del 123
}

/** Spec 135 — regla de cierre de una preventa (spec 082): N horas antes del show,
 * o una fecha fija. */
export type CierreTipo = 'horas_antes' | 'fecha';

/** Spec 135 — lo que el formulario arma antes de que la preventa exista en la base. */
export interface BorradorPreventa {
  precio: string;
  cupo: number;                    // spec 068: obligatorio, toda preventa tiene límite
  cierreTipo: CierreTipo;
  cierreHorasAntes: number | null; // solo con `horas_antes`
  cierreAt: string | null;         // solo con `fecha`
}

/** Spec 135 — fila de `event_preventas`. */
export interface Preventa extends BorradorPreventa {
  id: string;
  eventId: string;
  nombre: string;          // «Preventa N», lo pone el cliente, no quien organiza
  orden: number;
  monto: number;
  vendidos: number;
  activa: boolean;
  cierraAt: string | null; // columna calculada `preventa_cierra_at` (spec 083)
  createdAt: string;
}

/** Spec 119 — evento scrapeado de otra plataforma (spec 049). No se vende en Sonópolis. */
export interface EventoExterno {
  id: string;
  sourceSlug: string;
  fuenteNombre: string;   // event_sources.nombre; fallback al slug
  sourceUrl: string;
  titulo: string;
  comienzaAt: string;     // NOT NULL en la tabla
  venueNombre: string | null;
  comuna: string | null;
  pais: string;
  imagen: string | null;
  genero: string | null;
}

/** Spec 119 — respuesta del RPC precio_vigente_de (spec 100). */
export interface PrecioVigente {
  precio: string;
  monto: number;
  preventaId: string | null;
  preventaNombre: string | null;
  restantes: number | null;
  cierraAt: string | null;
  moneda: string | null;
  seVende: boolean;
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

/** Spec 036 — estado de puerta de una entrada individual, ortogonal a TicketStatus
 * (que es el estado del pago). 'void' existe reservado sin escritor todavía —
 * llega con el reembolso, ver spec 040. */
export type TicketItemStatus = 'valid' | 'used' | 'void';

export interface TicketItem {
  id: string;
  ticketId: string;
  eventoId: string;
  folio: number;
  qrToken: string;
  status: TicketItemStatus;
  redeemedAt: string | null;
  // Datos de la compra a la que pertenece, vía el join con tickets (spec 039).
  compradorUserId: string;
  compradorNombre?: string;
  // Spec 135 — opcionales para no romper a quien ya arma un TicketItem.
  compraPagada?: boolean;           // tickets.status === 'completed'
  cantidadEnCompra?: number;        // el correo lleva la compra entera
  entradaEnviadaAt?: string | null; // tickets.entrada_enviada_at; null = nunca salió
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
  // Spec 121 — solo lectura por ahora; escribirlos es del spec 130.
  pais?: string;            // spec 106 — ISO alpha-2
  avatar?: string | null;   // spec 085 — logo chico; `foto` es la imagen grande
  available?: boolean;      // spec 051 — «disponible este finde»
}

// Spec 123 — seguir músicos y locales (tablas del spec 047).
export type TipoSeguible = 'musico' | 'venue';

/** Lo mínimo de un local seguido para listarlo (spec 123, Decisión 2). */
export type VenueSeguido = Pick<Venue, 'id' | 'name' | 'type' | 'comuna' | 'image'>;

export interface ItemFeed {
  evento: Evento;
  autor: { tipo: TipoSeguible; id: string; nombre: string };
}
