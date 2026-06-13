import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useEventos } from '../context/EventosContext';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type ConfirmacionRoute = RouteProp<CarteleraStackParamList, 'ConfirmacionCompra'>;
type NavProp = NativeStackNavigationProp<CarteleraStackParamList, 'ConfirmacionCompra'>;

const config: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; titulo: string; mensaje: string }> = {
  success: {
    icon: 'checkmark-circle',
    color: colors.success,
    titulo: '¡Compra exitosa!',
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
    mensaje: 'El pago está siendo procesado. Te notificaremos cuando se confirme.',
  },
};

export default function ConfirmacionCompraScreen() {
  const route = useRoute<ConfirmacionRoute>();
  const navigation = useNavigation<NavProp>();
  const { eventos, tickets } = useEventos();

  const { eventoId, status } = route.params;
  const evento = eventos.find((e) => e.id === eventoId);
  const cfg = config[status] ?? config.failure;

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.getParent()?.goBack();
    }, 8000);
    return () => clearTimeout(timer);
  }, [navigation]);

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
  boton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xl,
  },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
});
