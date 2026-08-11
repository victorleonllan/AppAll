export const colors = {
  background: '#FAF0E6',
  primary: '#3D2B1F',
  secondary: '#6B4F3A',
  accent: '#8B4513',
  accentLight: '#F5EDE6',
  muted: '#A0897A',
  cardBackground: '#FFFFFF',
  success: '#2E7D32',
  // Spec 041 — el resultado del escáner se lee de reojo, de noche y con ruido:
  // el color llega antes que la palabra, así que rechazo y advertencia necesitan
  // tono propio y no alcanzaba con `muted`.
  danger: '#C62828',
  warning: '#EF6C00',
  white: '#FFFFFF',
  border: '#E8DDD4',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 48,
} as const;
