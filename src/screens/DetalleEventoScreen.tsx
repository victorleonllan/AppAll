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
import OptInWhatsApp from '../components/OptInWhatsApp';
import AvisarWhatsApp from '../components/AvisarWhatsApp';
import { useTenantDelEvento } from '../hooks/useTenantCrm';
import { useTenantRedes } from '../hooks/useTenantRedes';
import { useConexionesRedes } from '../hooks/useConexionesRedes';
import { useTelefonoPropio, dispararOptInDeCompra } from '../hooks/useOptInWhatsApp';
import { formatearMonto } from '../lib/precio';
import { URL_WEB, VERSION_PREVIEW_LINK } from '../constants/web';
import { Pasarela, getPasarelas, NOMBRE_PASARELA } from '../lib/pasarelas';
import { crearPagoCompra, ErrorPago, mensajeErrorPago } from '../lib/pagoCompra';
import { confirmar } from '../lib/confirm';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type DetalleRoute = RouteProp<CarteleraStackParamList, 'DetalleEvento'>;
type NavProp = NativeStackNavigationProp<CarteleraStackParamList, 'DetalleEvento'>;

export default function DetalleEventoScreen() {
  const route = useRoute<DetalleRoute>();
  const navigation = useNavigation<NavProp>();
  const { user, signInOtp } = useAuth();
  const { eventos, deleteEvento } = useEventos();

  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'idle' | 'email' | 'enviado' | 'comprando'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState('');
  const [gestionando, setGestionando] = useState(false);
  const [errorGestion, setErrorGestion] = useState<string | null>(null);

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

  // Spec 160 — pasarelas activas del país del evento, como la web (W-190).
  const [pasarelas, setPasarelas] = useState<Pasarela[] | null>(null); // null = cargando
  const [recargaPasarelas, setRecargaPasarelas] = useState(0);
  const [pasarelaEnCurso, setPasarelaEnCurso] = useState<Pasarela | null>(null);
  const [errorCompra, setErrorCompra] = useState<string | null>(null);

  useEffect(() => {
    if (!evento?.pais || enVivo.cancelado) return;
    let activo = true;
    getPasarelas(evento.pais)
      .then((p) => { if (activo) setPasarelas(p); })
      .catch((err) => {
        // Mercado Pago y no `[]` como la web: es lo que la app hacía antes, y un error de
        // red no debe esconder la compra. La base vuelve a validar la pasarela al reservar.
        console.error('[DetalleEvento] getPasarelas falló:', err);
        if (activo) setPasarelas(['mercadopago']);
      });
    return () => { activo = false; };
  }, [evento?.pais, enVivo.cancelado, recargaPasarelas]);

  // Spec 156 — el tenant solo se resuelve si alguien lo necesita (owner o compra
  // posible), como la web (`page.js:172-179`): un fan sin sesión no paga tres consultas.
  const hayCompra = !!user && (evento?.monto ?? 0) > 0 && !enVivo.cancelado;
  const { tenant: tenantEvento } = useTenantDelEvento(
    evento && (permisos.rol === 'owner' || hayCompra) ? evento : null
  );
  const telefonoPropio = useTelefonoPropio();

  // Spec 157 — el tenant es el de quien publica, no el del evento: un local puede anunciar
  // el show de una banda en su sala. La API vuelve a revisar el rol (`event_role_of`).
  const tenantRedes = useTenantRedes();
  const redesHabilitado =
    tenantRedes.estado === 'listo' && tenantRedes.esPro && !!permisos.rol && evento?.status !== 'cancelled';
  const { disponibles: redesDisponibles } = useConexionesRedes(tenantRedes.tenantType, redesHabilitado);
  const [optIn, setOptIn] = useState({ acepta: false, telefono: '' });
  useEffect(() => {
    if (telefonoPropio) setOptIn((v) => (v.telefono ? v : { ...v, telefono: telefonoPropio }));
  }, [telefonoPropio]);

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
  // Spec 160 — sin pasarelas activas tampoco se vende, como la web (W-190).
  const ventaCerrada = vigente?.seVende === false || pasarelas?.length === 0;
  // Mientras carga se dibuja el botón de siempre: con una sola pasarela no hay parpadeo.
  const opciones: Pasarela[] = pasarelas ?? ['mercadopago'];

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

  // Spec 143 — cancelar con motivo vive en Editar evento (spec 137, AccionesEvento).
  // Aquí solo queda borrar un evento ya cancelado, igual que la ficha web (W-047).
  // El trigger events_block_delete_with_tickets rechaza el borrado si hay entradas
  // vendidas o en proceso; su mensaje va a un Text porque Alert.alert no hace nada en web.
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
        setErrorGestion(null);
        try {
          await deleteEvento(evento.id);
          navigation.goBack();
        } catch (err: any) {
          setErrorGestion(`No se pudo borrar: ${err?.message ?? 'Error desconocido'}`);
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
        // Spec 160 — espera a las pasarelas: sin saber cuántas hay no se sabe si comprar.
        if (pendingId !== evento.id || !user || pasarelas === null || autoCompraIniciada.current) return;
        autoCompraIniciada.current = true;

        if (Platform.OS === 'web') {
          localStorage.removeItem('pending_ticket');
        } else {
          await AsyncStorage.removeItem('pending_ticket');
        }
        // Con varias no compra sola (W-190): elegir una por defecto mandaría a Mercado
        // Pago a quien quería Flow. Sin pasarelas no hay nada que comprar.
        if (pasarelas.length === 1) handleComprarLogueado(pasarelas[0]);
      } catch (e) {
        console.error('[DetalleEvento] auto-compra: no se pudo leer pending_ticket:', e);
      }
    };
    checkPending();
  }, [user, evento.id, pasarelas]);

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

  // Spec 160 — `crearPagoCompra` (spec 151) cobra con la pasarela elegida y decide el
  // `origen` por plataforma: en nativo la vuelta reabre la app (specs 117 y 147).
  const handleComprarLogueado = async (pasarela: Pasarela) => {
    if (monto <= 0) {
      Alert.alert('Sin precio', 'Este evento no tiene un precio definido');
      return;
    }

    // Spec 156 — sin await, como la web: un número mal escrito o una RPC caída no
    // pueden frenar una venta. La auto-compra llega con `optIn.acepta` en false.
    if (hayCompra && tenantEvento && optIn.acepta) {
      dispararOptInDeCompra({
        tenantTipo: tenantEvento.tipo, tenantId: tenantEvento.id, telefono: optIn.telefono,
        userId: user?.id, email: user?.email ?? undefined,
      });
    }

    setErrorCompra(null);
    setPasarelaEnCurso(pasarela);
    setStep('comprando');
    setLoading(true);
    try {
      const pago = await crearPagoCompra({ eventoId: evento.id, userId: user!.id, pasarela });

      if (Platform.OS === 'web') {
        window.open(pago.checkoutUrl, '_blank');

        navigation.replace('ConfirmacionCompra', {
          eventoId: evento.id,
          ticketId: pago.ticketId ?? undefined,
          status: 'pending',
        });
        return;
      }

      // Nativo: `window` no tiene `open`. openAuthSessionAsync espera a que el
      // navegador vuelva por appall://compra y lo cierra solo.
      const resultado = await WebBrowser.openAuthSessionAsync(pago.checkoutUrl, 'appall://compra');

      // Si cerró el navegador sin volver, el ticket existe y pudo haberse pagado:
      // se va igual a la confirmación como 'pending' y ella lo resuelve preguntando.
      // Flow vuelve siempre con `pending` (W-251): la confirmación pregunta el estado real.
      let status: 'success' | 'failure' | 'pending' = 'pending';
      if (resultado.type === 'success' && resultado.url) {
        const s = new URL(resultado.url).searchParams.get('status');
        if (s === 'success' || s === 'failure' || s === 'pending') status = s;
      }

      // navigate y no replace: ConfirmacionCompra tiene getId por `ref` (spec 114),
      // así el retorno que además llega por el linking cae en la misma pantalla.
      navigation.navigate('ConfirmacionCompra', {
        eventoId: evento.id,
        ticketId: pago.ticketId ?? undefined,
        ref: pago.ticketRef ?? undefined,
        status,
      });
      setStep('idle');
    } catch (err) {
      console.error('Error al comprar:', err);
      // A un Text y no a Alert.alert, que no hace nada en el build web (spec 137).
      setErrorCompra(mensajeErrorPago(err));
      // La pasarela se apagó con la pantalla abierta: releer quita el botón que solo
      // puede volver a fallar.
      if (err instanceof ErrorPago && err.codigo === 'pasarela_inactiva') {
        setRecargaPasarelas((n) => n + 1);
      }
      setStep('idle');
    } finally {
      setLoading(false);
      setPasarelaEnCurso(null);
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

  const handleBotonComprar = (pasarela: Pasarela) => {
    if (cancelado) return;
    if (user) {
      handleComprarLogueado(pasarela);
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

        {hayCompra && tenantEvento && !ventaCerrada && (
          <OptInWhatsApp
            tenantTipo={tenantEvento.tipo}
            tenantId={tenantEvento.id}
            etiqueta={`Avísame por WhatsApp de los próximos eventos de ${tenantEvento.nombre}`}
            valor={optIn}
            onCambiar={setOptIn}
          />
        )}

        {/* El monto del botón es solo lo que se muestra: lo que se cobra lo decide
            el servidor con la preventa vigente (create-preference). */}
        {!monto || cancelado || ventaCerrada || opciones.length === 1 ? (
          <TouchableOpacity
            style={[styles.botonComprar, (!monto || cancelado || ventaCerrada) && styles.botonDesactivado]}
            onPress={() => handleBotonComprar(opciones[0])}
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
        ) : (
          // Spec 160 — un botón por pasarela en el orden de `pasarelas_cobro`; el primero
          // es el sugerido (W-190). Sin monto en el texto: ya está en PrecioEvento.
          <View style={styles.listaPasarelas}>
            {opciones.map((p, i) => (
              <TouchableOpacity
                key={p}
                style={[i === 0 ? styles.botonComprar : styles.botonPasarelaSecundaria, styles.botonEnLista]}
                onPress={() => handleBotonComprar(p)}
                disabled={step === 'comprando'}
              >
                <Text style={i === 0 ? styles.textoBotonComprar : styles.textoBotonPasarelaSecundaria}>
                  {pasarelaEnCurso === p ? 'Procesando...' : `Pagar con ${NOMBRE_PASARELA[p]}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {errorCompra && <Text style={styles.errorCompra}>{errorCompra}</Text>}
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
            {/* Spec 157 — solo con Pro y las redes encendidas: sin Pro sería un botón que
                no lleva a nada que se pueda hacer en la app. */}
            {redesHabilitado && redesDisponibles.length > 0 && (
              <TouchableOpacity
                style={styles.botonGestion}
                onPress={() => navigation.navigate('PublicarRedes', { eventoId: evento.id })}
              >
                <Text style={styles.textoBotonGestion}>📣 Publicar en redes</Text>
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
            {/* Spec 059/060 — borrar es solo del owner: events_delete ya no acepta
                can_delete de un colaborador, RLS lo rechazaría igual.
                Spec 143 — y solo de un cancelado (W-047). */}
            {permisos.rol === 'owner' && cancelado && (
              <TouchableOpacity
                style={[styles.botonGestion, styles.botonPeligro]}
                onPress={handleBorrar}
                disabled={gestionando}
              >
                <Text style={[styles.textoBotonGestion, styles.textoBotonPeligro]}>🗑️ Borrar</Text>
              </TouchableOpacity>
            )}
          </View>
          {permisos.rol === 'owner' && !cancelado && tenantEvento && (
            <AvisarWhatsApp eventoId={evento.id} tenant={tenantEvento} />
          )}
          {errorGestion && <Text style={styles.errorGestion}>{errorGestion}</Text>}
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
  // Spec 160 — selector de pasarelas: el margen superior lo pone la lista.
  listaPasarelas: { marginTop: spacing.lg, gap: spacing.sm },
  botonEnLista: { marginTop: 0 },
  botonPasarelaSecundaria: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.accent,
    padding: 16,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  textoBotonPasarelaSecundaria: {
    color: colors.accent,
    fontWeight: 'bold',
    fontSize: fontSize.md,
  },
  errorCompra: { fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.sm },
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
  errorGestion: { fontSize: fontSize.sm, color: colors.danger, marginTop: spacing.sm },
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