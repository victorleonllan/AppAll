import { VenueType } from '../types';

/** Etiqueta legible por tipo de local (spec 018). */
export const VENUE_LABEL: Record<VenueType, string> = {
  cafe: 'Café',
  bar: 'Bar',
  sala: 'Sala',
  centro_cultural: 'Centro cultural',
};

/** Emoji por tipo de local. Fuente única para toda la UI. */
export const VENUE_EMOJI: Record<VenueType, string> = {
  cafe: '☕',
  bar: '🍺',
  sala: '🎪',
  centro_cultural: '🎭',
};

export const venueEmoji = (type: VenueType): string => VENUE_EMOJI[type] ?? '📍';
export const venueLabel = (type: VenueType): string => VENUE_LABEL[type] ?? 'Local';
