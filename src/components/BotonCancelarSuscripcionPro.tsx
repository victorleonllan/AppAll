// Spec 169 — «Cancelar suscripción» en la tarjeta de Pro, con confirmación. Hermano de
// `components/BotonCancelarSuscripcionPro.js` de la web (W-265). Cancelar no es vender
// ni dirigir a pagar por fuera: es dejar de cobrar algo ya contratado (Decisión 1).
// `finTexto` lo arma la tarjeta: el diálogo dice la misma fecha que la tarjeta va a
// mostrar después de cancelar.

import { useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { confirmar } from '../lib/confirm';
import { cancelarMiSuscripcionPro } from '../lib/proSuscripcion';
import { fechaLargaPro } from '../lib/pro';
import { TipoTenant } from '../lib/adminPro';
import { useEstilos } from '../hooks/useEstilos';
import { Paleta, spacing, fontSize } from '../theme';

interface Props {
  tipo: TipoTenant;
  id: string;
  finTexto: string;
  onCancelada?: () => void;
}

export default function BotonCancelarSuscripcionPro({ tipo, id, finTexto, onCancelada }: Props) {
  const styles = useEstilos(crearEstilos);
  const [ocupado, setOcupado] = useState(false);
  const [exito, setExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cancelar() {
    setOcupado(true);
    setError(null);
    try {
      const { proHasta } = await cancelarMiSuscripcionPro(tipo, id);
      setExito(`Listo. Tienes Pro hasta el ${fechaLargaPro(proHasta)}.`);
      onCancelada?.();
    } catch (e: any) {
      // El error queda bajo el botón para leerlo y reintentar; nunca Alert.alert
      // (en el build web no se muestra, Decisión 4).
      setError(e?.message ?? 'No se pudo cancelar la suscripción');
    } finally {
      setOcupado(false);
    }
  }

  function alTocar() {
    confirmar(
      {
        title: '¿Cancelar Sonópolis Pro?',
        message: `No se te va a cobrar más. ${finTexto}`,
        confirmText: 'Sí, cancelar',
        cancelText: 'Seguir con Pro',
        destructive: true,
      },
      cancelar,
    );
  }

  return (
    <View style={styles.contenedor}>
      <TouchableOpacity onPress={alTocar} disabled={ocupado} accessibilityRole="button">
        <Text style={styles.boton}>{ocupado ? 'Cancelando…' : 'Cancelar suscripción'}</Text>
      </TouchableOpacity>
      {exito && <Text style={styles.exito}>{exito}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const crearEstilos = (c: Paleta) =>
  StyleSheet.create({
    contenedor: { marginTop: spacing.sm },
    // Texto discreto y subrayado: no es la acción principal de la tarjeta (igual que la web).
    boton: { fontSize: fontSize.sm, color: c.secondary, textDecorationLine: 'underline' },
    exito: { fontSize: fontSize.sm, color: c.success, marginTop: spacing.xs },
    error: { fontSize: fontSize.sm, color: c.danger, marginTop: spacing.xs },
  });
