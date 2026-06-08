export interface Evento {
  id: string;
  artista: string;
  cafe: string;
  fecha: string;
  hora: string;
  genero: string;
  precio: string;
  imagen: string | null;
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
