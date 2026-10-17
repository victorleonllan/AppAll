import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useEventoPermisos } from '../hooks/useEventoPermisos';
import { useCobroEvento } from '../hooks/useCobroEvento';
import { formatearMonto } from '../lib/precio';
import { colors, spacing, borderRadius, fontSize } from '../theme';

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function ultimos4(numeroCuenta: string | null | undefined): string {
  return (numeroCuenta ?? '').replace(/\s/g, '').slice(-4);
}

/**
 * Spec 140 — el owner ve cuánto recaudó, a qué cuenta va y el botón «Cobrar», que
 * mete el evento en la cola de pagos (Sonópolis no transfiere lo que nadie pidió,
 * spec 075). Port de `CobroEvento.js` de la web (W-081, W-085, W-086).
 *
 * El monto viene de `monto_a_transferir` y no se recalcula acá: dos
 * implementaciones de la misma fórmula terminan dando números distintos.
 */
export default function CobrarEventoScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { eventoId } = route.params as { eventoId: string };
  const permisos = useEventoPermisos(eventoId);
  const cobro = useCobroEvento(eventoId, permisos.esOwner);
  const [enviando, setEnviando] = useState(false);
  const [errorReclamo, setErrorReclamo] = useState<string | null>(null);
  const [reclamadoAhora, setReclamadoAhora] = useState(false);

  const monto = (n: number | null | undefined) => formatearMonto(n, cobro.moneda);

  async function cobrar() {
    setEnviando(true);
    setErrorReclamo(null);
    try {
      await cobro.reclamar();
      setReclamadoAhora(true);
    } catch (e: any) {
      // Las guardas viven en el RPC (spec 075): su mensaje sube tal cual. Sin
      // Alert.alert, que no funciona en el build web.
      setErrorReclamo(e?.message ?? 'No se pudo pedir el cobro');
    } finally {
      setEnviando(false);
    }
  }

  function contenido() {
    // La plata es del owner (spec 073, RLS de event_payouts). Además,
    // useCobroEvento no consulta nada sin esOwner: monto_a_transferir no tiene
    // guarda de dueño.
    if (!permisos.esOwner) {
      return <Text style={styles.mensaje}>Solo el dueño del evento cobra lo recaudado.</Text>;
    }

    if (cobro.cargando) {
      return <ActivityIndicator size="large" color={colors.accent} style={styles.cargando} />;
    }

    if (cobro.error) {
      return (
        <>
          <Text style={styles.mensaje}>{cobro.error}</Text>
          <TouchableOpacity style={styles.botonReintentar} onPress={cobro.recargar}>
            <Text style={styles.textoBotonReintentar}>Reintentar</Text>
          </TouchableOpacity>
        </>
      );
    }

    // Spec 103 — con el evento cancelado lo recaudado se devuelve.
    if (cobro.cancelado) {
      return (
        <View style={styles.card}>
          <Text style={styles.texto}>
            Este evento se canceló: lo recaudado vuelve a quien compró, no se transfiere al organizador.
          </Text>
        </View>
      );
    }

    if (!cobro.showTermino) {
      return (
        <View style={styles.card}>
          <Text style={styles.texto}>
            Podrás cobrar cuando termine el show: hasta entonces se siguen vendiendo entradas y el monto no es final.
          </Text>
          <Text style={styles.textoSecundario}>Recaudado hasta ahora: {monto(cobro.monto)}</Text>
        </View>
      );
    }

    const payout = cobro.payout;

    if (!payout) {
      return (
        <View style={[styles.card, styles.cardAviso]}>
          <Text style={styles.texto}>
            Faltan tus datos bancarios. Sin ellos no podemos transferirte lo recaudado.
          </Text>
          {/* El bloque de banco de Editar evento lo pone el spec 136. */}
          <TouchableOpacity
            style={styles.boton}
            onPress={() => (navigation as any).navigate('EditarEvento', { eventoId })}
          >
            <Text style={styles.textoBoton}>Cargar datos bancarios</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (payout.status === 'pagado') {
      return (
        <View style={styles.card}>
          <Text style={styles.check}>✓</Text>
          <Text style={styles.titulo}>Te transferimos {monto(payout.montoPagado)}</Text>
          {payout.pagadoAt && <Text style={styles.textoSecundario}>{fechaHora(payout.pagadoAt)}</Text>}
        </View>
      );
    }

    if (payout.status === 'reclamado') {
      return (
        <View style={styles.card}>
          {reclamadoAhora && (
            <Text style={styles.exito}>Pago reclamado — Sonópolis va a transferirte</Text>
          )}
          <Text style={styles.titulo}>Cobro pedido · {monto(cobro.monto)}</Text>
          <Text style={styles.texto}>
            Sonópolis te va a transferir a tu {payout.banco}, cuenta terminada en {ultimos4(payout.numeroCuenta)}.
          </Text>
          {payout.reclamadoAt && (
            <Text style={styles.textoSecundario}>Lo pediste el {fechaHora(payout.reclamadoAt)}.</Text>
          )}
        </View>
      );
    }

    // pendiente
    const sinVentas = cobro.monto <= 0;
    return (
      <View style={styles.card}>
        <Text style={styles.textoSecundario}>Recaudado en este show</Text>
        <Text style={styles.montoGrande}>{monto(cobro.monto)}</Text>
        <Text style={styles.texto}>
          Va a tu {payout.banco}, cuenta terminada en {ultimos4(payout.numeroCuenta)}.
        </Text>
        {/* Rojo a propósito (pedido de Victor en la web): si pasa desapercibido, no cobra. */}
        <TouchableOpacity
          style={[styles.botonCobrar, (sinVentas || enviando) && styles.botonDeshabilitado]}
          onPress={cobrar}
          disabled={sinVentas || enviando}
        >
          <Text style={styles.textoBoton}>{enviando ? 'Enviando…' : 'Cobrar'}</Text>
        </TouchableOpacity>
        {sinVentas && (
          <Text style={styles.textoSecundario}>
            Este show no vendió entradas por Sonópolis, así que no hay nada que transferir.
          </Text>
        )}
        {errorReclamo && <Text style={styles.error}>{errorReclamo}</Text>}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {contenido()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100 },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardAviso: {
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  cargando: { marginTop: 40 },
  mensaje: {
    fontSize: fontSize.md,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: spacing.lg,
  },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary, marginBottom: spacing.sm },
  texto: { fontSize: fontSize.md, color: colors.primary },
  textoSecundario: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm },
  montoGrande: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.primary,
    marginVertical: spacing.sm,
  },
  check: { fontSize: fontSize.xl, color: colors.success, fontWeight: 'bold', marginBottom: spacing.sm },
  exito: { fontSize: fontSize.sm, color: colors.success, fontWeight: 'bold', marginBottom: spacing.sm },
  error: { fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.sm },
  boton: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  botonCobrar: {
    backgroundColor: colors.danger,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  botonDeshabilitado: { opacity: 0.5 },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  botonReintentar: {
    marginTop: spacing.md,
    alignSelf: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
  },
  textoBotonReintentar: { color: colors.white, fontWeight: 'bold' },
});
