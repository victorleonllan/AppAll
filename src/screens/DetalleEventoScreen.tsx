import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type DetalleRoute = RouteProp<CarteleraStackParamList, 'DetalleEvento'>;
type NavProp = NativeStackNavigationProp<CarteleraStackParamList, 'DetalleEvento'>;

export default function DetalleEventoScreen() {
  const route = useRoute<DetalleRoute>();
  const navigation = useNavigation<NavProp>();
  const { user } = useAuth();
  const { eventos, createTicket, updateTicketStatus } = useEventos();

  const evento = eventos.find((e) => e.id === route.params.eventoId);

  if (!evento) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTexto}>Evento no encontrado</Text>
      </View>
    );
  }

  const monto = evento.monto ?? 0;

  const handleComprar = async () => {
    if (!user) {
      Alert.alert('Inicia sesión', 'Debes iniciar sesión para comprar entradas');
      return;
    }
    if (monto <= 0) {
      Alert.alert('Sin precio', 'Este evento no tiene un precio definido');
      return;
    }

    try {
      const ticket = await createTicket(evento.id, user.id, monto);

      // Mock flow: simulate success after a short delay
      // En producción: abrir expo-web-browser con init_point de Mercado Pago
      Alert.alert(
        'Compra iniciada',
        `Entrada para ${evento.artista} — $${monto.toLocaleString('es-CL')}\n\nRedirigiendo a Mercado Pago...`,
        [
          {
            text: 'Simular pago exitoso',
            onPress: async () => {
              await updateTicketStatus(ticket.id, 'completed');
              navigation.replace('ConfirmacionCompra', {
                eventoId: evento.id,
                ticketId: ticket.id,
                status: 'success',
              });
            },
          },
          {
            text: 'Cancelar',
            style: 'cancel',
            onPress: async () => {
              await updateTicketStatus(ticket.id, 'refunded');
            },
          },
        ]
      );
    } catch {
      Alert.alert('Error', 'No se pudo procesar la compra');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.artista}>{evento.artista}</Text>
        <Text style={styles.genero}>{evento.genero}</Text>

        <View style={styles.divisor} />

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>📍 Lugar</Text>
          <Text style={styles.infoValor}>{evento.venueName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>📅 Fecha</Text>
          <Text style={styles.infoValor}>{evento.fecha}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>🕐 Hora</Text>
          <Text style={styles.infoValor}>{evento.hora}</Text>
        </View>

        <View style={styles.divisor} />

        <Text style={styles.precioLabel}>Precio</Text>
        <Text style={styles.precioValor}>{evento.precio}</Text>

        <TouchableOpacity
          style={[styles.botonComprar, (!monto) && styles.botonDesactivado]}
          onPress={handleComprar}
          disabled={!monto}
        >
          <Text style={styles.textoBotonComprar}>
            {monto > 0 ? `🎫 Comprar entrada — ${evento.precio}` : 'Evento gratuito'}
          </Text>
        </TouchableOpacity>
      </View>
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
  },
  artista: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.primary,
  },
  genero: {
    fontSize: fontSize.md,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  divisor: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  infoLabel: {
    fontSize: fontSize.md,
    color: colors.muted,
  },
  infoValor: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '500',
  },
  precioLabel: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginBottom: spacing.xs,
  },
  precioValor: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.success,
  },
  botonComprar: {
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  botonDesactivado: {
    backgroundColor: colors.muted,
  },
  textoBotonComprar: {
    color: colors.white,
    fontWeight: 'bold',
    fontSize: fontSize.md,
  },
  errorTexto: {
    fontSize: fontSize.md,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
  },
});
