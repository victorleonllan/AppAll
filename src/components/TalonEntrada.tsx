import { View, Text, StyleSheet, Platform } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { EntradaPropia } from '../hooks/useMisEntradas';
import { TicketItemStatus } from '../types';
import { colors, spacing, borderRadius, fontSize } from '../theme';

/**
 * Spec 126 — colores al revés que en EntradasEventoScreen, a propósito (W-091):
 * para quien controla la puerta `used` es lo bueno; para el dueño de la entrada,
 * "Sin usar" es lo que todavía sirve. No unificar los dos mapeos.
 */
const ESTADO: Record<TicketItemStatus, { texto: string; color: string }> = {
  valid: { texto: 'Sin usar', color: colors.success },
  used: { texto: 'Ya entró', color: colors.muted },
  void: { texto: 'Anulada', color: colors.danger },
};

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** A mano y no con toLocaleTimeString: Hermes no garantiza el formato por locale. */
function horaDe(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TalonEntrada({ entrada }: { entrada: EntradaPropia }) {
  const { evento, status } = entrada;
  const estado = ESTADO[status] ?? ESTADO.valid;
  const anulada = status === 'void';
  const horaIngreso = status === 'used' && entrada.redeemedAt ? horaDe(entrada.redeemedAt) : null;
  const folio = `#${String(entrada.folio).padStart(3, '0')}`;

  return (
    <View style={[styles.talon, anulada && styles.anulada]}>
      <View style={styles.cabecera}>
        <View style={styles.filaSuperior}>
          <Text style={styles.marca}>Sonópolis</Text>
          <View style={styles.pildora}>
            <Text style={styles.textoPildora}>ENTRADA</Text>
          </View>
        </View>
        <Text style={styles.artista}>{evento?.artista ?? 'Evento'}</Text>
        {evento && (
          <>
            {!!evento.genero && <Text style={styles.genero}>{evento.genero}</Text>}
            <Text style={styles.detalle}>📍 {evento.venueName}</Text>
            <Text style={styles.detalle}>📅 {evento.fecha} · {evento.hora}</Text>
          </>
        )}
      </View>
      {evento?.status === 'cancelled' && (
        <View style={styles.franjaCancelado}>
          <Text style={styles.textoCancelado}>Evento cancelado</Text>
        </View>
      )}

      {/* Sin los semicírculos las dos mitades se leen como bloques apilados y no como un talón (W-091). */}
      <View style={styles.perforacion}>
        <View style={styles.linea} />
        <View style={[styles.muesca, styles.muescaIzq]} />
        <View style={[styles.muesca, styles.muescaDer]} />
      </View>

      <View style={styles.cuerpo}>
        <View accessible accessibilityLabel={`QR entrada ${folio}`}>
          <QRCode
            value={entrada.qrToken}
            size={200}
            quietZone={16}
            backgroundColor={colors.white}
            color={anulada ? colors.muted : colors.primary}
          />
        </View>
        {/* Respaldo cuando la cámara no lee: se dicta o se tipea (spec 040). */}
        <Text selectable style={styles.token}>{entrada.qrToken}</Text>
        <View style={styles.filaInferior}>
          <Text style={styles.folio}>{folio}</Text>
          <View style={styles.estado}>
            <Text style={[styles.textoEstado, { color: estado.color }]}>{estado.texto}</Text>
            {horaIngreso && <Text style={styles.horaIngreso}>Ingresó a las {horaIngreso}</Text>}
          </View>
        </View>
      </View>
    </View>
  );
}

const MUESCA = 22;

const styles = StyleSheet.create({
  talon: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.cardBackground,
  },
  anulada: { opacity: 0.6 },
  cabecera: {
    backgroundColor: colors.primary,
    padding: spacing.md,
  },
  filaSuperior: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  marca: { color: colors.white, fontSize: fontSize.sm, fontWeight: 'bold' },
  pildora: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  textoPildora: { color: colors.primary, fontSize: fontSize.xs, fontWeight: 'bold' },
  artista: { color: colors.white, fontSize: fontSize.lg, fontWeight: 'bold' },
  genero: { color: colors.white, fontSize: fontSize.sm, opacity: 0.75, marginTop: 2 },
  detalle: { color: colors.white, fontSize: fontSize.sm, opacity: 0.7, marginTop: spacing.xs },
  franjaCancelado: {
    backgroundColor: colors.danger,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  textoCancelado: { color: colors.white, fontSize: fontSize.sm, fontWeight: 'bold' },
  perforacion: {
    height: MUESCA,
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
  },
  linea: {
    marginHorizontal: spacing.md,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  muesca: {
    position: 'absolute',
    top: 0,
    width: MUESCA,
    height: MUESCA,
    borderRadius: MUESCA / 2,
    backgroundColor: colors.background,
  },
  muescaIzq: { left: -MUESCA / 2 },
  muescaDer: { right: -MUESCA / 2 },
  cuerpo: {
    backgroundColor: colors.cardBackground,
    alignItems: 'center',
    padding: spacing.md,
  },
  token: {
    fontSize: fontSize.xs,
    color: colors.secondary,
    fontFamily: MONO,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  filaInferior: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  folio: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  estado: { alignItems: 'flex-end' },
  textoEstado: { fontSize: fontSize.md, fontWeight: 'bold' },
  horaIngreso: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
});
