import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform,
  ActivityIndicator,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../context/AuthContext';
import { useEventos } from '../context/EventosContext';
import { useEventoPermisos } from '../hooks/useEventoPermisos';
import { useCanjeEntrada, ColorResultado } from '../hooks/useCanjeEntrada';
import { colors, spacing, borderRadius, fontSize } from '../theme';

/** Cuánto queda el resultado en pantalla antes de volver sola a la cámara. */
const ESPERA_MS: Record<ColorResultado, number> = {
  // Un 'ok' no se discute: el portero ya lo leyó de reojo por el color.
  verde: 2000,
  // Un rechazo sí se discute, y el dato que lo resuelve —la hora del ingreso
  // anterior— hay que alcanzar a leerlo. Se puede cerrar antes tocando.
  rojo: 4000,
  naranja: 4000,
};

const FONDO: Record<ColorResultado, string> = {
  verde: colors.success,
  rojo: colors.danger,
  naranja: colors.warning,
};

/**
 * ¿Puede esta plataforma leer un QR con la cámara? En nativo, siempre. En web,
 * `expo-camera` delega en `BarcodeDetector`, que no está en todos los
 * navegadores — y la app se demuestra en web, así que hay que saberlo antes de
 * la puerta y no durante.
 */
const ESCANEO_DISPONIBLE =
  Platform.OS !== 'web' || typeof (globalThis as any).BarcodeDetector !== 'undefined';

/**
 * La cámara en web exige contexto seguro. Producción (Vercel) lo es y
 * `localhost` está exento por especificación, pero abrir el dev server por IP de
 * red —`http://192.168.x.x:8081`, que es como se prueba desde el teléfono contra
 * el Mac— no da acceso a la cámara. No es un bug de la app; decirlo acá evita un
 * diagnóstico perdido.
 */
function contextoInseguroWeb(): boolean {
  if (Platform.OS !== 'web') return false;
  const loc = (globalThis as any).location;
  if (!loc) return false;
  const local = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
  return loc.protocol !== 'https:' && !local;
}

/**
 * Spec 041 — un archivo, montado en `MusicoStack`, `MiLocalStack` y
 * `CarteleraStack` con el mismo nombre de ruta. No hay una versión de banda y
 * otra de local porque no hay nada que diferenciar: quien autoriza es
 * `can_edit_event(evento_id)` dentro del RPC (spec 040), que pregunta por el
 * equipo del evento y no por el rol de la persona.
 */
