import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { cerrarEvento } from '../lib/admin';
import { formatearMonto } from '../lib/precio';
import { confirmar } from '../lib/confirm';
import { colors, spacing, borderRadius, fontSize } from '../theme';

interface Props {
  eventoId: string;
  monto: number;
  moneda: string | null;
  artista: string;
  titular?: string | null;
  cancelado: boolean;
  onCerrado: () => void;
}

/**
 * Spec 158 — port de `admin/BotonCerrarEvento.js` (W-172, W-175): da el evento por
 * pagado si tenía plata y lo cierra, en una sola acción. Las guardas viven en el RPC
 * `cerrar_evento` (specs 102/103) y su mensaje ya viene en español, así que se
 * muestra tal cual debajo del botón.
 */
export default function BotonCerrarEvento({ eventoId, monto, moneda, artista, titular, cancelado, onCerrado }: Props) {
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // W-175: un cancelado nunca dice «Pagado y cerrado» — el RPC lo cierra sin marcar
  // pago, porque esa plata es de los compradores.
  const conPlata = !cancelado && monto > 0;
  const texto = cerrando ? 'Cerrando…' : conPlata ? 'Pagado y cerrado' : 'Cerrar evento';

  const onCerrar = () => {
    const pregunta = cancelado
      ? `¿Cerrar ${artista}? Está cancelado: el cierre no registra pago al organizador` +
        (monto > 0 ? ` ni reembolso de los ${formatearMonto(monto, moneda)} vendidos` : '') +
        '. No se puede deshacer.'
      : conPlata
      ? `¿Ya transferiste ${formatearMonto(monto, moneda)}${titular ? ` a ${titular}` : ''}? ` +
        'Queda marcado como pagado y el evento se cierra. No se puede deshacer.'
      : `¿Cerrar ${artista}? No tiene entradas vendidas. No se puede deshacer.`;

    confirmar({ title: texto, message: pregunta, confirmText: texto, destructive: true }, async () => {
      setCerrando(true);
      setError(null);
      try {
        await cerrarEvento(eventoId);
        onCerrado();
      } catch (e: any) {
        setError(e?.message ?? 'No se pudo cerrar');
      } finally {
        setCerrando(false);
      }
    });
  };

  return (
    <View>
      <TouchableOpacity
        style={[styles.boton, cerrando && styles.deshabilitado]}
        onPress={onCerrar}
        disabled={cerrando}
      >
        {cerrando && <ActivityIndicator size="small" color={colors.white} />}
        <Text style={styles.texto}>{texto}</Text>
      </TouchableOpacity>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  boton: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  deshabilitado: { opacity: 0.6 },
  texto: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.sm },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.xs },
});
