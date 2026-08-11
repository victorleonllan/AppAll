import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { useEventos } from '../context/EventosContext';
import { useEntradasEvento } from '../hooks/useEntradasEvento';
import { useEventoPermisos } from '../hooks/useEventoPermisos';
import { TicketItem } from '../types';
import { colors, spacing, borderRadius, fontSize } from '../theme';

function horaDeIso(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Spec 039 — solo lectura: muestra lo que 036-038 dejan en la base, no escribe
 * nada. El canje es del 040 (la función) y del 041 (la pantalla de escaneo).
 */
export default function EntradasEventoScreen() {
  const route = useRoute();
  const { eventoId } = route.params as { eventoId: string };
  const { eventos } = useEventos();
  const permisos = useEventoPermisos(eventoId);
  const { cargando, error, entradas, comprasSinEmitir, contadores, refrescar } = useEntradasEvento(eventoId);
  const [qrSeleccionado, setQrSeleccionado] = useState<TicketItem | null>(null);

  const evento = eventos.find((e) => e.id === eventoId);

  if (cargando) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Defensa en profundidad, no la defensa: RLS (ti_select del 036,
  // tickets_select_event_team del 038) ya devuelve 0 filas a quien no es del
  // equipo. Esto solo evita mostrar una pantalla que va a salir vacía.
  if (!permisos.puedeEditar) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTexto}>No tienes acceso a las entradas de este evento</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTexto}>{error}</Text>
        <TouchableOpacity style={styles.botonReintentar} onPress={refrescar}>
          <Text style={styles.textoBotonReintentar}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {evento && (
        <View style={styles.card}>
          <Text style={styles.tituloEvento}>{evento.artista}</Text>
          <Text style={styles.subtituloEvento}>{evento.venueName} · {evento.fecha}</Text>
        </View>
      )}

      <View style={[styles.card, styles.filaContadores]}>
        <View style={styles.contador}>
          <Text style={styles.contadorNumero}>{contadores.emitidas}</Text>
          <Text style={styles.contadorLabel}>emitidas</Text>
        </View>
        <View style={styles.contador}>
          <Text style={styles.contadorNumero}>{contadores.dentro}</Text>
          <Text style={styles.contadorLabel}>dentro</Text>
        </View>
        <View style={styles.contador}>
          <Text style={styles.contadorNumero}>{contadores.porPagar}</Text>
          <Text style={styles.contadorLabel}>por pagar</Text>
        </View>
      </View>

      <View style={styles.card}>
        {entradas.length === 0 && comprasSinEmitir.length === 0 && (
          <Text style={styles.vacio}>Todavía no hay entradas para este evento.</Text>
        )}
        {entradas.map((item) => (
          <View key={item.id} style={styles.filaEntrada}>
            <Text style={styles.folio}>#{String(item.folio).padStart(3, '0')}</Text>
            <View style={styles.datosEntrada}>
              <Text style={styles.compradorNombre}>{item.compradorNombre || 'Comprador'}</Text>
              <Text style={styles.estadoEntrada}>
                {item.status === 'used'
                  ? `✓ entró ${horaDeIso(item.redeemedAt)}`
                  : item.status === 'void'
                    ? 'anulada'
                    : 'válida'}
              </Text>
            </View>
            {item.status === 'valid' && (
              <TouchableOpacity style={styles.botonQr} onPress={() => setQrSeleccionado(item)}>
                <Text style={styles.textoBotonQr}>QR</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* Spec 037 emite al confirmar el pago: una compra completed sin
            ticket_items es "pagada, entradas en camino" (el webhook todavía no
            emitió o falló), y no lo mismo que una pending, que ni pagó. */}
        {comprasSinEmitir.map((c) => (
          <View key={c.ticketId} style={styles.filaEntrada}>
            <Text style={styles.iconoPendiente}>
              {c.estado === 'pagada_sin_emitir' ? '⏳' : '○'}
            </Text>
            <Text style={styles.textoPendiente}>
              {c.estado === 'pagada_sin_emitir'
                ? `Compra de ${c.cantidad} pagada, entradas en camino`
                : `Compra de ${c.cantidad} sin pagar`}
            </Text>
          </View>
        ))}
      </View>

      {qrSeleccionado && (
        <View style={styles.overlay}>
          <View style={styles.qrCard}>
            <Text style={styles.qrFolio}>#{String(qrSeleccionado.folio).padStart(3, '0')}</Text>
            <Text style={styles.qrComprador}>{qrSeleccionado.compradorNombre || 'Comprador'}</Text>
            <View style={styles.qrWrap}>
              {/* Contenido: el token pelado, sin URL ni prefijo — un token hex
                  de 32 caracteres entra en modo alfanumérico y produce menos
                  módulos que si se empuja a modo byte metiéndolo en una URL. */}
              <QRCode value={qrSeleccionado.qrToken} size={220} />
            </View>
            <TouchableOpacity style={styles.boton} onPress={() => setQrSeleccionado(null)}>
              <Text style={styles.textoBoton}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  tituloEvento: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  subtituloEvento: { fontSize: fontSize.sm, color: colors.secondary, marginTop: 2 },
  filaContadores: { flexDirection: 'row', justifyContent: 'space-around' },
  contador: { alignItems: 'center' },
  contadorNumero: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.accent },
  contadorLabel: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  vacio: { fontSize: fontSize.sm, color: colors.muted, fontStyle: 'italic' },
  filaEntrada: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  folio: {
    fontFamily: 'monospace',
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.primary,
    width: 56,
  },
  datosEntrada: { flex: 1 },
  compradorNombre: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  estadoEntrada: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  botonQr: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
  },
  textoBotonQr: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  iconoPendiente: { fontSize: fontSize.md, width: 56 },
  textoPendiente: { fontSize: fontSize.sm, color: colors.muted, flex: 1 },
  errorTexto: {
    fontSize: fontSize.md,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: spacing.lg,
  },
  botonReintentar: {
    marginTop: spacing.md,
    alignSelf: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
  },
  textoBotonReintentar: { color: colors.white, fontWeight: 'bold' },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  qrCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  qrFolio: { fontFamily: 'monospace', fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  qrComprador: { fontSize: fontSize.md, color: colors.secondary, marginTop: 2, marginBottom: spacing.md },
  qrWrap: { padding: spacing.md, backgroundColor: colors.white, borderRadius: borderRadius.sm },
  boton: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
});
