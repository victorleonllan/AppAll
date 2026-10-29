// Spec 154 — Tarjeta informativa de Sonópolis Pro en los paneles de local y de músico.
// Hermana de `components/CardSonopolisPro.js` de la web, sin precio, sin botón de compra
// y sin ningún llamado a pagar por fuera: Pro no se vende en la app.

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { esPro, esProSinVencimiento, diasRestantesPro, fechaHastaPro } from '../lib/pro';
import { colors, spacing, borderRadius, fontSize } from '../theme';

interface Props {
  tenant: { sonopolisProHasta?: string | null };
  etiqueta: string; // «tu local» | «tu banda», igual que `tenantLabel` de la web
  onVerContactos?: () => void; // el 155 lo pasa; sin él no se dibuja el enlace
}

export default function TarjetaPro({ tenant, etiqueta, onVerContactos }: Props) {
  const activo = esPro(tenant);
  const sinVencimiento = esProSinVencimiento(tenant);
  const dias = diasRestantesPro(tenant);
  const fecha = fechaHastaPro(tenant);
  // Misma regla de la web: vence pronto a 7 días o menos.
  const porVencer = activo && !sinVencimiento && dias !== null && dias <= 7;

  return (
    <View style={styles.card}>
      <View style={styles.filaTitulo}>
        <Text style={styles.titulo}>Sonópolis Pro</Text>
        {porVencer && (
          <View style={styles.etiquetaVence}>
            <Text style={styles.etiquetaVenceTexto}>VENCE PRONTO</Text>
          </View>
        )}
      </View>

      {activo ? (
        <>
          <Text style={styles.texto}>
            {sinVencimiento
              ? 'Activo, sin fecha de vencimiento.'
              : porVencer
                ? `Activo hasta el ${fecha} — quedan ${dias} ${dias === 1 ? 'día' : 'días'}.`
                : `Activo hasta el ${fecha}.`}
          </Text>
          {onVerContactos && (
            <TouchableOpacity onPress={onVerContactos} style={styles.enlace}>
              <Text style={styles.enlaceTexto}>Ver tus contactos →</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.texto}>Avisa a tus seguidores por WhatsApp desde la ficha de cada evento.</Text>
        </>
      ) : (
        <>
          <Text style={styles.texto}>
            Con Sonópolis Pro ves en un solo lugar a tu público: quienes compran entradas para {etiqueta}, quienes
            te siguen y quienes dejan su WhatsApp.
          </Text>
          <Text style={[styles.texto, { color: colors.muted }]}>Tu cuenta no tiene Sonópolis Pro activo.</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  filaTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  titulo: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary },
  etiquetaVence: {
    backgroundColor: colors.warning,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  etiquetaVenceTexto: { color: colors.white, fontSize: fontSize.xs, fontWeight: 'bold' },
  texto: { fontSize: fontSize.sm, color: colors.secondary, marginTop: spacing.xs },
  enlace: { marginTop: spacing.sm },
  enlaceTexto: { fontSize: fontSize.sm, color: colors.accent, fontWeight: 'bold' },
});
