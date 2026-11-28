import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRoute, RouteProp, useNavigation, NavigationProp } from '@react-navigation/native';
import { usePerfilMusico } from '../hooks/useMusicos';
import { useProximosEventos } from '../hooks/useProximosEventos';
import { bloqueFecha, lineaEvento, redesDelPerfil } from '../lib/perfil';
import { RootTabParamList } from '../navigation/linking';
import { useAuth } from '../context/AuthContext';
import { useVenues } from '../context/VenuesContext';
import { useSolicitudes, contrapartesConSolicitudViva } from '../hooks/useSolicitudes';
import { useConexiones, musicosYaConectados } from '../hooks/useConexiones';
import ModalSolicitud from '../components/ModalSolicitud';
import BotonSeguir from '../components/BotonSeguir';
import OptInWhatsApp from '../components/OptInWhatsApp';
import Muro from '../components/Muro';
import PortadaEncuadrada from '../components/PortadaEncuadrada';
import { PUNTO_CENTRO } from '../lib/portada';
import { useEsAdmin } from '../hooks/useEsAdmin';
import { useTelefonoPropio } from '../hooks/useOptInWhatsApp';
import { MENSAJES_SOLICITUD } from '../constants/solicitudes';
import { etiquetaPais } from '../constants/paises';
import { TIPO_PROYECTO_LABEL } from '../lib/profiles';
import { spacing, borderRadius, fontSize, Paleta } from '../theme';
import { useEstilos } from '../hooks/useEstilos';
import { useTema } from '../context/TemaContext';

type ParamList = {
  VerMusico: { musicoId: string };
};

