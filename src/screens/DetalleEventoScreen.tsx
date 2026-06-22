import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, TextInput, Platform,
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
  const { user, signInOtp, verifyOtp } = useAuth();
  const { eventos } = useEventos();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'idle' | 'email' | 'otp' | 'comprando'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const evento = eventos.find((e) => e.id === route.params.eventoId);

  if (!evento) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTexto}>Evento no encontrado</Text>
      </View>
    );
  }

  const monto = evento.monto ?? 0;

  // ──────────────────── FLUJO: email + OTP + compra ────────────────────

  const handleEnviarOtp = async () => {
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
      setStep('otp');
    }
  };

  const handleVerificarOtp = async () => {
    if (!otp.trim()) {
      setErrorMsg('Ingresa el código de 6 dígitos');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    const err = await verifyOtp(email.trim(), otp.trim());
    setLoading(false);
    if (err) {
      setErrorMsg(err);
    } else {
      // Usuario autenticado → proceder a comprar
      setStep('comprando');
      await procesarCompra();
    }
  };

  const procesarCompra = async () => {
    // Obtener sesión actualizada después de autenticación OTP
    const { data: { session } } = await supabase.auth.getSession();
    const currentUser = session?.user;
    if (!currentUser) {
      Alert.alert('Error', 'No se pudo autenticar. Intenta de nuevo.');
      setStep('idle');
      return;
    }

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
            user_id: currentUser.id,
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

  // ──────────────────── FLUJO: usuario ya logueado ────────────────────

  const handleComprarLogueado = async () => {
    if (monto <= 0) {
      Alert.alert('Sin precio', 'Este evento no tiene un precio definido');
      return;
    }

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
    } finally {
      setLoading(false);
    }
  };

  // ──────────────────── FORMULARIO OTP ────────────────────

  const renderFormularioOtp = () => (
    <View style={styles.overlay}>
      <View style={styles.card}>
        {step === 'email' && (
          <>
            <Text style={styles.modalTitulo}>Para comprar tu entrada</Text>
            <Text style={styles.modalSubtitulo}>
              Ingresa tu email para recibir un código de verificación
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
              onPress={handleEnviarOtp}
              disabled={loading}
            >
              <Text style={styles.textoBoton}>
                {loading ? 'Enviando...' : 'Enviar código'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'otp' && (
          <>
            <Text style={styles.modalTitulo}>Código de verificación</Text>
            <Text style={styles.modalSubtitulo}>
              Revisa tu bandeja de entrada en <Text style={styles.emailResaltado}>{email}</Text> y escribe el código de 6 dígitos
            </Text>
            <TextInput
              style={styles.input}
              placeholder="123456"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={(t) => { setOtp(t); setErrorMsg(''); }}
            />
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            <TouchableOpacity
              style={[styles.boton, loading && styles.botonDesactivado]}
              onPress={handleVerificarOtp}
              disabled={loading}
            >
              <Text style={styles.textoBoton}>
                {loading ? 'Verificando...' : 'Verificar y comprar'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('email')}>
              <Text style={styles.linkText}>Cambiar email</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'comprando' && (
          <Text style={styles.modalSubtitulo}>Procesando compra...</Text>
        )}
      </View>
    </View>
  );

  // ──────────────────── RENDER PRINCIPAL ────────────────────

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
          onPress={() => {
            if (user) {
              handleComprarLogueado();
            } else {
              setStep('email');
            }
          }}
          disabled={!monto || loading}
        >
          <Text style={styles.textoBotonComprar}>
            {loading
              ? 'Procesando...'
              : monto > 0
                ? `Comprar entrada — ${evento.precio}`
                : 'Evento gratuito'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modal OTP superpuesto */}
      {(step === 'email' || step === 'otp' || step === 'comprando') && renderFormularioOtp()}
    </ScrollView>
  );
}

// ──────────────────── ESTILOS ────────────────────

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
  // los estilos del modal reusan .card
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
  linkText: {
    color: colors.accent,
    textAlign: 'center',
    marginTop: spacing.md,
    fontSize: fontSize.sm,
  },
});