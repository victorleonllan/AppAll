import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, ScrollView, Image, ActivityIndicator, Alert,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { usePerfilMusico } from '../hooks/useMusicos';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { useSolicitudes, contrapartesConSolicitudViva } from '../hooks/useSolicitudes';
import { useConexiones, musicosYaConectados } from '../hooks/useConexiones';
import ModalSolicitud from '../components/ModalSolicitud';
import BotonSeguir from '../components/BotonSeguir';
import OptInWhatsApp from '../components/OptInWhatsApp';
import { useTelefonoPropio } from '../hooks/useOptInWhatsApp';
import { MENSAJES_SOLICITUD } from '../constants/solicitudes';
import { etiquetaPais } from '../constants/paises';
import { TIPO_PROYECTO_LABEL } from '../lib/profiles';
import { colors, spacing, borderRadius, fontSize } from '../theme';

type ParamList = {
  VerMusico: { musicoId: string };
};

export default function VerMusicoScreen() {
  const route = useRoute<RouteProp<ParamList, 'VerMusico'>>();
  const { musicoId } = route.params;
  // Spec 122 — el perfil real desde `profiles` (spec 121), no el mock.
  const { musico, loading, error } = usePerfilMusico(musicoId);

  // Spec 132 — «Solicitar»/«Conectar» desde la ficha: en la app es donde el
  // local decide. Los hooks se llaman siempre; quién mira decide cuál se usa.
  const { user, role } = useAuth();
  const { allVenues } = useVenues();
  const sol = useSolicitudes();
  const con = useConexiones();
  const [modalVisible, setModalVisible] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const telefonoPropio = useTelefonoPropio();

  const userId = user?.id ?? null;
  const miVenueId = allVenues.find((v) => v.ownerId === userId)?.id ?? null;
  // Sin sesión o mi propia ficha → nada; músico → conexión; dueño de local → bolo; fan → nada.
  const modo: 'conexion' | 'bolo' | null =
    !userId || userId === musicoId
      ? null
      : role === 'musician'
        ? 'conexion'
        : miVenueId
          ? 'bolo'
          : null;

  const enviar = async ({ note, proposedAt }: { note: string | null; proposedAt: string | null }) => {
    if (!userId || !modo) return;
    try {
      if (modo === 'conexion') {
        await con.crear({ toMusician: musicoId, note });
      } else {
        await sol.crear({ musicianId: musicoId, venueId: miVenueId!, proposedAt, note });
      }
      setEnviado(true);
      setModalVisible(false);
      Alert.alert('Solicitud enviada');
    } catch (err: any) {
      Alert.alert('No se pudo enviar', err?.message ?? '');
      throw err;
    }
  };

  const botonSolicitud = () => {
    if (!modo) return null;
    let label: string;
    let habilitado = false;
    if (modo === 'conexion') {
      const estado = musicosYaConectados(con.conexiones).get(musicoId);
      if (estado === 'accepted') label = 'Conectado';
      else if (estado === 'pending' || enviado) label = 'Pendiente';
      else {
        label = 'Conectar';
        habilitado = true;
      }
    } else if (enviado || contrapartesConSolicitudViva(sol.solicitudes, 'musician').has(musicoId)) {
      label = 'Solicitud enviada';
    } else {
      label = 'Solicitar';
      habilitado = true;
    }
    return (
      <TouchableOpacity
        style={[styles.botonSolicitud, !habilitado && styles.botonSolicitudDeshabilitado]}
        onPress={() => setModalVisible(true)}
        disabled={!habilitado}
      >
        <Text style={[styles.textoBotonSolicitud, !habilitado && styles.textoBotonDeshabilitado]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.aviso}>No se pudo cargar el perfil.</Text>
      </View>
    );
  }

  // `null` cubre también el perfil que la RLS no deja ver (spec 020).
  if (!musico) {
    return (
      <View style={styles.container}>
        <Text style={styles.aviso}>Músico no encontrado</Text>
      </View>
    );
  }

  const imagen = musico.foto ?? musico.avatar;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {imagen && <Image source={{ uri: imagen }} style={styles.imagen} resizeMode="cover" />}
      <View style={styles.card}>
        {/* Spec 124 — seguir, a la derecha del nombre (no aparece en el perfil propio). */}
        <View style={styles.filaNombre}>
          <Text style={styles.nombre}>{musico.nombre}</Text>
          <BotonSeguir tipo="musico" targetId={musico.id} />
        </View>
        <Text style={styles.genero}>
          {[
            musico.tipoProyecto ? TIPO_PROYECTO_LABEL[musico.tipoProyecto] : null,
            musico.ciudad,
            musico.pais ? etiquetaPais(musico.pais) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {/* Spec 156 — mismas reglas que la ficha del local. */}
        <OptInWhatsApp tenantTipo="musician" tenantId={musico.id} telefonoInicial={telefonoPropio} />

        <View style={styles.separador} />

        <Text style={styles.bio}>{musico.bio}</Text>

        {/* Spec 030: los datos con los que un local decide contratar.
            `!!x` en vez de `x` en cada gate: con 0 (p.ej. "0 integrantes")
            `x && <Text>` deja pasar el 0 y React lo renderiza como texto "0". */}
        {!!(musico.integrantes || musico.duracionShow || musico.generos?.length) && (
          <View style={styles.datosFila}>
            {!!musico.integrantes && (
              <Text style={styles.dato}>👥 {musico.integrantes} integrante{musico.integrantes === 1 ? '' : 's'}</Text>
            )}
            {!!musico.duracionShow && <Text style={styles.dato}>⏱ {musico.duracionShow} min</Text>}
            {musico.generos && musico.generos.length > 0 && (
              <Text style={styles.dato}>🎼 {musico.generos.join(', ')}</Text>
            )}
          </View>
        )}

        {musico.riderTecnico && (
          <View style={styles.rider}>
            <Text style={styles.riderTitulo}>Rider técnico</Text>
            <Text style={styles.bio}>{musico.riderTecnico}</Text>
          </View>
        )}

        <View style={styles.separador} />

        {musico.telefono && <Text style={styles.contacto}>📞 {musico.telefono}</Text>}
        {musico.emailContacto && <Text style={styles.contacto}>✉️ {musico.emailContacto}</Text>}

        {musico.instagram && (
          <TouchableOpacity onPress={() => Linking.openURL(`https://instagram.com/${musico.instagram!.replace('@', '')}`)}>
            <Text style={styles.enlace}>📷 Instagram: {musico.instagram}</Text>
          </TouchableOpacity>
        )}

        {musico.spotify && (
          <TouchableOpacity onPress={() => Linking.openURL(musico.spotify!)}>
            <Text style={styles.enlace}>🎵 Spotify: {musico.spotify}</Text>
          </TouchableOpacity>
        )}

        {musico.youtube && (
          <TouchableOpacity onPress={() => Linking.openURL(musico.youtube!)}>
            <Text style={styles.enlace}>📺 YouTube: {musico.youtube}</Text>
          </TouchableOpacity>
        )}

        {musico.tiktok && (
          <TouchableOpacity onPress={() => Linking.openURL(musico.tiktok!)}>
            <Text style={styles.enlace}>🎬 TikTok: {musico.tiktok}</Text>
          </TouchableOpacity>
        )}

        {musico.sitioWeb && (
          <TouchableOpacity onPress={() => Linking.openURL(musico.sitioWeb!)}>
            <Text style={styles.enlace}>🌐 {musico.sitioWeb}</Text>
          </TouchableOpacity>
        )}

        {botonSolicitud()}
      </View>

      {modo && (
        <ModalSolicitud
          visible={modalVisible}
          destino={musico.nombre}
          mensajeInicial={modo === 'conexion' ? MENSAJES_SOLICITUD.musicoAlMusico : MENSAJES_SOLICITUD.localAlMusico}
          titulo={modo === 'conexion' ? 'Conectar con' : undefined}
          mostrarFecha={modo === 'bolo'}
          onCancelar={() => setModalVisible(false)}
          onEnviar={enviar}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  imagen: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  filaNombre: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nombre: {
    flex: 1,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.primary,
  },
  genero: {
    fontSize: fontSize.md,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  separador: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  bio: {
    fontSize: fontSize.md,
    color: colors.secondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  datosFila: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  dato: { fontSize: fontSize.sm, color: colors.secondary },
  rider: { marginBottom: spacing.md },
  riderTitulo: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary, marginBottom: spacing.xs },
  contacto: { fontSize: fontSize.md, color: colors.secondary, marginTop: spacing.xs },
  enlace: {
    fontSize: fontSize.md,
    color: colors.accent,
    textDecorationLine: 'underline',
    marginTop: spacing.sm,
  },
  botonSolicitud: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  botonSolicitudDeshabilitado: { backgroundColor: colors.border },
  textoBotonSolicitud: { color: colors.white, fontWeight: '600', fontSize: fontSize.md },
  textoBotonDeshabilitado: { color: colors.secondary },
  aviso: {
    fontSize: fontSize.md,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 40,
  },
});
