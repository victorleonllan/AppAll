// Spec 173 — dos paletas con las mismas claves. La clara conserva los valores de
// `colors` de antes; los tokens nuevos separan roles que compartían token (`primary`
// como texto y como superficie) o eran hex sueltos. Valores claros idénticos al color
// que reemplazan: migrar una pantalla no cambia nada en claro.
export const paletaClara = {
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
  // Superficie oscura de marca: header, evento destacado, talón, cámara.
  block: '#3D2B1F',
  // Texto sobre un botón con fondo `primary`.
  onPrimary: '#FFFFFF',
  // Texto e iconos sobre fondo `accent`.
  onAccent: '#FFFFFF',
  dangerBg: '#FDECEA',
  dangerText: '#B71C1C',
  warningBg: '#FFF3E0',
  warningText: '#F57F17',
  successBg: '#E8F5E9',
  highlightBg: '#FFF8E1',
  highlightBorder: '#F5D77A',
  highlightText: '#8D6E00',
  closedBg: '#EFEAE5',
  // Ticket especial (packs, specs 165-166). La web no lo cambia en oscuro (W-254).
  especial: '#DC2626',
  especialContenido: '#FFFFFF',
  especialSuave: '#FDECEC',
} as const;

export type Paleta = { readonly [K in keyof typeof paletaClara]: string };

// Neutros de la tabla oscura de W-272. El acento es el marrón de la app aclarado:
// `#8B4513` sobre la tarjeta oscura da 2,36:1, ilegible como texto.
export const paletaOscura: Paleta = {
  background: '#121315',
  primary: '#F6F5F4',
  secondary: '#B0B3B7',
  accent: '#D4935C',
  accentLight: '#2E241C',
  muted: '#8A868D',
  cardBackground: '#1C1E20',
  success: '#57A06A',
  danger: '#E0634A',
  warning: '#EF6C00',
  white: '#FFFFFF',
  border: '#303236',
  // Igual que la tarjeta (W-272, `--son-bloque`, addenda del 12-nov): con negro puro
  // el header y el destacado se despegan de las tarjetas.
  block: '#1C1E20',
  // `primary` y `accent` son claros en oscuro: el texto encima pasa a casi negro.
  onPrimary: '#08090A',
  onAccent: '#08090A',
  dangerBg: '#3A1D18',
  dangerText: '#F28B7D',
  warningBg: '#3A2A12',
  warningText: '#F5B25B',
  successBg: '#16291B',
  highlightBg: '#2A2608',
  highlightBorder: '#6B6100',
  highlightText: '#F5DF4D',
  closedBg: '#17181A',
  especial: '#DC2626',
  especialContenido: '#FFFFFF',
  especialSuave: '#3A1A1A',
};

/**
 * @deprecated Spec 173: usar useEstilos/useTema. Alias de paletaClara mientras
 * quedan pantallas sin migrar.
 */
export const colors = paletaClara;

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
