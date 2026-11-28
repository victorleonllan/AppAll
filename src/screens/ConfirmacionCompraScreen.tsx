import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEventos } from '../context/EventosContext';
import { useAuth } from '../context/AuthContext';
import TalonEntrada from '../components/TalonEntrada';
import type { EntradaPropia, EventoDeEntrada } from '../hooks/useMisEntradas';
import { PAISES, PAIS_POR_DEFECTO } from '../constants/paises';
import { CarteleraStackParamList } from '../navigation/CarteleraStack';
import { Evento, TicketItemStatus, TicketStatus } from '../types';
import { supabase } from '../lib/supabase';
import { etiquetaDeEspecial, getPackDeTicket } from '../lib/especiales';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

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
/** Spec 126 — la compra termina donde termina en la web: mostrando la entrada. */
const REDIRECT_EXITO_MS = 8000;

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

type EntradaTicket = Omit<EntradaPropia, 'evento'>;

/**
 * Spec 207 — las entradas de un ticket del usuario, por folio ascendente. `[]` si no hay
 * sesión, si el ticket es de otra persona o si falla. Nunca lanza: el correo y Mis entradas
 * siguen siendo el respaldo.
 */
async function leerEntradasDelTicket(ticketId: string, userId: string): Promise<EntradaTicket[]> {
  try {
    // El filtro por dueño es obligatorio: ti_select es un OR con el equipo del evento, y sin
    // él un músico vería QR ajenos (mismo motivo que useMisEntradas).
    const { data, error } = await supabase
      .from('ticket_items')
      .select('id, ticket_id, evento_id, folio, qr_token, status, redeemed_at, ticket:tickets!inner(user_id)')
      .eq('ticket_id', ticketId)
      .eq('ticket.user_id', userId)
      .order('folio', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      eventoId: r.evento_id,
      folio: r.folio,
      qrToken: r.qr_token,
      status: r.status as TicketItemStatus,
      redeemedAt: r.redeemed_at,
    }));
  } catch (err) {
    console.error('No se pudieron leer las entradas del ticket:', err);
    return [];
  }
}

/**
 * Spec 207 — «Vie 27 nov» en el huso del país del evento; `""` sin fecha. Se arma desde las
 * partes y no desde el texto formateado, que trae coma y, según el ICU, puntos.
 */
