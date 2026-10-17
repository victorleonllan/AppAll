import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useEventos } from '../context/EventosContext';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { TicketStatus } from '../types';
import { supabase } from '../lib/supabase';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type ConfirmacionRoute = RouteProp<CarteleraStackParamList, 'ConfirmacionCompra'>;
type NavProp = NativeStackNavigationProp<CarteleraStackParamList, 'ConfirmacionCompra'>;

/** Vocabulario de esta pantalla. NO es el de `tickets.status`. */
type VistaStatus = 'success' | 'failure' | 'pending' | 'timeout';

/**
 * Traducción explícita entre los dos vocabularios. Antes se casteaba el estado del
 * ticket a este tipo: `config['completed']` daba undefined y una compra exitosa se
 * mostraba como "Compra no completada".
 */
const TICKET_A_VISTA: Record<TicketStatus, VistaStatus> = {
  completed: 'success',
  cancelled: 'failure',
  refunded: 'failure',
  pending: 'pending',
};

/**
 * El webhook no confirma contra tráfico real de MP (firma x-signature), así que cada
 * consulta le pide primero la confirmación a `confirm-payment`, como la web.
 */
const VENTANA_POLLING_MS = 3 * 60 * 1000;
const INTERVALO_POLLING_MS = 3000;

/** Spec 118 — mismos headers que `pedirConfirmacion` de sonopolisWeb/libs/data/tickets.js. */
async function pedirConfirmacion(cuerpo: { ticket_id?: string; ticket_ref?: string }) {
  try {
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/confirm-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify(cuerpo),
    });
    if (!res.ok) return null;
    return (await res.json()) as { status?: TicketStatus };
  } catch {
    // Deliberado: un tick fallido no es un error para el usuario mientras quede
    // ventana; el próximo reintenta. El error visible es el `timeout` del final.
    return null;
  }
}

const config: Record<VistaStatus, { icon: keyof typeof Ionicons.glyphMap; color: string; titulo: string; mensaje: string }> = {
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
  timeout: {
    icon: 'help-circle',
    color: '#F57F17',
    titulo: 'Sin confirmacion todavia',
    mensaje: 'Mercado Pago aun no confirma el pago. Si ya pagaste, tu entrada se registrara igual: puedes revisarla mas tarde en tus entradas.',
  },
};

export default function ConfirmacionCompraScreen() {
  const route = useRoute<ConfirmacionRoute>();
  const navigation = useNavigation<NavProp>();
  const { eventos } = useEventos();

  const { eventoId, ticketId, ref, status = 'pending' } = route.params ?? {};
  const [actualStatus, setActualStatus] = useState<VistaStatus>(status);
  const [consultando, setConsultando] = useState(false);
  // Si llega solo `ref` (la abrió el deep link con la app cerrada), el ticket y su
  // evento se resuelven por preference_id al montar.
  const [ticketResuelto, setTicketResuelto] = useState<{ id: string; eventoId: string } | null>(null);
  const [resolviendo, setResolviendo] = useState(!ticketId && !!ref);
  const idTicket = ticketId ?? ticketResuelto?.id;
  const evento = eventos.find((e) => e.id === (eventoId ?? ticketResuelto?.eventoId));
  const cfg = config[actualStatus] ?? config.failure;

  // El intervalo vive en un ref para poder cortarlo tanto desde el timeout como
  // desde la consulta manual sin recrear el efecto.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ticketId || !ref) return;
    let activo = true;
    supabase
      .from('tickets')
      .select('id, evento_id')
      .eq('preference_id', ref)
      .maybeSingle()
      .then(({ data }) => {
        // Sin fila (otra cuenta o sin sesión) se sigue con `ref` sola:
        // confirm-payment la acepta; solo falta la info del evento.
        if (activo && data) setTicketResuelto({ id: data.id, eventoId: data.evento_id });
        if (activo) setResolviendo(false);
      });
    return () => { activo = false; };
  }, [ticketId, ref]);

  /** Devuelve true si el ticket ya salio de 'pending'. */
  const consultarTicket = useCallback(async (): Promise<boolean> => {
    if (!idTicket && !ref) return false;

    const confirmacion = await pedirConfirmacion(idTicket ? { ticket_id: idTicket } : { ticket_ref: ref });

    let estado: TicketStatus | undefined;
    if (idTicket) {
      const { data } = await supabase
        .from('tickets')
        .select('status')
        .eq('id', idTicket)
        .single();
      estado = data?.status as TicketStatus | undefined;
    } else {
      estado = confirmacion?.status;
    }

    if (estado && estado !== 'pending') {
      setActualStatus(TICKET_A_VISTA[estado] ?? 'failure');
      return true;
    }
    return false;
  }, [idTicket, ref]);

  // Una consulta inmediata y después polling. `success` también consulta: la
  // back_url dice que MP aprobó, pero el ticket lo emite confirm-payment.
  useEffect(() => {
    if (status === 'failure' || resolviendo || (!idTicket && !ref)) return;

    let activo = true;
    const detener = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };

    consultarTicket().then((resuelto) => {
      if (resuelto || !activo) return;
      intervalRef.current = setInterval(async () => {
        if (await consultarTicket()) detener();
      }, INTERVALO_POLLING_MS);
    });

    // Al vencer la ventana el estado se hace visible, en vez de dejar
    // "Verificando pago..." congelado para siempre.
    const timeout = setTimeout(() => {
      detener();
      setActualStatus((previo) => (previo === 'pending' ? 'timeout' : previo));
    }, VENTANA_POLLING_MS);

    return () => {
      activo = false;
      detener();
      clearTimeout(timeout);
    };
  }, [status, idTicket, ref, resolviendo, consultarTicket]);

  const reintentarConsulta = async () => {
    setConsultando(true);
    const resuelto = await consultarTicket();
    setConsultando(false);
    if (!resuelto) setActualStatus('timeout');
  };

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

      {actualStatus === 'timeout' && (
        <TouchableOpacity
          style={[styles.boton, styles.botonSecundario]}
          onPress={reintentarConsulta}
          disabled={consultando}
        >
          <Text style={styles.textoBotonSecundario}>
            {consultando ? 'Consultando...' : 'Volver a consultar'}
          </Text>
        </TouchableOpacity>
      )}

      {actualStatus === 'success' ? (
        <>
          <TouchableOpacity style={styles.boton} onPress={() => navigation.navigate('MisEntradas')}>
            <Text style={styles.textoBoton}>🎟️ Ver mis entradas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.boton, styles.botonSecundario]} onPress={irACartelera}>
            <Text style={styles.textoBotonSecundario}>Volver a cartelera</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.boton} onPress={irACartelera}>
          <Text style={styles.textoBoton}>Volver a cartelera</Text>
        </TouchableOpacity>
      )}
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
  botonSecundario: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.accent,
    marginTop: spacing.lg,
  },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  textoBotonSecundario: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.md },
});