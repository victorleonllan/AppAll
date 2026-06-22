import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useEventos } from '../context/EventosContext';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { supabase } from '../lib/supabase';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type ConfirmacionRoute = RouteProp<CarteleraStackParamList, 'ConfirmacionCompra'>;
type NavProp = NativeStackNavigationProp<CarteleraStackParamList, 'ConfirmacionCompra'>;

const config: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; titulo: string; mensaje: string }> = {
  success: {
    icon: 'checkmark-circle',
    color: colors.success,
    titulo: 'Compra exitosa!',
    mensaje: 'Tu entrada ha sido confirmada. Te esperamos en el evento.',
  },
  failure: {
    icon: 'close-circle',
    color: '#B71C1C',
    titulo: 'Compra no completada',
    mensaje: 'El pago no pudo procesarse. Intenta nuevamente.',
  },
  pending: {
    icon: 'time',
    color: '#F57F17',
    titulo: 'Pago pendiente',
    mensaje: 'El pago esta siendo procesado. La pantalla se actualizara automaticamente cuando se confirme.',
  },
};

export default function ConfirmacionCompraScreen() {
  const route = useRoute<ConfirmacionRoute>();
  const navigation = useNavigation<NavProp>();
  const { eventos } = useEventos();

  const { eventoId, ticketId, status } = route.params;
  const [actualStatus, setActualStatus] = useState(status);
  const evento = eventos.find((e) => e.id === eventoId);
  const cfg = config[actualStatus] ?? config.failure;

  // Polling: verificar cada 3s si el ticket cambio de pending a completed/refunded
  useEffect(() => {
    if (status !== 'pending' || !ticketId) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('tickets')
        .select('status')
        .eq('id', ticketId)
        .single();

      if (data && data.status !== 'pending') {
        setActualStatus(data.status as 'success' | 'failure' | 'pending');
        clearInterval(interval);
      }
    }, 3000);

    // Parar polling despues de 30s
    const timeout = setTimeout(() => clearInterval(interval), 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [status, ticketId]);

  // Auto-redireccion despues de exito
  useEffect(() => {
    if (actualStatus === 'success') {
      const timer = setTimeout(() => {
        navigation.getParent()?.goBack();
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [actualStatus, navigation]);

  const irACartelera = () => {
    navigation.navigate('CarteleraList');
  };

  return (
    <View style={styles.container}>
      <Ionicons name={cfg.icon} size={72} color={cfg.color} />
      <Text style={[styles.titulo, { color: cfg.color }]}>{cfg.titulo}</Text>
      <Text style={styles.mensaje}>{cfg.mensaje}</Text>

      {evento && (
        <View style={styles.eventoInfo}>
          <Text style={styles.eventoNombre}>{evento.artista}</Text>
          <Text style={styles.eventoDetalle}>
            {evento.venueName} · {evento.fecha} · {evento.hora}
          </Text>
        </View>
      )}

      {actualStatus === 'pending' && (
        <View style={styles.pollingIndicator}>
          <Text style={styles.pollingText}>Verificando pago...</Text>
        </View>
      )}

      <TouchableOpacity style={styles.boton} onPress={irACartelera}>
        <Text style={styles.textoBoton}>Volver a cartelera</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  titulo: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  mensaje: {
    fontSize: fontSize.md,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  eventoInfo: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    width: '100%',
    alignItems: 'center',
  },
  eventoNombre: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.primary,
  },
  eventoDetalle: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  pollingIndicator: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#FFF3E0',
    borderRadius: borderRadius.sm,
  },
  pollingText: {
    fontSize: fontSize.sm,
    color: '#F57F17',
    fontWeight: '500',
  },
  boton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xl,
  },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
});