import { Cafe } from '../../types';

export const cafesAsociados: Cafe[] = [
  { id: '1', nombre: 'Café La Palma', estilo: 'Jazz en vivo', distancia: '2 km', rating: 4.8 },
  { id: '2', nombre: 'Café Central', estilo: 'Blues los sábados', distancia: '3 km', rating: 4.5 },
  { id: '3', nombre: 'Café del Artista', estilo: 'Rock acústico', distancia: '1.5 km', rating: 4.7 },
];

export const cafesPendientes: Cafe[] = [
  { id: '4', nombre: 'Café del Mar', distancia: '500 m' },
  { id: '5', nombre: 'Star cafés', distancia: '1 km' },
  { id: '6', nombre: 'Café Foresta', distancia: '800 m' },
];

export const cafesPropios: Cafe[] = [
  { id: 'cafe-1', nombre: 'Café La Palma', estilo: 'Jazz en vivo', distancia: '', rating: 4.8 },
];
