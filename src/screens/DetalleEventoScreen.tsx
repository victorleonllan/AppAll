import { useState, useEffect, useRef } from 'react';
import { Platform, Share, Linking, Image } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, TextInput,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useEventoPermisos } from '../hooks/useEventoPermisos';
import { useEstadoEventoEnVivo } from '../hooks/useEstadoEventoEnVivo';
import { usePrecioVigente } from '../hooks/usePrecioVigente';
import AvisoCancelacion from '../components/AvisoCancelacion';
import PrecioEvento from '../components/PrecioEvento';
import { formatearMonto } from '../lib/precio';
import { URL_WEB, VERSION_PREVIEW_LINK } from '../constants/web';
import { supabase } from '../lib/supabase';
import { confirmar } from '../lib/confirm';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type DetalleRoute = RouteProp<CarteleraStackParamList, 'DetalleEvento'>;
type NavProp = NativeStackNavigationProp<CarteleraStackParamList, 'DetalleEvento'>;

export default function DetalleEventoScreen() {
  const route = useRoute<DetalleRoute>();
  const navigation = useNavigation<NavProp>();
  const { user, signInOtp } = useAuth();
  const { eventos, cancelEvento, deleteEvento } = useEventos();

  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'idle' | 'email' | 'enviado' | 'comprando'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState('');
  const [gestionando, setGestionando] = useState(false);

  // Candado de la auto-compra — ver comentario en el efecto de abajo
  const autoCompraIniciada = useRef(false);

  const evento = eventos.find((e) => e.id === route.params.eventoId);
  const permisos = useEventoPermisos(evento?.id);

  // Spec 120 — los hooks nuevos van antes del return temprano: un hook después
  // de un return cambia el número de hooks entre renders y React lo rompe.
  const enVivo = useEstadoEventoEnVivo(evento?.id ?? null, {
    cancelado: evento?.status === 'cancelled',
    motivo: evento?.cancelReason ?? null,
  });
  // Se consulta para todo evento no cancelado: además del precio, el RPC dice si
  // el país del evento vende hoy (`se_vende`, spec 100).
  const { vigente } = usePrecioVigente(evento && !enVivo.cancelado ? evento.id : null);

  if (!evento) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTexto}>Evento no encontrado</Text>
      </View>
    );
  }

  const cancelado = enVivo.cancelado;
  const monto = evento.monto ?? 0;
  // Si el RPC falló (`vigente === null`) no se bloquea: la base lo vuelve a
  // revisar al reservar, y un error de red no debe esconder la compra.
  const ventaCerrada = vigente?.seVende === false;

  // Spec 120 — link a la web (quien lo recibe puede no tener la app) con `?v=` y
  // ningún otro parámetro, igual que BotonCompartir.js. Solo `message`: en iOS
  // `url` aparte llega junto a WhatsApp y el link se ve repetido.
  const urlEvento = `${URL_WEB}/cartelera/${evento.id}?v=${VERSION_PREVIEW_LINK}`;
  const urlFlyer = `${URL_WEB}/cartelera/${evento.id}/flyer`;

  const handleCompartir = async () => {
    try {
      await Share.share({ message: `${evento.artista} — ${evento.venueName}\n${urlEvento}` });
    } catch {
      // react-native-web sin navigator.share lanza; cancelar la hoja nativa no.
      Alert.alert('Copia este link', urlEvento);
    }
  };

  // Spec 033 — cancelar (recuperable) vs. borrar (definitivo, y bloqueado
  // por el trigger events_block_delete_with_tickets si hay entradas vendidas
  // o en proceso). El mensaje de error del trigger llega tal cual al Alert.
  const handleCancelar = () => {
    confirmar(
      {
        title: 'Cancelar evento',
        message: 'El evento deja de venderse pero sigue visible como cancelado. No se puede deshacer desde acá.',
        confirmText: 'Cancelar evento',
        cancelText: 'Volver',
        destructive: true,
      },
      async () => {
        setGestionando(true);
        try {
          await cancelEvento(evento.id);
        } catch (err: any) {
          Alert.alert('No se pudo cancelar', err?.message ?? 'Error desconocido');
        } finally {
          setGestionando(false);
        }
      }
    );
  };

  const handleBorrar = () => {
    confirmar(
      {
        title: 'Borrar evento',
        message: 'Esta acción es definitiva. Si el evento tiene entradas vendidas o en proceso, la base lo va a rechazar — cancélalo en su lugar.',
        confirmText: 'Borrar',
        cancelText: 'Volver',
        destructive: true,
      },
      async () => {
        setGestionando(true);
        try {
          await deleteEvento(evento.id);
          navigation.goBack();
        } catch (err: any) {
          Alert.alert('No se pudo borrar', err?.message ?? 'Error desconocido');
        } finally {
          setGestionando(false);
        }
      }
    );
  };

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

  /**
   * Spec 118 — pide la preferencia a create-preference. Común a web y nativo; en
   * nativo manda `origen: 'app'` para que el pago vuelva a la app por la página
   * puente (spec 117) en vez de a sonopolis.org/mis-entradas.
   */
  const pedirPreferencia = async (desdeApp: boolean) => {
    // create-preference identifica al comprador con supabase.auth.getUser().
    // Con la anon key eso devuelve null y la function corta en 401: hay que
    // mandar el access_token de la sesión.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sesión no encontrada');

    const res = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-preference`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({
          evento_id: evento.id,
          user_id: user!.id,
          cantidad: 1,
          ...(desdeApp ? { origen: 'app' } : {}),
        }),
      }
    );

    if (!res.ok) {
      const detalle = await res.text();
      throw new Error(`create-preference ${res.status}: ${detalle}`);
    }

    return res.json() as Promise<{
      init_point?: string;
      sandbox_init_point?: string;
      ticket_id?: string;
      ticket_ref?: string;
    }>;
  };

  const handleComprarLogueado = async () => {
    if (monto <= 0) {
      Alert.alert('Sin precio', 'Este evento no tiene un precio definido');
      return;
    }

    setStep('comprando');
    setLoading(true);
    try {
      if (Platform.OS === 'web') {
        const data = await pedirPreferencia(false);

        // Con credenciales de prueba, init_point ya opera en modo test.
        // sandbox_init_point es el flujo viejo y no siempre resuelve.
        const checkoutUrl = data.init_point || data.sandbox_init_point;
        window.open(checkoutUrl, '_blank');

        navigation.replace('ConfirmacionCompra', {
          eventoId: evento.id,
          ticketId: data.ticket_id,
          status: 'pending',
        });
        return;
      }

      // Nativo: `window` no tiene `open`. openAuthSessionAsync espera a que el
      // navegador vuelva por appall://compra y lo cierra solo.
      const { init_point, sandbox_init_point, ticket_id, ticket_ref } = await pedirPreferencia(true);
      const resultado = await WebBrowser.openAuthSessionAsync(
        (init_point || sandbox_init_point)!,
        'appall://compra',
      );

      // Si cerró el navegador sin volver, el ticket existe y pudo haberse pagado:
      // se va igual a la confirmación como 'pending' y ella lo resuelve preguntando.
      let status: 'success' | 'failure' | 'pending' = 'pending';
      if (resultado.type === 'success' && resultado.url) {
        const s = new URL(resultado.url).searchParams.get('status');
        if (s === 'success' || s === 'failure' || s === 'pending') status = s;
      }

      // navigate y no replace: ConfirmacionCompra tiene getId por `ref` (spec 114),
      // así el retorno que además llega por el linking cae en la misma pantalla.
      navigation.navigate('ConfirmacionCompra', {
        eventoId: evento.id,
        ticketId: ticket_id,
        ref: ticket_ref,
        status,
      });
      setStep('idle');
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
    if (cancelado) return;
    if (user) {
      handleComprarLogueado();
    } else if (Platform.OS === 'web') {
      setStep('email');
    } else {
      // Spec 118 — en nativo el enlace mágico abre la sesión en la web, no en la
      // app: se manda a iniciar sesión en la pestaña de cuenta.
      Alert.alert('Inicia sesión para comprar', undefined, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Iniciar sesión', onPress: () => navigation.getParent()?.navigate('Sonópolis') },
      ]);
    }
  };

  // ────────────── RENDER ──────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {cancelado && (
        <AvisoCancelacion motivo={enVivo.motivo} onVerOtros={() => navigation.navigate('CarteleraList')} />
      )}

      <View style={styles.card}>
        <View style={styles.filaTitulo}>
          <Text style={[styles.artista, styles.artistaFlex]}>{evento.artista}</Text>
          {/* Visible también cancelado: quien lo recibe se entera de la cancelación. */}
          <TouchableOpacity style={styles.botonCompartir} onPress={handleCompartir}>
            <Text style={styles.textoBotonGestion}>Compartir</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.genero}>{evento.genero}</Text>

        <View style={styles.divisor} />

        {/* Spec 114 — el lugar lleva al detalle del local. */}
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => navigation.navigate('DetalleLocal', { venueId: evento.venueId })}
        >
          <Text style={styles.infoLabel}>Lugar</Text>
          <Text style={[styles.infoValor, styles.infoValorEnlace]}>{evento.venueName} ›</Text>
        </TouchableOpacity>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Fecha</Text>
          <Text style={styles.infoValor}>{evento.fecha}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Hora</Text>
          <Text style={styles.infoValor}>{evento.hora}</Text>
        </View>

        {evento.descripcion?.trim() ? (
          <>
            <View style={styles.divisor} />
            <Text style={styles.seccionTitulo}>Sobre el evento</Text>
            <Text style={styles.descripcion}>{evento.descripcion}</Text>
          </>
        ) : null}

        <View style={styles.divisor} />

        <Text style={styles.precioLabel}>Precio</Text>
        <PrecioEvento evento={evento} vigente={vigente} alinear="inicio" />

        {/* El monto del botón es solo lo que se muestra: lo que se cobra lo decide
            el servidor con la preventa vigente (create-preference). */}
        <TouchableOpacity
          style={[styles.botonComprar, (!monto || cancelado || ventaCerrada) && styles.botonDesactivado]}
          onPress={handleBotonComprar}
          disabled={!monto || cancelado || ventaCerrada || step === 'comprando'}
        >
          <Text style={styles.textoBotonComprar}>
            {cancelado
              ? 'Evento cancelado'
              : step === 'comprando'
                ? 'Procesando...'
                : ventaCerrada
                  ? 'Venta no habilitada todavía en este país'
                  : monto > 0
                    ? `Comprar entrada — ${formatearMonto(vigente?.monto ?? monto, evento.moneda)}`
                    : 'Evento gratuito'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Spec 120 — mismas condiciones que la web (W-244): sin imagen la ruta da
          404, y un evento cancelado no se difunde. */}
      {evento.imagen && !cancelado && (
        <View style={[styles.card, styles.cardSeparada]}>
          <Text style={styles.seccionTitulo}>Material de difusión</Text>
          <Image source={{ uri: urlFlyer }} style={styles.flyer} resizeMode="cover" />
          <TouchableOpacity style={styles.boton} onPress={() => Linking.openURL(urlFlyer)}>
            <Text style={styles.textoBoton}>Descargar flyer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Spec 033 — panel de gestión, visible solo para el equipo del evento */}
      {permisos.puedeEditar && (
        <View style={styles.card}>
          <Text style={styles.tituloGestion}>Gestión del evento</Text>
          <Text style={styles.rolActual}>Tu rol: {permisos.rol}</Text>
          <View style={styles.filaGestion}>
            {/* Spec 034 — cualquier rol del equipo edita, igual que puedeEditar ya
                gatilla toda esta card; no hace falta otro chequeo de permiso acá. */}
            <TouchableOpacity
              style={styles.botonGestion}
              onPress={() => (navigation as any).navigate('EditarEvento', { eventoId: evento.id })}
            >
              <Text style={styles.textoBotonGestion}>✏️ Editar</Text>
            </TouchableOpacity>
            {/* Spec 039 — mismo criterio: cualquier rol del equipo ve las entradas. */}
            <TouchableOpacity
              style={styles.botonGestion}
              onPress={() => (navigation as any).navigate('EntradasEvento', { eventoId: evento.id })}
            >
              <Text style={styles.textoBotonGestion}>🎟️ Entradas</Text>
            </TouchableOpacity>
            {permisos.puedeInvitar && (
              <TouchableOpacity
                style={styles.botonGestion}
                onPress={() => (navigation as any).navigate('EquipoEvento', { eventoId: evento.id })}
              >
                <Text style={styles.textoBotonGestion}>👥 Equipo</Text>
              </TouchableOpacity>
            )}
            {/* Spec 114 — que el show ya haya terminado lo exige la pantalla
                CobrarEvento (spec 140), no el botón. */}
            {permisos.rol === 'owner' && !cancelado && (
              <TouchableOpacity
                style={styles.botonGestion}
                onPress={() => (navigation as any).navigate('CobrarEvento', { eventoId: evento.id })}
              >
                <Text style={styles.textoBotonGestion}>💰 Cobrar</Text>
              </TouchableOpacity>
            )}
            {permisos.puedeBorrar && !cancelado && (
              <TouchableOpacity
                style={styles.botonGestion}
                onPress={handleCancelar}
                disabled={gestionando}
              >
                <Text style={styles.textoBotonGestion}>🚫 Cancelar</Text>
              </TouchableOpacity>
            )}
            {/* Spec 059/060 — borrar es solo del owner: events_delete ya no acepta
                can_delete de un colaborador, RLS lo rechazaría igual. */}
            {permisos.rol === 'owner' && (
              <TouchableOpacity
                style={[styles.botonGestion, styles.botonPeligro]}
                onPress={handleBorrar}
                disabled={gestionando}
              >
                <Text style={[styles.textoBotonGestion, styles.textoBotonPeligro]}>🗑️ Borrar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

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
  infoValorEnlace: { color: colors.accent },
  precioLabel: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginBottom: spacing.xs,
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
  filaTitulo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  artistaFlex: { flex: 1 },
  botonCompartir: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    marginTop: 4,
  },
  seccionTitulo: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginBottom: spacing.xs,
  },
  descripcion: {
    fontSize: fontSize.md,
    color: colors.secondary,
    lineHeight: 22,
  },
  cardSeparada: { marginTop: spacing.md },
  // La ruta /flyer genera 1080×1350 (4:5).
  flyer: {
    width: 240,
    aspectRatio: 4 / 5,
    borderRadius: borderRadius.sm,
    alignSelf: 'center',
    backgroundColor: colors.accentLight,
  },
  tituloGestion: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 2,
  },
  rolActual: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginBottom: spacing.sm,
    textTransform: 'capitalize',
  },
  filaGestion: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  botonGestion: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
  },
  textoBotonGestion: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm },
  botonPeligro: { backgroundColor: '#FDECEA' },
  textoBotonPeligro: { color: '#B71C1C' },
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