function fechaCortaEn(comienzaAt: string | null | undefined, zona: string): string {
  if (!comienzaAt) return '';
  try {
    const partes = new Intl.DateTimeFormat('es-CL', {
      timeZone: zona,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).formatToParts(new Date(comienzaAt));
    const parte = (tipo: string) =>
      (partes.find((p) => p.type === tipo)?.value ?? '').replace(/\./g, '').toLowerCase();
    const semana = parte('weekday');
    return `${semana.charAt(0).toUpperCase()}${semana.slice(1)} ${parte('day')} ${parte('month')}`;
  } catch {
    // Fecha ilegible o motor sin `formatToParts`: la pantalla deja la línea de siempre.
    return '';
  }
}

/**
 * Spec 207 — en orden de folio, la entrada 0 es del comprador y la `i` es de otra persona si
 * existe `destinatariosExtra[i - 1]` (W-258). Esas no se dibujan: un QR ajeno bajo «muéstrala
 * en la puerta» invita a usarlo dos veces.
 */
function entradasDelComprador<T>(entradas: T[], destinatariosExtra: string[]): T[] {
  return entradas.filter((_, i) => i === 0 || !destinatariosExtra[i - 1]);
}

function eventoDeEntrada(evento: Evento): EventoDeEntrada {
  return {
    id: evento.id,
    artista: evento.artista,
    venueId: evento.venueId,
    venueName: evento.venueName,
    imagen: evento.imagen,
    fecha: evento.fecha,
    hora: evento.hora,
    comienzaAt: evento.comienzaAt ?? null,
    genero: evento.genero || null,
    status: evento.status ?? 'published',
    pais: evento.pais,
  };
}

// Spec 177 — función de la paleta y no objeto fijo: un objeto de módulo no seguiría el tema.
const estadosCompra = (c: Paleta): Record<VistaStatus, { icon: keyof typeof Ionicons.glyphMap; color: string; titulo: string; mensaje: string }> => ({
  success: {
    icon: 'checkmark-circle',
    color: c.success,
    titulo: 'Compra exitosa!',
    mensaje: 'Tu entrada ha sido confirmada. Te esperamos en el evento.',
  },
  failure: {
    icon: 'close-circle',
    color: c.dangerText,
    titulo: 'Compra no completada',
    mensaje: 'El pago no pudo procesarse. Intenta nuevamente.',
  },
  pending: {
    icon: 'time',
    color: c.warningText,
    titulo: 'Pago pendiente',
    mensaje: 'El pago esta siendo procesado. La pantalla se actualizara automaticamente cuando se confirme.',
  },
  timeout: {
    icon: 'help-circle',
    color: c.warningText,
    titulo: 'Sin confirmacion todavia',
    mensaje: 'Mercado Pago aun no confirma el pago. Si ya pagaste, tu entrada se registrara igual: puedes revisarla mas tarde en tus entradas.',
  },
});

export default function ConfirmacionCompraScreen() {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const config = useMemo(() => estadosCompra(colores), [colores]);
  const route = useRoute<ConfirmacionRoute>();
  const navigation = useNavigation<NavProp>();
  const { eventos } = useEventos();
  const { user, loading: cargandoSesion } = useAuth();
  const userId = user?.id;
  const insets = useSafeAreaInsets();

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
  // Se corta si el usuario toca «Ver mis entradas» antes: sin doble navegación.
  const redirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const irAMisEntradas = useCallback(() => {
    if (redirectRef.current) clearTimeout(redirectRef.current);
    redirectRef.current = null;
    // MisEntradas vive en este mismo stack (spec 114): replace, para que «atrás»
    // no vuelva a la confirmación.
    navigation.replace('MisEntradas');
  }, [navigation]);

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

  // Spec 166 — con qué pack se compró y a quién se mandó cada entrada. Una sola consulta
  // al aprobarse: el pack no cambia mientras se espera el pago (`Confirmacion.js:162-165`).
  const [pack, setPack] = useState<Awaited<ReturnType<typeof getPackDeTicket>> | null>(null);
  // Spec 207 — se guardan a la vez que el pack: sin los destinatarios, se dibujaría un
  // instante el QR de una entrada que es de otra persona.
  const [entradas, setEntradas] = useState<EntradaTicket[]>([]);
  const [entradasLeidas, setEntradasLeidas] = useState(false);
  const packPedido = useRef(false);
  useEffect(() => {
    // Con la app recién abierta la sesión puede no estar leída todavía, y la lectura es única.
    if (actualStatus !== 'success' || !idTicket || cargandoSesion || packPedido.current) return;
    packPedido.current = true;
    // Spec 207 (addenda) — con `success` de la back_url el ticket puede seguir sin emitir:
    // se espera a `confirm-payment` antes de leer.
    const emision = status === 'success' ? pedirConfirmacion({ ticket_id: idTicket }) : Promise.resolve(null);
    // Sin cancelación: con el candado, cancelar dejaría el pack sin pedir si el efecto
    // se desmonta y remonta (StrictMode en el build web).
    emision
      .then(() =>
        Promise.all([
          getPackDeTicket(idTicket),
          userId ? leerEntradasDelTicket(idTicket, userId) : Promise.resolve([]),
        ]),
      )
      .then(([p, leidas]) => {
        setPack(p);
        setEntradas(leidas);
        setEntradasLeidas(true);
      });
  }, [actualStatus, idTicket, cargandoSesion, userId, status]);

  const talones = entradasDelComprador(entradas, pack?.destinatariosExtra ?? []);
  const conTalones = actualStatus === 'success' && talones.length > 0;
  // Sin ticket que leer (compra como invitado que llega solo con `ref`) no habrá lectura.
  const sinTalones = (entradasLeidas || (!idTicket && !resolviendo)) && talones.length === 0;

  // Spec 126, acotado por el 207: el redirect queda de respaldo para cuando no hay talón.
  useEffect(() => {
    if (actualStatus !== 'success' || !sinTalones) return;
    redirectRef.current = setTimeout(irAMisEntradas, REDIRECT_EXITO_MS);
    return () => {
      if (redirectRef.current) clearTimeout(redirectRef.current);
      redirectRef.current = null;
    };
  }, [actualStatus, sinTalones, irAMisEntradas]);

  let mensaje = cfg.mensaje;
  if (conTalones) {
    mensaje =
      talones.length === 1
        ? 'Tu entrada está confirmada. Muéstrala en la puerta desde aquí o desde tu correo.'
        : 'Tus entradas están confirmadas. Muéstralas en la puerta desde aquí o desde tu correo.';
  }

  const fechaCorta = evento
    ? fechaCortaEn(evento.comienzaAt, PAISES[evento.pais]?.zonaHoraria ?? PAISES[PAIS_POR_DEFECTO].zonaHoraria)
    : '';

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
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={[
        styles.container,
        { paddingTop: spacing.lg + insets.top, paddingBottom: spacing.lg + insets.bottom },
      ]}
    >
      <Ionicons name={cfg.icon} size={72} color={cfg.color} />
      <Text style={[styles.titulo, { color: cfg.color }]}>{cfg.titulo}</Text>
      <Text style={styles.mensaje}>{mensaje}</Text>

      {evento && (
        <View style={styles.eventoInfo}>
          <Text style={styles.eventoNombre}>{evento.artista}</Text>
          <Text style={styles.eventoDetalle}>
            {fechaCorta
              ? `${fechaCorta} · ${evento.hora} · ${evento.venueName}`
              : `${evento.venueName} · ${evento.fecha} · ${evento.hora}`}
          </Text>
          {pack?.especial && (
            <Text style={styles.eventoDetalle}>
              {pack.cantidad} entradas · Pack {etiquetaDeEspecial(pack.especial)}
            </Text>
          )}
          {pack?.destinatariosExtra.map((correo, k) => (
            <Text key={correo + k} style={styles.eventoDetalle}>
              Enviamos la entrada {k + 2} a <Text style={styles.correoDestinatario}>{correo}</Text>
            </Text>
          ))}
        </View>
      )}

      {conTalones && (
        <View style={styles.talones}>
          {talones.map((entrada) => (
            <TalonEntrada
              key={entrada.id}
              entrada={{ ...entrada, evento: evento ? eventoDeEntrada(evento) : null }}
            />
          ))}
        </View>
      )}

      {conTalones && !!user?.email && (
        <View style={styles.avisoCorreo}>
          <Ionicons name="mail-outline" size={20} color={colores.primary} />
          <Text style={styles.textoAviso}>
            También te la mandamos a {user.email}. Si cierras esta pantalla, la encuentras en Mis
            entradas.
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
          <TouchableOpacity style={styles.boton} onPress={irAMisEntradas}>
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
    </ScrollView>
  );
}

const crearEstilos = (c: Paleta) => StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: c.background },
  container: {
    flexGrow: 1,
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
    color: c.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  eventoInfo: {
    backgroundColor: c.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  eventoNombre: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: c.primary,
  },
  eventoDetalle: {
    fontSize: fontSize.sm,
    color: c.muted,
    marginTop: spacing.xs,
  },
  correoDestinatario: { fontWeight: 'bold', color: c.primary },
  talones: { width: '100%', maxWidth: 420, marginTop: spacing.lg, gap: spacing.md },
  avisoCorreo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
    maxWidth: 420,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: c.highlightBg,
    borderWidth: 1,
    borderColor: c.highlightBorder,
    borderRadius: borderRadius.md,
  },
  textoAviso: { flex: 1, fontSize: fontSize.sm, color: c.primary, lineHeight: 20 },
  pollingIndicator: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: c.warningBg,
    borderRadius: borderRadius.sm,
  },
  pollingText: {
    fontSize: fontSize.sm,
    color: c.warningText,
    fontWeight: '500',
  },
  boton: {
    backgroundColor: c.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xl,
  },
  botonSecundario: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: c.accent,
    marginTop: spacing.lg,
  },
  textoBoton: { color: c.onAccent, fontWeight: 'bold', fontSize: fontSize.md },
  textoBotonSecundario: { color: c.accent, fontWeight: 'bold', fontSize: fontSize.md },
});