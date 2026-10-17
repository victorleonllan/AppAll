import { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { useSolicitudes, contrapartesConSolicitudViva, SolicitudBolo } from '../hooks/useSolicitudes';
import { useConexiones, musicosYaConectados } from '../hooks/useConexiones';
import { useMusicos } from '../hooks/useMusicos';
import ModalSolicitud from '../components/ModalSolicitud';
import { MENSAJES_SOLICITUD } from '../constants/solicitudes';
import { TIPO_PROYECTO_LABEL } from '../lib/profiles';
import { venueEmoji, venueLabel } from '../lib/venues';
import { colors, spacing, borderRadius, fontSize } from '../theme';
import { PerfilMusico, Venue } from '../types';

// Montada en MusicoStack y MiLocalStack: cada una navega solo a la ruta de su stack.
type NavigationProp = NativeStackNavigationProp<{ EditarLocal: undefined; EditarPerfilBanda: undefined }>;

type Pestana = 'solicitudes' | 'musicos' | 'locales';

const PESTANAS: { key: Pestana; label: string }[] = [
  { key: 'solicitudes', label: 'Solicitudes' },
  { key: 'musicos', label: 'Músicos' },
  { key: 'locales', label: 'Locales' },
];

const ETIQUETA_ESTADO: Record<SolicitudBolo['status'], string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  declined: 'Rechazada',
  cancelled: 'Cancelada',
};

// A quién va el modal abierto: un músico (bolo desde el local o conexión entre
// músicos) o un local (bolo desde el músico).
type Destino =
  | { tipo: 'musico'; item: PerfilMusico; conexion: boolean }
  | { tipo: 'local'; item: Venue };

/**
 * Spec 132 — equivalente a PanelConexiones.js de la web (W-034, W-055, W-057,
 * W-060). Reemplaza la pantalla provisoria del spec 114.
 */
