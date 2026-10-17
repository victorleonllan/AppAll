import { View, Text, StyleSheet } from 'react-native';
import { Evento, PrecioVigente } from '../types';
import { formatearMonto } from '../lib/precio';
import { colors, borderRadius } from '../theme';

interface Props {
  evento: Evento;
  vigente: PrecioVigente | null;
  alinear?: 'inicio' | 'fin';
}

/**
 * Spec 119 — equivalente de `PrecioTarjeta` (sonopolisWeb/components/TarjetaEvento.js:89).
 * Muestra `monto` (lo que de verdad se paga, con el recargo) en la moneda del
 * evento; el texto libre `precio` solo si no hay monto. Una preventa se cobra en
 * la moneda de su evento, no en la que traiga la preventa.
 */
export default function PrecioEvento({ evento, vigente, alinear = 'inicio' }: Props) {
  const alineacion = alinear === 'fin' ? styles.fin : styles.inicio;

  if (!vigente?.preventaId) {
    if (evento.monto != null && evento.monto > 0) {
      return <Text style={[styles.monto, alineacion]}>{formatearMonto(evento.monto, evento.moneda)}</Text>;
    }
    if (evento.precio) {
      return <Text style={[styles.monto, alineacion]}>{evento.precio}</Text>;
    }
    return null;
  }

  return (
    <View style={[styles.columna, alineacion]}>
      <View style={styles.badge}>
        <Text style={styles.badgeTexto}>🔥 {vigente.preventaNombre}</Text>
      </View>
      <Text style={styles.monto}>
        {formatearMonto(vigente.monto, evento.moneda)}
        {vigente.restantes != null && (
          <Text style={styles.restantes}> · quedan {vigente.restantes}</Text>
        )}
      </Text>
      <Text style={styles.puerta}>puerta {formatearMonto(evento.monto, evento.moneda)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  columna: { marginTop: 6, gap: 2 },
  inicio: { alignSelf: 'flex-start' },
  fin: { alignSelf: 'flex-end' },
  monto: { fontSize: 15, fontWeight: 'bold', color: colors.success, marginTop: 6 },
  restantes: { fontWeight: 'normal', color: colors.muted },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentLight,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeTexto: { fontSize: 12, fontWeight: '600', color: colors.accent },
  puerta: { fontSize: 11, color: colors.muted },
});