export default function VerMusicoScreen() {
  const styles = useEstilos(crearEstilos);
  const { colores } = useTema();
  const route = useRoute<RouteProp<ParamList, 'VerMusico'>>();
  const { musicoId } = route.params;
  // Spec 122 — el perfil real desde `profiles` (spec 121), no el mock.
  const { musico, loading, error } = usePerfilMusico(musicoId);
  // Spec 202 — la agenda de la banda; la primera también se destaca sobre el muro.
  const proximos = useProximosEventos('musician', musico?.id, 3);
  const navigation = useNavigation();

  // Spec 132 — «Solicitar»/«Conectar» desde la ficha: en la app es donde el
  // local decide. Los hooks se llaman siempre; quién mira decide cuál se usa.
  const { user, role } = useAuth();
  const { esAdmin } = useEsAdmin();
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
        <ActivityIndicator color={colores.accent} style={{ marginTop: 40 }} />
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
  const redes = redesDelPerfil(musico, 'musician');

  // Mismo salto que en la ficha del local: `VerMusico` vive en un stack dentro del Tab.
  const verEvento = (eventoId: string) =>
    navigation.getParent<NavigationProp<RootTabParamList>>()
      ?.navigate('Cartelera', { screen: 'DetalleEvento', params: { eventoId } });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Spec 201 — el punto es de la foto: si la ficha cae al avatar, va centrado. */}
      {imagen && (
        <PortadaEncuadrada uri={imagen} punto={musico.foto ? musico.portada : PUNTO_CENTRO} style={styles.imagen} />
      )}
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

        {redes.length > 0 && (
          <View style={styles.redes}>
            <Text style={styles.redesTitulo}>Redes</Text>
            <View style={styles.redesFila}>
              {redes.map((red) => (
                <TouchableOpacity key={red.id} style={styles.pildora} onPress={() => Linking.openURL(red.href)}>
                  <Text style={styles.textoPildora}>{red.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {botonSolicitud()}
      </View>

      {/* Spec 202 — sin lista (error o vacía) no hay sección: un «sin eventos» falso engaña. */}
      {proximos.cargando && !proximos.eventos?.length ? (
        <ActivityIndicator color={colores.accent} style={styles.cargandoProximos} />
      ) : proximos.eventos?.length ? (
        <>
          <Text style={styles.seccion}>Próximos eventos</Text>
          <View style={styles.proximos}>
            {proximos.eventos.map((e) => {
              const fecha = bloqueFecha(e.comienzaAt);
              const linea = lineaEvento(e);
              return (
                <TouchableOpacity key={e.id} style={styles.evento} onPress={() => verEvento(e.id)}>
                  {fecha && (
                    <View style={styles.bloqueFecha}>
                      <Text style={styles.bloqueTexto}>{fecha.dia}</Text>
                      <Text style={styles.bloqueNumero}>{fecha.num}</Text>
                      <Text style={styles.bloqueTexto}>{fecha.mes}</Text>
                    </View>
                  )}
                  <View style={styles.eventoDatos}>
                    <Text style={styles.eventoArtista}>{e.artista}</Text>
                    {!!e.venueName && <Text style={styles.eventoVenue}>{e.venueName}</Text>}
                    {!!linea && <Text style={styles.eventoLinea}>{linea}</Text>}
                  </View>
                  <Text style={styles.flecha}>›</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}

      {/* Spec 187 — el muro de la banda: correos publicados y flyers de eventos pasados. */}
      <Muro
        tipo="musician"
        id={musico.id}
        nombreTenant={musico.nombre}
        puedeModerar={(!!user && user.id === musico.id) || esAdmin}
        destacado={proximos.eventos?.[0] ?? null}
        onVerEvento={verEvento}
      />

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

const crearEstilos = (c: Paleta) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: spacing.md },
  card: {
    backgroundColor: c.cardBackground,
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
    color: c.primary,
  },
  genero: {
    fontSize: fontSize.md,
    color: c.secondary,
    marginTop: spacing.xs,
  },
  separador: {
    height: 1,
    backgroundColor: c.border,
    marginVertical: spacing.md,
  },
  bio: {
    fontSize: fontSize.md,
    color: c.secondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  datosFila: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  dato: { fontSize: fontSize.sm, color: c.secondary },
  rider: { marginBottom: spacing.md },
  riderTitulo: { fontSize: fontSize.sm, fontWeight: '600', color: c.primary, marginBottom: spacing.xs },
  contacto: { fontSize: fontSize.md, color: c.secondary, marginTop: spacing.xs },
  redes: { marginTop: spacing.md },
  redesTitulo: { fontSize: fontSize.sm, fontWeight: '600', color: c.primary, marginBottom: spacing.xs },
  redesFila: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pildora: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  textoPildora: { fontSize: fontSize.sm, color: c.accent },
  cargandoProximos: { marginTop: spacing.lg },
  seccion: { fontSize: fontSize.lg, fontWeight: 'bold', color: c.primary, marginTop: spacing.lg, marginBottom: spacing.sm },
  proximos: {
    backgroundColor: c.cardBackground,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  evento: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  bloqueFecha: {
    alignItems: 'center',
    minWidth: 52,
    paddingVertical: spacing.xs,
    backgroundColor: c.highlightBg,
    borderWidth: 1,
    borderColor: c.highlightBorder,
    borderRadius: borderRadius.sm,
  },
  bloqueTexto: { fontSize: fontSize.xs, color: c.highlightText },
  bloqueNumero: { fontSize: fontSize.xl, fontWeight: 'bold', color: c.highlightText },
  eventoDatos: { flex: 1 },
  eventoArtista: { fontSize: fontSize.md, fontWeight: 'bold', color: c.primary },
  eventoVenue: { fontSize: fontSize.sm, color: c.secondary },
  eventoLinea: { fontSize: fontSize.sm, color: c.muted },
  flecha: { fontSize: fontSize.lg, color: c.muted },
  botonSolicitud: {
    backgroundColor: c.accent,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  botonSolicitudDeshabilitado: { backgroundColor: c.border },
  textoBotonSolicitud: { color: c.onAccent, fontWeight: '600', fontSize: fontSize.md },
  textoBotonDeshabilitado: { color: c.secondary },
  aviso: {
    fontSize: fontSize.md,
    color: c.muted,
    textAlign: 'center',
    marginTop: 40,
  },
});