export default function SolicitudesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, role } = useAuth();
  // No se compara contra el literal del rol local: el spec 048 lo cambia.
  const lado: 'musico' | 'local' = role === 'musician' ? 'musico' : 'local';

  const sol = useSolicitudes();
  // Se llama siempre por las reglas de los hooks; para el local se ignora.
  const con = useConexiones();
  // Sin país: una solicitud no se esconde por país (W-206).
  const mus = useMusicos();
  const { allVenues, loading: cargandoVenues, error: errorVenues, refresh: refrescarVenues } = useVenues();

  const [pestana, setPestana] = useState<Pestana>('solicitudes');
  const [busqueda, setBusqueda] = useState('');
  const [destino, setDestino] = useState<Destino | null>(null);
  // Ids enviados en esta sesión: el botón cambia antes de que llegue la recarga.
  const [enviados, setEnviados] = useState<Set<string>>(new Set());

  const userId = user?.id ?? null;
  const miVenueId = allVenues.find((v) => v.ownerId === userId)?.id ?? null;

  const conectados = useMemo(() => musicosYaConectados(con.conexiones), [con.conexiones]);
  const conexionesRecibidas = useMemo(
    () => con.conexiones.filter((c) => c.status === 'pending' && !c.propuseYo),
    [con.conexiones],
  );
  const musicosConSolicitud = useMemo(
    () => contrapartesConSolicitudViva(sol.solicitudes, 'musician'),
    [sol.solicitudes],
  );
  const localesConSolicitud = useMemo(
    () => contrapartesConSolicitudViva(sol.solicitudes, 'venue'),
    [sol.solicitudes],
  );

  const texto = busqueda.trim().toLowerCase();
  const musicosFiltrados = mus.musicos.filter(
    (m) => m.id !== userId && (!texto || m.nombre.toLowerCase().includes(texto)),
  );
  const localesFiltrados = allVenues.filter(
    (v) => v.id !== miVenueId && (!texto || v.name.toLowerCase().includes(texto)),
  );

  const cambiarPestana = (p: Pestana) => {
    setPestana(p);
    setBusqueda('');
  };

  const responderSolicitud = async (id: string, status: 'accepted' | 'declined') => {
    try {
      await sol.responder(id, status);
    } catch (err: any) {
      Alert.alert('No se pudo responder', err?.message ?? '');
    }
  };

  const cancelarSolicitud = async (id: string) => {
    try {
      await sol.cancelar(id);
    } catch (err: any) {
      Alert.alert('No se pudo cancelar', err?.message ?? '');
    }
  };

  const responderConexion = async (id: string, status: 'accepted' | 'declined') => {
    try {
      await con.responder(id, status);
    } catch (err: any) {
      Alert.alert('No se pudo responder', err?.message ?? '');
    }
  };

  const enviar = async ({ note, proposedAt }: { note: string | null; proposedAt: string | null }) => {
    if (!destino || !userId) return;
    try {
      if (destino.tipo === 'musico' && destino.conexion) {
        await con.crear({ toMusician: destino.item.id, note });
      } else {
        await sol.crear({
          musicianId: destino.tipo === 'musico' ? destino.item.id : userId,
          venueId: destino.tipo === 'musico' ? miVenueId! : destino.item.id,
          proposedAt,
          note,
        });
      }
      const id = destino.item.id;
      setEnviados((prev) => new Set(prev).add(id));
      setDestino(null);
      Alert.alert('Solicitud enviada');
    } catch (err: any) {
      Alert.alert('No se pudo enviar', err?.message ?? '');
      throw err;
    }
  };

  // ── Carga ────────────────────────────────────────────────────────────────
  const cargando =
    sol.cargando || (lado === 'musico' && con.cargando) || mus.loading || cargandoVenues;
  const fallo: { error: string; refrescar: () => Promise<void> } | null = sol.error
    ? { error: sol.error, refrescar: sol.refrescar }
    : lado === 'musico' && con.error
      ? { error: con.error, refrescar: con.refrescar }
      : mus.error
        ? { error: mus.error, refrescar: mus.refrescar }
        : errorVenues
          ? { error: errorVenues, refrescar: refrescarVenues }
          : null;

  // ── Tarjetas ─────────────────────────────────────────────────────────────
  const renderSolicitud = ({ item: s }: { item: SolicitudBolo }) => {
    const contraparte = (s.musicianId === userId ? s.venueNombre : s.musicoNombre) ?? '—';
    const fecha = s.proposedAt
      ? new Date(s.proposedAt).toLocaleString('es-CL')
      : 'Sin fecha propuesta';
    return (
      <View style={styles.card}>
        <Text style={styles.nombre}>{contraparte}</Text>
        <Text style={styles.detalle}>
          {fecha}
          {s.genre ? ` · ${s.genre}` : ''}
        </Text>
        {!!s.note && <Text style={styles.nota}>{s.note}</Text>}
        <View style={styles.acciones}>
          {s.status === 'pending' && !s.propuseYo && (
            <>
              <BotonSecundario label="Rechazar" onPress={() => responderSolicitud(s.id, 'declined')} />
              <BotonPrimario label="Aceptar" onPress={() => responderSolicitud(s.id, 'accepted')} />
            </>
          )}
          {s.status === 'pending' && s.propuseYo && (
            <BotonSecundario label="Cancelar" peligro onPress={() => cancelarSolicitud(s.id)} />
          )}
          {s.status !== 'pending' && <Text style={styles.estado}>{ETIQUETA_ESTADO[s.status]}</Text>}
        </View>
      </View>
    );
  };

  const botonMusico = (m: PerfilMusico) => {
    if (lado === 'musico') {
      const estado = conectados.get(m.id);
      if (estado === 'accepted') return <BotonPrimario label="Conectado" deshabilitado />;
      if (estado === 'pending' || enviados.has(m.id)) return <BotonPrimario label="Pendiente" deshabilitado />;
      return (
        <BotonPrimario
          label="Conectar"
          onPress={() => setDestino({ tipo: 'musico', item: m, conexion: true })}
        />
      );
    }
    if (!miVenueId) return null;
    if (musicosConSolicitud.has(m.id) || enviados.has(m.id)) {
      return <BotonPrimario label="Solicitud enviada" deshabilitado />;
    }
    return (
      <BotonPrimario
        label="Solicitar"
        onPress={() => setDestino({ tipo: 'musico', item: m, conexion: false })}
      />
    );
  };

  const renderMusico = ({ item: m }: { item: PerfilMusico }) => (
    <View style={styles.card}>
      <Text style={styles.nombre}>{m.nombre}</Text>
      <Text style={styles.detalle}>
        {[m.tipoProyecto ? TIPO_PROYECTO_LABEL[m.tipoProyecto] : null, m.ciudad].filter(Boolean).join(' · ')}
      </Text>
      <View style={styles.acciones}>{botonMusico(m)}</View>
    </View>
  );

  const renderLocal = ({ item: v }: { item: Venue }) => (
    <View style={styles.card}>
      <Text style={styles.nombre}>{v.name}</Text>
      <Text style={styles.detalle}>
        {venueEmoji(v.type)} {venueLabel(v.type)}
        {v.comuna ? ` · ${v.comuna}` : ''}
      </Text>
      {/* booking_requests es solo músico ↔ local: el local mira sin botón. */}
      {lado === 'musico' && (
        <View style={styles.acciones}>
          {localesConSolicitud.has(v.id) || enviados.has(v.id) ? (
            <BotonPrimario label="Solicitud enviada" deshabilitado />
          ) : (
            <BotonPrimario label="Solicitar" onPress={() => setDestino({ tipo: 'local', item: v })} />
          )}
        </View>
      )}
    </View>
  );

  // ── Contenido por pestaña ────────────────────────────────────────────────
  const buscador = (
    <TextInput
      style={styles.buscador}
      value={busqueda}
      onChangeText={setBusqueda}
      placeholder="Buscar por nombre"
      placeholderTextColor={colors.muted}
      autoCapitalize="none"
    />
  );

  const contenido = () => {
    if (cargando) return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;
    if (fallo) {
      return (
        <View style={styles.vacio}>
          <Text style={styles.textoVacio}>{fallo.error}</Text>
          <BotonPrimario label="Reintentar" onPress={() => fallo.refrescar()} />
        </View>
      );
    }

    if (pestana === 'solicitudes') {
      return (
        <FlatList
          data={sol.solicitudes}
          keyExtractor={(s) => s.id}
          renderItem={renderSolicitud}
          contentContainerStyle={styles.lista}
          ListEmptyComponent={<Text style={styles.textoVacio}>Todavía no hay solicitudes.</Text>}
        />
      );
    }

    if (pestana === 'musicos') {
      const cabecera = (
        <>
          {buscador}
          {lado === 'local' && !miVenueId && (
            <View style={styles.aviso}>
              <Text style={styles.textoAviso}>
                Para solicitarle a un músico necesitas tener la ficha de tu local creada.
              </Text>
              <BotonPrimario label="Crear mi local" onPress={() => navigation.navigate('EditarLocal')} />
            </View>
          )}
          {lado === 'musico' && conexionesRecibidas.length > 0 && (
            <View style={styles.seccion}>
              <Text style={styles.tituloSeccion}>Te quieren conectar</Text>
              {conexionesRecibidas.map((c) => (
                <View key={c.id} style={styles.card}>
                  <Text style={styles.nombre}>{c.otroNombre ?? '—'}</Text>
                  {!!c.note && <Text style={styles.nota}>{c.note}</Text>}
                  <View style={styles.acciones}>
                    <BotonSecundario label="Rechazar" onPress={() => responderConexion(c.id, 'declined')} />
                    <BotonPrimario label="Aceptar" onPress={() => responderConexion(c.id, 'accepted')} />
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      );
      return (
        <FlatList
          data={musicosFiltrados}
          keyExtractor={(m) => m.id}
          renderItem={renderMusico}
          contentContainerStyle={styles.lista}
          ListHeaderComponent={cabecera}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.textoVacio}>No hay músicos.</Text>}
        />
      );
    }

    const cabeceraLocales = (
      <>
        {buscador}
        {lado === 'musico' && (
          <View style={styles.aviso}>
            <Text style={styles.textoAviso}>
              Un local decide con lo que ve en tu perfil. Completa el tuyo antes de escribirle.
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('EditarPerfilBanda')}>
              <Text style={styles.enlace}>Completar mi perfil</Text>
            </TouchableOpacity>
          </View>
        )}
      </>
    );
    return (
      <FlatList
        data={localesFiltrados}
        keyExtractor={(v) => v.id}
        renderItem={renderLocal}
        contentContainerStyle={styles.lista}
        ListHeaderComponent={cabeceraLocales}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.textoVacio}>No hay locales.</Text>}
      />
    );
  };

  // ── Modal ────────────────────────────────────────────────────────────────
  const modal = (() => {
    if (!destino) return { destino: '', mensaje: '', titulo: undefined, mostrarFecha: true };
    if (destino.tipo === 'local') {
      return { destino: destino.item.name, mensaje: MENSAJES_SOLICITUD.musicoAlLocal, titulo: undefined, mostrarFecha: true };
    }
    if (destino.conexion) {
      return { destino: destino.item.nombre, mensaje: MENSAJES_SOLICITUD.musicoAlMusico, titulo: 'Conectar con', mostrarFecha: false };
    }
    return { destino: destino.item.nombre, mensaje: MENSAJES_SOLICITUD.localAlMusico, titulo: undefined, mostrarFecha: true };
  })();

  return (
    <View style={styles.container}>
      <View style={styles.pestanas}>
        {PESTANAS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.pestana, pestana === p.key && styles.pestanaActiva]}
            onPress={() => cambiarPestana(p.key)}
          >
            <Text style={[styles.textoPestana, pestana === p.key && styles.textoPestanaActiva]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {contenido()}

      <ModalSolicitud
        visible={!!destino}
        destino={modal.destino}
        mensajeInicial={modal.mensaje}
        titulo={modal.titulo}
        mostrarFecha={modal.mostrarFecha}
        onCancelar={() => setDestino(null)}
        onEnviar={enviar}
      />
    </View>
  );
}

