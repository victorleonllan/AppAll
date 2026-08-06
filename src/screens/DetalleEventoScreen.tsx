import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, TextInput,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { supabase } from '../lib/supabase';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type DetalleRoute = RouteProp<CarteleraStackParamList, 'DetalleEvento'>;
type NavProp = NativeStackNavigationProp<CarteleraStackParamList, 'DetalleEvento'>;

export default function DetalleEventoScreen() {
  const route = useRoute<DetalleRoute>();
  const navigation = useNavigation<NavProp>();
  const { user, signInOtp } = useAuth();
  const { eventos } = useEventos();

  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'idle' | 'email' | 'enviado' | 'comprando'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState('');

  // Candado de la auto-compra — ver comentario en el efecto de abajo
  const autoCompraIniciada = useRef(false);

  const evento = eventos.find((e) => e.id === route.params.eventoId);

  if (!evento) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTexto}>Evento no encontrado</Text>
      </View>
    );
  }

  const monto = evento.monto ?? 0;

  // Auto-compra: si volvemos del magic link con una compra pendiente
  useEffect(() => {
    const checkPending = async () => {
      try {
        let pendingId: string | null = null;
        if (Platform.OS === 'web') {
          pendingId = localStorage.getItem('pending_ticket');
        } else {
          pendingId = await AsyncStorage.getItem('pending_ticket');
        }
        // En nativo el await de arriba abre un hueco donde dos ejecuciones del
        // efecto pueden solaparse y comprar dos veces. El chequeo del candado y
        // su marcado van juntos, sin await en medio, para cerrarlo.
        if (pendingId !== evento.id || !user || autoCompraIniciada.current) return;
        autoCompraIniciada.current = true;

        if (Platform.OS === 'web') {
          localStorage.removeItem('pending_ticket');
        } else {
          await AsyncStorage.removeItem('pending_ticket');
        }
        handleComprarLogueado();
      } catch (e) {
        console.error('[DetalleEvento] auto-compra: no se pudo leer pending_ticket:', e);
      }
    };
    checkPending();
  }, [user, evento.id]);

  // ────────────── FLUJO: email → magic link ──────────────

  const handleEnviarLink = async () => {
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Ingresa un email válido');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    const err = await signInOtp(email.trim());
    setLoading(false);
    if (err) {
      setErrorMsg(err);
    } else {
      // Guardar para auto-compra al volver del magic link
      if (Platform.OS === 'web') {
        localStorage.setItem('pending_ticket', evento.id);
      } else {
        await AsyncStorage.setItem('pending_ticket', evento.id);
      }
      setEmailEnviado(email.trim());
      setStep('enviado');
    }
  };

  // ────────────── FLUJO: usuario logueado ──────────────

  const handleComprarLogueado = async () => {
    if (monto <= 0) {
      Alert.alert('Sin precio', 'Este evento no tiene un precio definido');
      return;
    }

    setStep('comprando');
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-preference`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            evento_id: evento.id,
            user_id: user!.id,
            cantidad: 1,
          }),
        }
      );

      if (!res.ok) throw new Error('Error al crear preferencia');

      const data = await res.json();

      const checkoutUrl = data.sandbox_init_point || data.init_point;
      if (typeof window !== 'undefined') {
        window.open(checkoutUrl, '_blank');
      }

      navigation.replace('ConfirmacionCompra', {
        eventoId: evento.id,
        ticketId: data.ticket_id,
        status: 'pending',
      });
    } catch (err) {
      console.error('Error al comprar:', err);
      Alert.alert('Error', 'No se pudo procesar la compra');
      setStep('idle');
    } finally {
      setLoading(false);
    }
  };

  // ────────────── FORMULARIO EMAIL ──────────────

  const renderFormularioEmail = () => (
    <View style={styles.overlay}>
      <View style={styles.card}>
        {step === 'email' && (
          <>
            <Text style={styles.modalTitulo}>Para comprar tu entrada</Text>
            <Text style={styles.modalSubtitulo}>
              Ingresa tu correo electrónico. Te enviaremos un enlace mágico para continuar.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="tu@email.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(t) => { setEmail(t); setErrorMsg(''); }}
            />
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            <TouchableOpacity
              style={[styles.boton, loading && styles.botonDesactivado]}
              onPress={handleEnviarLink}
              disabled={loading}
            >
              <Text style={styles.textoBoton}>
                {loading ? 'Enviando...' : 'Enviar enlace'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'enviado' && (
          <>
            <Text style={styles.modalTitulo}>Enlace enviado ✅</Text>
            <Text style={styles.modalSubtitulo}>
              Revisa <Text style={styles.emailResaltado}>{emailEnviado}</Text>. Te llegó un enlace mágico para iniciar sesión.
            </Text>
            <View style={styles.instruccionesBox}>
              <Text style={styles.instruccionesTitulo}>Pasos:</Text>
              <Text style={styles.instruccionesTexto}>
                1. Abre tu correo{'\n'}
                2. Haz click en el enlace mágico{'\n'}
                3. Vuelve a esta pantalla{'\n'}
                4. Presiona "Comprar entrada" de nuevo
              </Text>
            </View>
            <TouchableOpacity
              style={styles.boton}
              onPress={() => setStep('idle')}
            >
              <Text style={styles.textoBoton}>Cerrar</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'comprando' && (
          <Text style={styles.modalSubtitulo}>Procesando compra...</Text>
        )}
      </View>
    </View>
  );

  // ────────────── BOTON PRINCIPAL ──────────────

  const handleBotonComprar = () => {
    if (user) {
      handleComprarLogueado();
    } else {
      setStep('email');
    }
  };

  // ────────────── RENDER ──────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.artista}>{evento.artista}</Text>
        <Text style={styles.genero}>{evento.genero}</Text>

        <View style={styles.divisor} />

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Lugar</Text>
          <Text style={styles.infoValor}>{evento.venueName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Fecha</Text>
          <Text style={styles.infoValor}>{evento.fecha}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Hora</Text>
          <Text style={styles.infoValor}>{evento.hora}</Text>
        </View>

        <View style={styles.divisor} />

        <Text style={styles.precioLabel}>Precio</Text>
        <Text style={styles.precioValor}>{evento.precio}</Text>

        <TouchableOpacity
          style={[styles.botonComprar, (!monto) && styles.botonDesactivado]}
          onPress={handleBotonComprar}
          disabled={!monto || step === 'comprando'}
        >
          <Text style={styles.textoBotonComprar}>
            {step === 'comprando'
              ? 'Procesando...'
              : monto > 0
                ? `Comprar entrada — ${evento.precio}`
                : 'Evento gratuito'}
          </Text>
        </TouchableOpacity>
      </View>

      {(step === 'email' || step === 'enviado' || step === 'comprando') && renderFormularioEmail()}
    </ScrollView>
  );
}

// ────────────── ESTILOS ──────────────

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
  // Modal
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalTitulo: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  modalSubtitulo: {
    fontSize: fontSize.md,
    color: colors.secondary,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  emailResaltado: {
    fontWeight: 'bold',
    color: colors.accent,
  },
  input: {
    backgroundColor: colors.accentLight,
    borderRadius: borderRadius.sm,
    padding: 14,
    fontSize: fontSize.md,
    color: colors.primary,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: {
    color: '#B71C1C',
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  boton: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  textoBoton: {
    color: colors.white,
    fontWeight: 'bold',
    fontSize: fontSize.md,
  },
  instruccionesBox: {
    backgroundColor: colors.accentLight,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  instruccionesTitulo: {
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  instruccionesTexto: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    lineHeight: 22,
  },
});