export default function EscanerQRScreen() {
  const route = useRoute();
  const params = (route.params ?? {}) as { eventoId?: string };
  const { user } = useAuth();
  const { eventos, misColaboraciones } = useEventos();

  const [eventoElegido, setEventoElegido] = useState<string | undefined>(params.eventoId);
  const [folioTexto, setFolioTexto] = useState('');

  const permisos = useEventoPermisos(eventoElegido);
  const { procesando, ultimo, canjeados, error, canjearToken, canjearFolio, limpiar } =
    useCanjeEntrada(eventoElegido);
  const [permiso, pedirPermiso] = useCameraPermissions();

  const evento = eventos.find((e) => e.id === eventoElegido);

  // Mis eventos de hoy en adelante. `misColaboraciones` ya viene cargado desde
  // el spec 033; el fallback por `createdBy` es el mismo que usa
  // useEventoPermisos para no romper si la migración del 033 no está aplicada.
  const misEventosProximos = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    const idsEquipo = new Set(misColaboraciones.map((c) => c.eventId));
    return eventos
      .filter((e) => (idsEquipo.has(e.id) || (user && e.createdBy === user.id)))
      .filter((e) => e.fecha >= hoy && e.status !== 'cancelled')
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [eventos, misColaboraciones, user]);

  // Si se vuelve a entrar con otro evento sin que la pantalla se desmonte
  // (react-navigation reusa la ruta), el estado inicial quedaría pegado al
  // evento anterior — y escanear contra el show equivocado es exactamente lo
  // que el selector existe para evitar.
  useEffect(() => {
    if (params.eventoId) setEventoElegido(params.eventoId);
  }, [params.eventoId]);

  // Vuelve sola a la cámara: un botón "siguiente" son dos toques por persona en
  // una fila de cincuenta.
  useEffect(() => {
    if (!ultimo) return;
    const id = setTimeout(limpiar, ESPERA_MS[ultimo.color]);
    return () => clearTimeout(id);
  }, [ultimo, limpiar]);

  // ── Sin evento elegido: el selector ────────────────────────────────────────
  if (!eventoElegido) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.titulo}>¿De qué evento son las entradas?</Text>
          <Text style={styles.ayuda}>
            El escáner rechaza entradas de otros eventos, así que elegir bien acá evita
            dejar entrar a alguien con la entrada del show equivocado.
          </Text>
        </View>

        <View style={styles.card}>
          {misEventosProximos.length === 0 ? (
            <Text style={styles.vacio}>
              No tienes eventos de hoy en adelante. El escáner se abre desde el evento.
            </Text>
          ) : (
            misEventosProximos.map((e) => (
              <TouchableOpacity
                key={e.id}
                style={styles.filaEvento}
                onPress={() => setEventoElegido(e.id)}
              >
                <View style={styles.datosEvento}>
                  <Text style={styles.eventoArtista}>{e.artista}</Text>
                  <Text style={styles.eventoDetalle}>{e.venueName} · {e.fecha} {e.hora}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    );
  }

  // Defensa en profundidad, no la defensa: quien autoriza de verdad es
  // `can_edit_event()` dentro del RPC. Esto solo evita abrir una cámara que no
  // va a poder canjear nada.
  if (!permisos.puedeEditar) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTexto}>No eres del equipo de este evento</Text>
      </View>
    );
  }

  const camaraLista = Boolean(permiso?.granted) && ESCANEO_DISPONIBLE && !contextoInseguroWeb();
  const folio = Number.parseInt(folioTexto, 10);
  const folioValido = Number.isInteger(folio) && folio > 0;

  return (
    <View style={styles.container}>
      <View style={styles.encabezado}>
        <View style={{ flex: 1 }}>
          <Text style={styles.encabezadoTitulo} numberOfLines={1}>
            {evento ? evento.artista : 'Evento'}
          </Text>
          <Text style={styles.encabezadoDetalle} numberOfLines={1}>
            {evento ? `${evento.venueName} · ${evento.fecha}` : ''}
          </Text>
        </View>
        {/* Solo cuando el evento se eligió acá: si vino fijado por params, se
            cambia volviendo por donde se entró. */}
        {!params.eventoId && (
          <TouchableOpacity onPress={() => setEventoElegido(undefined)}>
            <Text style={styles.cambiarEvento}>Cambiar</Text>
          </TouchableOpacity>
        )}
        {/* Lo que le falta al que está en la puerta y no puede mirar el dashboard. */}
        <View style={styles.contadorSesion}>
          <Text style={styles.contadorNumero}>{canjeados}</Text>
          <Text style={styles.contadorLabel}>canjeadas</Text>
        </View>
      </View>

      <View style={styles.camaraWrap}>
        {camaraLista ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            // Cortar el callback mientras hay resultado en pantalla o una
            // llamada en vuelo: la cámara lee varias veces por segundo.
            onBarcodeScanned={ultimo || procesando ? undefined : ({ data }) => canjearToken(data)}
          />
        ) : (
          <View style={styles.camaraOff}>
            {!ESCANEO_DISPONIBLE ? (
              <Text style={styles.camaraOffTexto}>
                Este navegador no puede leer códigos QR. Usa la entrada por folio de abajo.
              </Text>
            ) : contextoInseguroWeb() ? (
              <Text style={styles.camaraOffTexto}>
                La cámara del navegador solo funciona sobre HTTPS. Abre la app en
                app-all-lemon.vercel.app, o usa la entrada por folio.
              </Text>
            ) : permiso && !permiso.granted ? (
              <>
                <Text style={styles.camaraOffTexto}>
                  {permiso.canAskAgain
                    ? 'Sonópolis necesita la cámara para leer las entradas.'
                    : 'El permiso de cámara está denegado. Puedes canjear por folio igual.'}
                </Text>
                {permiso.canAskAgain && (
                  <TouchableOpacity style={styles.boton} onPress={pedirPermiso}>
                    <Text style={styles.textoBoton}>Permitir cámara</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <ActivityIndicator color={colors.white} />
            )}
          </View>
        )}
      </View>

      {/* Entrada manual: obligatoria, no un extra. En la puerta fallan cosas que
          no dependen de nosotros —permiso denegado, pantalla rota, QR impreso
          mal, navegador sin BarcodeDetector— y una puerta que solo funciona con
          cámara es una puerta que se cierra sola. Mismo camino de canje. */}
      <View style={styles.manual}>
        <Text style={styles.manualLabel}>Entrada por folio</Text>
        <View style={styles.manualFila}>
          <TextInput
            style={styles.manualInput}
            value={folioTexto}
            onChangeText={setFolioTexto}
            placeholder="007"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            editable={!procesando}
          />
          <TouchableOpacity
            style={[styles.botonManual, (!folioValido || procesando) && styles.botonDeshabilitado]}
            disabled={!folioValido || procesando}
            onPress={() => { canjearFolio(folio); setFolioTexto(''); }}
          >
            <Text style={styles.textoBoton}>Canjear</Text>
          </TouchableOpacity>
        </View>
        {error && <Text style={styles.errorInline}>{error}</Text>}
      </View>

      {ultimo && (
        <TouchableOpacity
          style={[styles.resultado, { backgroundColor: FONDO[ultimo.color] }]}
          activeOpacity={1}
          onPress={limpiar}
        >
          {ultimo.folio !== null && (
            <Text style={styles.resultadoFolio}>#{String(ultimo.folio).padStart(3, '0')}</Text>
          )}
          <Text style={styles.resultadoTitulo}>{ultimo.titulo}</Text>
          <Text style={styles.resultadoDetalle}>{ultimo.detalle}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  titulo: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.primary },
  ayuda: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm },
  vacio: { fontSize: fontSize.sm, color: colors.muted, fontStyle: 'italic' },
  filaEvento: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  datosEvento: { flex: 1 },
  eventoArtista: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  eventoDetalle: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: fontSize.lg, color: colors.muted, paddingLeft: spacing.sm },

  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  encabezadoTitulo: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary },
  encabezadoDetalle: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  cambiarEvento: { color: colors.accent, fontWeight: 'bold', fontSize: fontSize.sm, paddingHorizontal: spacing.sm },
  contadorSesion: { alignItems: 'center', paddingLeft: spacing.md },
  contadorNumero: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.accent },
  contadorLabel: { fontSize: fontSize.xs, color: colors.muted },

  camaraWrap: { flex: 1, backgroundColor: colors.primary, overflow: 'hidden' },
  camaraOff: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  camaraOffTexto: {
    color: colors.white,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },

  manual: {
    padding: spacing.md,
    backgroundColor: colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  manualLabel: { fontSize: fontSize.xs, color: colors.muted, marginBottom: spacing.sm },
  manualFila: { flexDirection: 'row', alignItems: 'center' },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontFamily: 'monospace',
    fontSize: fontSize.md,
    color: colors.primary,
    marginRight: spacing.sm,
  },
  botonManual: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: borderRadius.sm,
  },
  botonDeshabilitado: { opacity: 0.4 },
  boton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: borderRadius.sm,
    marginTop: spacing.md,
  },
  textoBoton: { color: colors.white, fontWeight: 'bold', fontSize: fontSize.md },
  errorInline: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.sm },

  // El resultado ocupa la pantalla entera: el color se lee de reojo, la palabra no.
  resultado: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  resultadoFolio: {
    fontFamily: 'monospace',
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
    color: colors.white,
  },
  resultadoTitulo: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.white,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  resultadoDetalle: {
    fontSize: fontSize.md,
    color: colors.white,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorTexto: {
    fontSize: fontSize.md,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: spacing.lg,
  },
});
