import { Platform, StyleProp, ViewStyle } from 'react-native';
// Solo el tipo: un import de valor arrastraría el módulo nativo al bundle web.
import type { Region } from 'react-native-maps';
import { Venue, VenueType } from '../types';
import { colors } from '../theme';

// Spec 127 — hermano de sonopolisWeb/libs/mapa.js. Funciones puras sobre datos
// ya cargados; la región de react-native-maps es centro + deltas, no esquinas.

export interface PuntoMapa { id: string; nombre: string; tipo: VenueType; lat: number; lng: number }

export interface PropsMapaLocales {
  puntos: PuntoMapa[];
  seleccionadoId?: string | null;
  onSeleccionar?: (id: string) => void;
  onVerDetalle?: (id: string) => void;
  interactivo?: boolean;               // false en la ficha: sin arrastre ni zoom
  deltaMinimo?: number;                // zoom máximo del encuadre inicial
  style?: StyleProp<ViewStyle>;
}

/** El color dice el tipo de local, igual que en la web (W-138). */
export const COLOR_TIPO_LOCAL: Record<VenueType, string> = {
  cafe: colors.accent,
  bar: colors.warning,
  sala: colors.primary,
  centro_cultural: colors.success,
};

/** Solo los locales con lat y lng: un local sin coordenadas no se dibuja, no se
 * inventa una posición (W-027). `Number()` porque la columna es numeric. */
export function puntosDeVenues(venues: Venue[]): PuntoMapa[] {
  return venues
    .filter((v) => v.lat != null && v.lng != null)
    .map((v) => ({ id: v.id, nombre: v.name, tipo: v.type, lat: Number(v.lat), lng: Number(v.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/** Distancia equirectangular: trata un pedazo de globo como un plano. El error
 * contra haversine es de metros a esta escala, y solo se compara contra 25 km. */
function distanciaKm(a: PuntoMapa, b: PuntoMapa): number {
  const RADIO_TIERRA_KM = 6371;
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * RADIO_TIERRA_KM;
}

/** El grupo más numeroso dentro del radio (W-163): encuadrar todos los puntos
 * puede abrir el mapa sobre el vacío entre dos ciudades (Cd. Juárez y Chihuahua
 * están a 350 km). Empate: gana el primero. O(n²), imperceptible con cientos. */
export function clusterPrincipal(puntos: PuntoMapa[], radioKm = 25): PuntoMapa[] {
  if (puntos.length === 0) return [];
  let mayor: PuntoMapa[] = [];
  for (const centro of puntos) {
    const grupo = puntos.filter((p) => distanciaKm(centro, p) <= radioKm);
    if (grupo.length > mayor.length) mayor = grupo;
  }
  return mayor;
}

/** Centro en el medio del rectángulo que contiene los puntos; el 1.4 deja margen
 * para que los pines del borde no queden cortados. null si no hay puntos. */
export function regionDe(puntos: PuntoMapa[], deltaMinimo = 0.02): Region | null {
  if (puntos.length === 0) return null;
  const lats = puntos.map((p) => p.lat);
  const lngs = puntos.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, deltaMinimo),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, deltaMinimo),
  };
}

/** false en web (react-native-maps no tiene implementación web) y en Android sin
 * clave de Google Maps (montar el MapView sin clave cierra la app). */
export function mapaDisponible(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') return !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
  return true;
}

/** URL universal de Google Maps: abre la app de mapas en Android y el navegador
 * en iOS y web. Coordenadas si hay; si no, la dirección; null si no hay nada. */
export function urlComoLlegar(venue: Venue): string | null {
  const base = 'https://www.google.com/maps/search/?api=1&query=';
  if (venue.lat != null && venue.lng != null) return `${base}${Number(venue.lat)},${Number(venue.lng)}`;
  const direccion = [venue.address, venue.comuna, venue.ciudad].filter(Boolean).join(', ');
  return direccion ? `${base}${encodeURIComponent(direccion)}` : null;
}