function BotonPrimario({ label, onPress, deshabilitado }: { label: string; onPress?: () => void; deshabilitado?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.boton, styles.botonPrimario, deshabilitado && styles.botonDeshabilitado]}
      onPress={onPress}
      disabled={deshabilitado || !onPress}
    >
      <Text style={[styles.textoBoton, styles.textoPrimario, deshabilitado && styles.textoDeshabilitado]}>{label}</Text>
    </TouchableOpacity>
  );
}

function BotonSecundario({ label, onPress, peligro }: { label: string; onPress: () => void; peligro?: boolean }) {
  return (
    <TouchableOpacity style={[styles.boton, styles.botonSecundario]} onPress={onPress}>
      <Text style={[styles.textoBoton, { color: peligro ? colors.danger : colors.secondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pestanas: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  pestana: { flex: 1, paddingVertical: spacing.md, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  pestanaActiva: { borderBottomColor: colors.accent },
  textoPestana: { fontSize: fontSize.md, color: colors.muted, fontWeight: '600' },
  textoPestanaActiva: { color: colors.accent },
  lista: { padding: spacing.md, gap: spacing.sm },
  buscador: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: fontSize.md,
    color: colors.primary,
    backgroundColor: colors.cardBackground,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  nombre: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary },
  detalle: { fontSize: fontSize.sm, color: colors.secondary, marginTop: spacing.xs },
  nota: { fontSize: fontSize.sm, color: colors.secondary, marginTop: spacing.xs, fontStyle: 'italic' },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  estado: { fontSize: fontSize.sm, color: colors.muted, fontWeight: '600' },
  seccion: { marginBottom: spacing.md },
  tituloSeccion: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.primary, marginBottom: spacing.sm },
  aviso: {
    backgroundColor: colors.accentLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  textoAviso: { fontSize: fontSize.sm, color: colors.secondary },
  enlace: { fontSize: fontSize.sm, color: colors.accent, textDecorationLine: 'underline', fontWeight: '600' },
  vacio: { alignItems: 'center', marginTop: 40, gap: spacing.md, padding: spacing.md },
  textoVacio: { fontSize: fontSize.md, color: colors.muted, textAlign: 'center', marginTop: spacing.lg },
  boton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, alignItems: 'center' },
  botonPrimario: { backgroundColor: colors.accent },
  botonSecundario: { borderWidth: 1, borderColor: colors.border },
  botonDeshabilitado: { backgroundColor: colors.border },
  textoBoton: { fontSize: fontSize.sm, fontWeight: '600' },
  textoPrimario: { color: colors.white },
  textoDeshabilitado: { color: colors.secondary },
});
